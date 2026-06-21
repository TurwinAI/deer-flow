/**
 * Royalty statements (P2B05, F7) — per-artist, per-period accounting.
 *
 * `generateStatement(artistId, period)` builds a {@link RoyaltyStatement} for an
 * artist over a period and stores it in the admin-only `royalty_statements`
 * collection (firestore.rules denies all client access). A statement:
 *   1. finds the artist's releases (label store),
 *   2. gathers the period's stored RevenueEvents attributed to those releases,
 *   3. for each release, splits its gross via the release's ownershipSplits
 *      (cent-exact), taking the share that belongs to THIS artist's payee,
 *   4. applies the artist's recoupment account against the summed artist share,
 *   5. reconciles: gross - deductions - recoupment === net.
 *
 * Reconciliation is the load-bearing invariant: the stored totals always satisfy
 * `grossCents - deductionsCents - recoupmentAppliedCents === netCents`, and
 * `revenueBySource` totals sum to `grossCents`.
 *
 * The artist's payee name in a release's splits defaults to the artist's display
 * `name` (matching how splits are authored, e.g. seed splits use "Roots Untold")
 * and can be overridden. `deductionsCents` is a flat, optional fee deduction
 * passed by the caller (e.g. a distribution fee) — recoupment is separate.
 *
 * Application layer: MAY import harness/* (getDb) + app/* (label + finance).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";
import { getArtist, getRights, listReleasesByArtist } from "../label/store";
import {
  listRevenueEventsByRelease,
  type Period,
  type RevenueEvent,
  type RevenueSourceKind,
} from "./revenue";
import { computeRoyalties } from "./royalty";
import { getRecoupmentAccount, computeRecoupment } from "./recoupment";

const ROYALTY_STATEMENTS = "royalty_statements";

/** A single line on a statement: an artist's net from one release. */
export interface StatementLineItem {
  releaseId: string;
  /** The artist's gross share of this release's revenue (cent-exact). */
  grossCents: number;
  /** The currency of this release's revenue. */
  currency: string;
}

/** Gross revenue grouped by source kind (sums to the statement gross). */
export type RevenueBySource = Record<RevenueSourceKind, number>;

/**
 * A per-artist, per-period royalty statement. Stored in `royalty_statements`.
 * Totals reconcile: `grossCents - deductionsCents - recoupmentAppliedCents
 * === netCents`, and `revenueBySource` sums to `grossCents`.
 */
export interface RoyaltyStatement {
  id: string;
  artistId: string;
  period: Period;
  /** Artist gross share across all their releases (cent-exact). */
  grossCents: number;
  /** Flat deductions (fees) applied before recoupment. */
  deductionsCents: number;
  /** Recoupment applied against the post-deduction amount. */
  recoupmentAppliedCents: number;
  /** Net payable = gross - deductions - recoupment (never negative). */
  netCents: number;
  /** The artist's gross share split out by revenue source. Sums to grossCents. */
  revenueBySource: RevenueBySource;
  lineItems: StatementLineItem[];
  /** ISO-8601 time the statement was generated. */
  createdAt: string;
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/** Deterministic statement id from (artist, period). Idempotent regeneration. */
export function statementId(artistId: string, period: Period): string {
  return `${artistId}__${period}`;
}

/** Options for {@link generateStatement}. */
export interface GenerateStatementOptions {
  /**
   * Flat deductions (fees) to apply before recoupment, in integer cents.
   * Defaults to 0.
   */
  deductionsCents?: number;
  /**
   * The payee name in the releases' splits that maps to this artist. Defaults to
   * the artist's display name. Recoupment + the artist's share key off this.
   */
  payeeName?: string;
  /** Whether to PERSIST the artist's recoupment after applying it. Default true. */
  persistRecoupment?: boolean;
  store?: Firestore;
}

/** Empty per-source tally. */
function emptyBySource(): RevenueBySource {
  return { polar: 0, distributor: 0, pro: 0 };
}

/**
 * Generate (and store) a per-artist royalty statement for a period.
 *
 * For every release the artist owns a share of, the release's gross (sum of its
 * period revenue events) is split via its ownershipSplits and the artist's
 * payee share is taken — cent-exact, attributed back to the originating source
 * proportionally by that release's source breakdown. The artist's summed gross
 * share then has flat `deductionsCents` removed and the recoupment account
 * applied against the remainder. The result reconciles by construction.
 *
 * Throws if the artist is unknown. Releases with no revenue or no splits
 * contribute nothing. Persists to `royalty_statements/{artistId__period}`.
 */
export async function generateStatement(
  artistId: string,
  period: Period,
  options: GenerateStatementOptions = {},
): Promise<RoyaltyStatement> {
  const store = options.store;
  const artist = await getArtist(artistId, store);
  if (!artist) {
    throw new Error(`Unknown artist: ${artistId}`);
  }
  const payeeName = options.payeeName ?? artist.name;
  const deductionsCents = Math.max(0, Math.trunc(options.deductionsCents ?? 0));

  const releases = await listReleasesByArtist(artistId, store);

  const lineItems: StatementLineItem[] = [];
  const revenueBySource = emptyBySource();
  let grossCents = 0;
  let currency = "USD";

  for (const release of releases) {
    const rights = await getRights(release.id, store);
    if (!rights || rights.ownershipSplits.length === 0) {
      continue;
    }
    const events = await listRevenueEventsByRelease(release.id, store);
    const periodEvents = events.filter((e) => belongsToPeriod(e, period));
    if (periodEvents.length === 0) {
      continue;
    }
    // The release gross + its per-source breakdown.
    const releaseGross = periodEvents.reduce((acc, e) => acc + e.grossCents, 0);
    if (periodEvents[0]) {
      currency = periodEvents[0].currency;
    }

    // Split the release gross; take this artist's payee share (cent-exact).
    const computation = computeRoyalties(releaseGross, rights.ownershipSplits);
    const artistLine = computation.lines.find((l) => l.payee === payeeName);
    const artistGross = artistLine?.grossCents ?? 0;
    if (artistGross === 0) {
      continue;
    }

    // Attribute the artist's release share back to sources in proportion to the
    // release's own per-source gross — cent-exact so the per-source tally still
    // sums to the artist's release gross.
    const releaseBySource = perSourceGross(periodEvents);
    const artistBySource = allocateByProportion(artistGross, releaseGross, releaseBySource);
    for (const kind of SOURCE_KINDS) {
      revenueBySource[kind] += artistBySource[kind];
    }

    grossCents += artistGross;
    lineItems.push({ releaseId: release.id, grossCents: artistGross, currency });
  }

  // Apply flat deductions, then recoupment against the post-deduction amount.
  const afterDeductions = Math.max(0, grossCents - deductionsCents);
  const account = await getRecoupmentAccount(artistId, store);
  const recoupment = computeRecoupment(account, afterDeductions);
  const recoupmentAppliedCents = recoupment.recoupedCents;
  const netCents = afterDeductions - recoupmentAppliedCents;

  if ((options.persistRecoupment ?? true) && recoupmentAppliedCents > 0) {
    await db(store)
      .collection("recoupment")
      .doc(artistId)
      .set({ ...recoupment.account });
  }

  const statement: RoyaltyStatement = {
    id: statementId(artistId, period),
    artistId,
    period,
    grossCents,
    deductionsCents,
    recoupmentAppliedCents,
    netCents,
    revenueBySource,
    lineItems,
    createdAt: new Date().toISOString(),
  };

  await db(store)
    .collection(ROYALTY_STATEMENTS)
    .doc(statement.id)
    .set(pruneUndefined({ ...statement }));
  return statement;
}

const SOURCE_KINDS: ReadonlyArray<RevenueSourceKind> = ["polar", "distributor", "pro"];

/**
 * A revenue event belongs to a period when its stored id is scoped to that
 * period (fake DSP/PRO ids are `kind:period:local`) OR its occurredAt's
 * year/quarter/month prefix matches. Polar events (id `polar:<orderId>`) carry
 * no period in the id, so they are matched by `occurredAt` prefix. A bare period
 * that matches nothing is simply excluded.
 */
function belongsToPeriod(event: RevenueEvent, period: Period): boolean {
  if (event.id.includes(`:${period}:`)) {
    return true;
  }
  // Match a YYYY / YYYY-MM / YYYY-QN style prefix against occurredAt.
  if (event.occurredAt.startsWith(period)) {
    return true;
  }
  // Quarter form "YYYY-QN": map to its months.
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
  if (quarter) {
    const year = quarter[1];
    const q = Number(quarter[2]);
    const startMonth = (q - 1) * 3 + 1;
    for (let m = startMonth; m < startMonth + 3; m += 1) {
      const mm = String(m).padStart(2, "0");
      if (event.occurredAt.startsWith(`${year}-${mm}`)) {
        return true;
      }
    }
  }
  return false;
}

/** Per-source gross for a set of events. */
function perSourceGross(events: ReadonlyArray<RevenueEvent>): RevenueBySource {
  const out = emptyBySource();
  for (const e of events) {
    out[e.source] += e.grossCents;
  }
  return out;
}

/**
 * Allocate `amount` across the same source proportions as `bySource` (which sums
 * to `total`), cent-exact via largest-remainder so the allocation sums to
 * `amount` exactly. When `total` is 0 the allocation is all zero.
 */
function allocateByProportion(
  amount: number,
  total: number,
  bySource: RevenueBySource,
): RevenueBySource {
  const out = emptyBySource();
  if (total <= 0 || amount <= 0) {
    return out;
  }
  const bases = SOURCE_KINDS.map((k) => Math.floor((amount * bySource[k]) / total));
  const remainders = SOURCE_KINDS.map(
    (k, i) => amount * bySource[k] - bases[i] * total,
  );
  let leftover = amount - bases.reduce((a, b) => a + b, 0);
  const order = remainders
    .map((rem, index) => ({ rem, index }))
    .sort((a, b) => (b.rem - a.rem) || (a.index - b.index));
  const alloc = bases.slice();
  for (let k = 0; k < order.length && leftover > 0; k += 1) {
    alloc[order[k].index] += 1;
    leftover -= 1;
  }
  SOURCE_KINDS.forEach((kind, i) => {
    out[kind] = alloc[i];
  });
  return out;
}

/** Read a stored royalty statement by id (admin SDK). Returns null if absent. */
export async function getStatement(
  id: string,
  store?: Firestore,
): Promise<RoyaltyStatement | null> {
  const snap = await db(store).collection(ROYALTY_STATEMENTS).doc(id).get();
  return snap.exists ? (snap.data() as RoyaltyStatement) : null;
}

/** List all stored statements, optionally filtered to one artist (admin SDK). */
export async function listStatements(
  artistId?: string,
  store?: Firestore,
): Promise<RoyaltyStatement[]> {
  const coll = db(store).collection(ROYALTY_STATEMENTS);
  const snap = artistId ? await coll.where("artistId", "==", artistId).get() : await coll.get();
  return snap.docs.map((d) => d.data() as RoyaltyStatement);
}
