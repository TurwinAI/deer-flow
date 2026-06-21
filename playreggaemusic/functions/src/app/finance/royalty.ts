/**
 * Split + royalty engine (P2B05, F7) — PURE, integer-cent-exact.
 *
 * Given a release's `ownershipSplits` (from `getRights`; a non-empty set must
 * sum to 100) and the gross total of its RevenueEvents, compute each payee's
 * gross share so that:
 *
 *   Σ (payee shares) === total          — NO cents lost, NO cents created.
 *
 * Naive `floor(total * percent / 100)` loses the remainder cents (e.g. 100¢ split
 * three ways → 33+33+33 = 99, one cent vanishes). We use LARGEST-REMAINDER
 * (Hamilton) allocation: floor each share, then hand the leftover cents one at a
 * time to the payees with the largest fractional remainders (ties broken by
 * input order, deterministically). The sum is always exactly `total`.
 *
 * Recoupment is then applied AGAINST one designated artist-payee's gross share
 * BEFORE net payout: the outstanding advance is recouped from that share only,
 * up to the available amount, never negative — leftover advance carries (see
 * recoupment.ts). Other payees' shares are unaffected.
 *
 * This module is PURE (no Firestore, no network) and exhaustively unit-tested.
 *
 * Application layer: imports only app/* types (Split) + the pure recoupment
 * helper. No harness, no I/O.
 */
import type { Split } from "../label/index";
import { computeRecoupment, type RecoupmentAccount } from "./recoupment";

/** A computed gross share for one payee. Integer cents. */
export interface PayeeShare {
  payee: string;
  /** The payee's percent of the split (carried through for reference). */
  percent: number;
  /** Integer-cent gross share; Σ over all payees === total. */
  grossCents: number;
}

/**
 * Split `totalCents` across `splits` using largest-remainder allocation so the
 * shares sum EXACTLY to `totalCents` (no lost/created cents). Requires a
 * non-empty split set summing to 100. Negative totals are rejected.
 *
 * Algorithm:
 *   1. raw_i   = totalCents * percent_i / 100  (rational)
 *   2. base_i  = floor(raw_i); remainder_i = raw_i - base_i
 *   3. leftover = totalCents - Σ base_i  (an integer in [0, n))
 *   4. give one extra cent to the `leftover` payees with the largest
 *      remainder_i (ties → earlier input index), deterministically.
 */
export function splitCents(totalCents: number, splits: ReadonlyArray<Split>): PayeeShare[] {
  if (!Number.isInteger(totalCents)) {
    throw new Error(`totalCents must be an integer (got ${totalCents}).`);
  }
  if (totalCents < 0) {
    throw new Error(`totalCents must be non-negative (got ${totalCents}).`);
  }
  if (splits.length === 0) {
    throw new Error("Cannot split revenue with no ownership splits.");
  }
  const percentSum = splits.reduce((acc, s) => acc + s.percent, 0);
  if (Math.abs(percentSum - 100) > 1e-9) {
    throw new Error(`Ownership splits must sum to 100 (got ${percentSum}).`);
  }

  // Work in a common integer scale to keep the remainder comparison exact:
  // scaledShare_i = totalCents * percent_i, base_i = floor(scaledShare_i / 100).
  // Percentages may be fractional (e.g. 33.33); multiply by 100 to integerise
  // the percent, then the denominator is 10000.
  const DENOM = 10000;
  const scaledNumerators = splits.map((s) => totalCents * Math.round(s.percent * 100));
  const base = scaledNumerators.map((n) => Math.floor(n / DENOM));
  const remainders = scaledNumerators.map((n, i) => n - base[i] * DENOM);

  const allocated = base.reduce((acc, b) => acc + b, 0);
  let leftover = totalCents - allocated;

  // Distribute leftover cents to the largest remainders (stable on index).
  const order = remainders
    .map((rem, index) => ({ rem, index }))
    .sort((a, b) => (b.rem - a.rem) || (a.index - b.index));

  const shareCents = base.slice();
  for (let k = 0; k < order.length && leftover > 0; k += 1) {
    shareCents[order[k].index] += 1;
    leftover -= 1;
  }

  return splits.map((s, i) => ({
    payee: s.payee,
    percent: s.percent,
    grossCents: shareCents[i],
  }));
}

/** A payee's line after recoupment (only the recouped payee differs from gross). */
export interface RoyaltyLine {
  payee: string;
  percent: number;
  /** Gross share before recoupment. */
  grossCents: number;
  /** Recoupment applied against THIS payee's share (0 unless the recouped artist). */
  recoupmentAppliedCents: number;
  /** Net payable = grossCents - recoupmentAppliedCents (never negative). */
  netCents: number;
}

/** Result of the royalty computation for a release's revenue. */
export interface RoyaltyComputation {
  totalGrossCents: number;
  lines: RoyaltyLine[];
  /** Total recoupment applied across all lines (only the recouped payee). */
  recoupmentAppliedCents: number;
  /** Net across all payees = totalGross - recoupmentApplied. */
  totalNetCents: number;
  /** The recoupment account AFTER applying (when a recoupment payee was given). */
  account?: RecoupmentAccount;
}

/** Options for {@link computeRoyalties}. */
export interface ComputeRoyaltiesOptions {
  /**
   * The payee name in `splits` that maps to the recouping artist. Recoupment is
   * applied ONLY against this payee's gross share. When omitted (or not found in
   * the splits), no recoupment is applied — every line nets to its gross.
   */
  recoupPayee?: string;
  /** The recouping artist's account (advance/recouped). Required to recoup. */
  account?: RecoupmentAccount;
}

/**
 * Compute per-payee gross shares (cent-exact) and apply recoupment against the
 * designated artist-payee's share BEFORE net payout.
 *
 * Guarantees:
 *   - Σ grossCents === totalGrossCents (largest-remainder; no lost/created cents),
 *   - recoupment is applied to AT MOST one payee (the `recoupPayee`),
 *   - that payee's net = gross - recouped, never negative,
 *   - totalNet = totalGross - recoupmentApplied,
 *   - leftover advance carries in the returned `account`.
 */
export function computeRoyalties(
  totalGrossCents: number,
  splits: ReadonlyArray<Split>,
  options: ComputeRoyaltiesOptions = {},
): RoyaltyComputation {
  const shares = splitCents(totalGrossCents, splits);
  const totalGross = shares.reduce((acc, s) => acc + s.grossCents, 0);

  let recoupmentAppliedCents = 0;
  let account: RecoupmentAccount | undefined;

  const lines: RoyaltyLine[] = shares.map((s) => {
    const isRecoupPayee =
      options.recoupPayee !== undefined &&
      options.account !== undefined &&
      s.payee === options.recoupPayee;
    if (isRecoupPayee && options.account) {
      const computation = computeRecoupment(options.account, s.grossCents);
      recoupmentAppliedCents += computation.recoupedCents;
      account = computation.account;
      return {
        payee: s.payee,
        percent: s.percent,
        grossCents: s.grossCents,
        recoupmentAppliedCents: computation.recoupedCents,
        netCents: computation.remainingCents,
      };
    }
    return {
      payee: s.payee,
      percent: s.percent,
      grossCents: s.grossCents,
      recoupmentAppliedCents: 0,
      netCents: s.grossCents,
    };
  });

  const totalNetCents = lines.reduce((acc, l) => acc + l.netCents, 0);
  return {
    totalGrossCents: totalGross,
    lines,
    recoupmentAppliedCents,
    totalNetCents,
    account,
  };
}
