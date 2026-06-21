/**
 * Recoupment accounting (P2B05, F7) — per-artist advance/cost ledger.
 *
 * Before an artist nets a royalty payout, a label first RECOUPS the advances and
 * recoupable costs it fronted. Each artist has one account
 * `recoupment/{artistId} = { artistId, advanceCents, recoupedCents }` in the
 * admin-only `recoupment` collection (firestore.rules denies all client access;
 * the admin SDK bypasses rules).
 *
 *   - `outstandingCents = advanceCents - recoupedCents` (never negative),
 *   - `recordAdvance` / `recordCost` ADD to the recoupable balance,
 *   - `applyRecoupment(artistId, availableCents)` recoups up to the outstanding
 *     balance from the amount available, returns how much was recouped, and
 *     persists the increased `recoupedCents`. It NEVER recoups more than is
 *     outstanding and NEVER drives the balance negative.
 *
 * All amounts are integer cents. The pure helpers ({@link computeRecoupment})
 * are exhaustively unit-tested without an emulator; the persisted helpers run
 * against the emulator.
 *
 * Application layer: MAY import harness/* (getDb).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";

const RECOUPMENT = "recoupment";

/**
 * An artist's recoupment account. `advanceCents` is the total recoupable amount
 * fronted (advances + recoupable costs); `recoupedCents` is how much has been
 * recouped from royalties so far. Both are non-negative integer cents and
 * `recoupedCents <= advanceCents`.
 */
export interface RecoupmentAccount {
  artistId: string;
  advanceCents: number;
  recoupedCents: number;
}

/** The outstanding (still-to-recoup) balance for an account. Never negative. */
export function outstandingCents(account: RecoupmentAccount): number {
  return Math.max(0, account.advanceCents - account.recoupedCents);
}

/** Result of computing a recoupment against an available amount (pure). */
export interface RecoupmentComputation {
  /** How much was recouped (0 ≤ recouped ≤ min(available, outstanding)). */
  recoupedCents: number;
  /** What remains of the available amount after recoupment (the net). */
  remainingCents: number;
  /** The new account state after applying the recoupment. */
  account: RecoupmentAccount;
}

/**
 * PURE recoupment math. Given an account and an `availableCents` amount (e.g. an
 * artist's gross royalty share), recoup as much of the OUTSTANDING balance as
 * the available amount allows:
 *   recouped   = min(available, outstanding)   (clamped ≥ 0)
 *   remaining  = available - recouped          (the net, never negative)
 *   account.recoupedCents += recouped          (never exceeds advanceCents)
 *
 * Negative `availableCents` is treated as 0 (nothing to recoup against). No
 * floats — integer cents throughout.
 */
export function computeRecoupment(
  account: RecoupmentAccount,
  availableCents: number,
): RecoupmentComputation {
  const available = Math.max(0, Math.trunc(availableCents));
  const outstanding = outstandingCents(account);
  const recoupedCents = Math.min(available, outstanding);
  const remainingCents = available - recoupedCents;
  return {
    recoupedCents,
    remainingCents,
    account: {
      ...account,
      recoupedCents: account.recoupedCents + recoupedCents,
    },
  };
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

/**
 * Read an artist's recoupment account, defaulting to a zeroed account when none
 * exists yet (so callers always get a usable account). Admin SDK.
 */
export async function getRecoupmentAccount(
  artistId: string,
  store?: Firestore,
): Promise<RecoupmentAccount> {
  const snap = await db(store).collection(RECOUPMENT).doc(artistId).get();
  if (!snap.exists) {
    return { artistId, advanceCents: 0, recoupedCents: 0 };
  }
  return snap.data() as RecoupmentAccount;
}

/** Persist (set-with-id) a recoupment account. Idempotent on artistId. */
async function putAccount(account: RecoupmentAccount, store?: Firestore): Promise<RecoupmentAccount> {
  await db(store).collection(RECOUPMENT).doc(account.artistId).set({ ...account });
  return account;
}

/**
 * Add a recoupable advance (or cost) to an artist's account. Adds to
 * `advanceCents`, increasing the outstanding balance. The amount must be a
 * positive integer number of cents.
 */
export async function recordAdvance(
  artistId: string,
  amountCents: number,
  store?: Firestore,
): Promise<RecoupmentAccount> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`Advance amount must be a positive integer of cents (got ${amountCents}).`);
  }
  const account = await getRecoupmentAccount(artistId, store);
  return putAccount(
    { ...account, advanceCents: account.advanceCents + amountCents },
    store,
  );
}

/**
 * Record a recoupable cost against an artist (same effect on the ledger as an
 * advance — it increases the recoupable balance). Separate name for clarity at
 * call sites.
 */
export async function recordCost(
  artistId: string,
  amountCents: number,
  store?: Firestore,
): Promise<RecoupmentAccount> {
  return recordAdvance(artistId, amountCents, store);
}

/**
 * Apply recoupment against an `availableCents` amount for an artist and PERSIST
 * the increased `recoupedCents`. Returns the computation (recouped, remaining
 * net, new account). Recoups up to the outstanding balance only; never negative;
 * leftover advance carries (recoupedCents stays ≤ advanceCents).
 */
export async function applyRecoupment(
  artistId: string,
  availableCents: number,
  store?: Firestore,
): Promise<RecoupmentComputation> {
  const account = await getRecoupmentAccount(artistId, store);
  const computation = computeRecoupment(account, availableCents);
  if (computation.recoupedCents > 0) {
    await putAccount(computation.account, store);
  }
  return computation;
}
