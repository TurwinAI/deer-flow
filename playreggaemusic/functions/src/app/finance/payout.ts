/**
 * Payout PROPOSALS (P2B05, F7) — propose only; NEVER move real money.
 *
 * A label pays an artist their statement net. In this build the system goes only
 * as far as PROPOSING a payout: `proposePayout(artistId, statementId)` writes a
 * `payouts/{id}` record with status "proposed" and amount = the statement's net.
 *
 * EXECUTING a payout is CONSEQUENTIAL and is gated by the P2B04 ApprovalGate via
 * the `initiate_payout` agent tool (registered in CONSEQUENTIAL_TOOLS), so it
 * cannot run without explicit human approval. Even once approved, there is NO
 * live payment rail: {@link executePayoutStub} is a DOCUMENTED STUB that records
 * the intent and requires operator-supplied creds at handoff. It moves no money.
 *
 * Application layer: MAY import harness/* (getDb) + app/* (finance statements).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";
import { getStatement } from "./statements";

const PAYOUTS = "payouts";

/** Lifecycle of a payout. v1 stops at "proposed"/"approved-stub". */
export type PayoutStatus = "proposed" | "executed-stub";

/**
 * A proposed payout to an artist for a statement. Admin-only (`payouts`
 * collection denies all client access). `amountCents` mirrors the statement net
 * at proposal time. NEVER carries live payment-rail identifiers.
 */
export interface Payout {
  id: string;
  artistId: string;
  statementId: string;
  amountCents: number;
  currency: string;
  status: PayoutStatus;
  createdAt: string;
  /** Set when the documented execute STUB runs (after approval). No money moved. */
  executedAt?: string;
  /** A human note recorded by the stub (e.g. "awaiting operator payment creds"). */
  note?: string;
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/** Deterministic payout id from a statement id. Idempotent re-proposal. */
export function payoutId(statementId: string): string {
  return `payout__${statementId}`;
}

/** Options for {@link proposePayout}. */
export interface ProposePayoutOptions {
  currency?: string;
  store?: Firestore;
}

/**
 * Propose a payout for an artist's statement. Reads the statement, mirrors its
 * net amount, and writes a `payouts/{id}` record with status "proposed". Throws
 * if the statement does not exist. Moves NO money — this is a proposal only.
 */
export async function proposePayout(
  artistId: string,
  statementId: string,
  options: ProposePayoutOptions = {},
): Promise<Payout> {
  const store = options.store;
  const statement = await getStatement(statementId, store);
  if (!statement) {
    throw new Error(`Unknown statement: ${statementId}`);
  }
  if (statement.artistId !== artistId) {
    throw new Error(
      `Statement ${statementId} belongs to ${statement.artistId}, not ${artistId}.`,
    );
  }
  const payout: Payout = {
    id: payoutId(statementId),
    artistId,
    statementId,
    amountCents: statement.netCents,
    currency: options.currency ?? "USD",
    status: "proposed",
    createdAt: new Date().toISOString(),
  };
  await db(store).collection(PAYOUTS).doc(payout.id).set(pruneUndefined({ ...payout }));
  return payout;
}

/** Read a payout by id (admin SDK). Returns null if absent. */
export async function getPayout(id: string, store?: Firestore): Promise<Payout | null> {
  const snap = await db(store).collection(PAYOUTS).doc(id).get();
  return snap.exists ? (snap.data() as Payout) : null;
}

/** List all payouts, optionally for one artist (admin SDK). */
export async function listPayouts(artistId?: string, store?: Firestore): Promise<Payout[]> {
  const coll = db(store).collection(PAYOUTS);
  const snap = artistId ? await coll.where("artistId", "==", artistId).get() : await coll.get();
  return snap.docs.map((d) => d.data() as Payout);
}

/** The note the stub records — there is deliberately no live payment rail. */
export const PAYOUT_STUB_NOTE =
  "Documented stub: payout was approved but NO live payment rail is wired. " +
  "Executing a real transfer requires operator-supplied payment creds at handoff. " +
  "No money was moved.";

/**
 * DOCUMENTED EXECUTE STUB for an approved payout — moves NO money.
 *
 * This is the ONLY "execute" path and it deliberately does nothing financial: it
 * marks the payout record "executed-stub" with a note explaining that a real
 * transfer needs operator creds at handoff. It is reached ONLY after the
 * `initiate_payout` ApprovalGate has approved the call (the gate is the human
 * checkpoint); there is no payment SDK, no network, no rail to reach. Calling it
 * is safe in tests because it cannot transfer funds.
 */
export async function executePayoutStub(
  payoutOrId: string,
  store?: Firestore,
): Promise<Payout> {
  const existing = await getPayout(payoutOrId, store);
  if (!existing) {
    throw new Error(`Unknown payout: ${payoutOrId}`);
  }
  const updated: Payout = {
    ...existing,
    status: "executed-stub",
    executedAt: new Date().toISOString(),
    note: PAYOUT_STUB_NOTE,
  };
  await db(store).collection(PAYOUTS).doc(updated.id).set(pruneUndefined({ ...updated }));
  return updated;
}
