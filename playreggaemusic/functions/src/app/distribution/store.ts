/**
 * Firestore data-access for release distributions (P2B03, F4).
 *
 * The `distributions/{releaseId}` collection is OPERATIONAL (like orders): it
 * records the delivery lifecycle of a release to DSPs and must NEVER be publicly
 * readable. firestore.rules denies ALL client access; the admin SDK bypasses
 * rules, so these functions are the engine-side write path.
 *
 * Document id is the release id, so writes are deterministic/idempotent
 * (set-with-id, not auto-id).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";
import type { DeliveryStatus } from "./client";

const DISTRIBUTIONS = "distributions";

/** Lifecycle of a release distribution. */
export type DistributionStatus = "scheduled" | "delivering" | DeliveryStatus;

/**
 * A distribution record for a release. Tracks scheduling + the mirrored
 * distributor delivery id/status. Operational + admin-only (never public).
 */
export interface DistributionRecord {
  releaseId: string;
  status: DistributionStatus;
  /** ISO-8601 time the release is scheduled to go out (set by scheduleRelease). */
  scheduledAt?: string;
  /** The distributor's delivery id, once delivered. */
  deliveryId?: string;
  /** ISO-8601 time the (last) delivery was submitted. */
  deliveredAt?: string;
  /** ISO-8601 time the record was last updated. */
  updatedAt: string;
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

/**
 * Firestore rejects `undefined` field values. Strip absent optional keys so the
 * document only carries present fields.
 */
function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** Write (set-with-merge) a distribution record. Idempotent on releaseId. */
export async function putDistribution(
  record: DistributionRecord,
  store?: Firestore,
): Promise<DistributionRecord> {
  await db(store)
    .collection(DISTRIBUTIONS)
    .doc(record.releaseId)
    .set(pruneUndefined({ ...record }), { merge: true });
  const snap = await db(store).collection(DISTRIBUTIONS).doc(record.releaseId).get();
  return snap.data() as DistributionRecord;
}

/** Read a release's distribution record (admin SDK). Returns null if absent. */
export async function getDistributionRecord(
  releaseId: string,
  store?: Firestore,
): Promise<DistributionRecord | null> {
  const snap = await db(store).collection(DISTRIBUTIONS).doc(releaseId).get();
  return snap.exists ? (snap.data() as DistributionRecord) : null;
}

/** List ALL distribution records (admin SDK). For the admin status view. */
export async function listDistributionRecords(store?: Firestore): Promise<DistributionRecord[]> {
  const snap = await db(store).collection(DISTRIBUTIONS).get();
  return snap.docs.map((d) => d.data() as DistributionRecord);
}

/** Merge a partial update onto an existing distribution record. */
export async function updateDistribution(
  releaseId: string,
  patch: Partial<DistributionRecord>,
  store?: Firestore,
): Promise<DistributionRecord> {
  const ref = db(store).collection(DISTRIBUTIONS).doc(releaseId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`No distribution record for release ${releaseId}.`);
  }
  await ref.set(pruneUndefined({ ...patch }), { merge: true });
  const updated = await ref.get();
  return updated.data() as DistributionRecord;
}
