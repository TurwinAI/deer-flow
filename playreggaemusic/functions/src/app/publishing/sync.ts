/**
 * Sync catalog + licensing (P2B06, F9 Sync / Licensing).
 *
 * Sync licensing places a recording (master) + its composition (work) into a
 * film/TV/game. Two halves must be cleared: the MASTER (the recording) and the
 * COMPOSITION (the work behind it). This module models:
 *
 *   - `sync_catalog/{recordingId}` — PUBLIC ("here is what's available for sync"):
 *     recordingId/ISRC, workId, title, available. World-readable, admin-write.
 *   - `sync_licenses/{id}` — the license record (SENSITIVE — carries the licensee,
 *     fee, and binding terms). Admin-only.
 *
 * Flow (each step its own function so the agent can run + audit them separately):
 *   1. requestSyncLicense  → record a "requested" license (the inbound ask),
 *   2. clearSyncLicense    → verify BOTH halves are clearable (the recording is in
 *      the public sync catalog AND the composition `work` exists) → "cleared",
 *   3. issueSyncLicense    → the CONSEQUENTIAL, binding commitment. It is gated by
 *      the P2B04 ApprovalGate via the `issue_sync_license` agent tool: it cannot
 *      issue without explicit human approval. On issue the record gets the
 *      placeholder `licenseText` + status "issued" + `issuedAt`.
 *
 * `licenseText` uses a CLEARLY-MARKED PLACEHOLDER (the owner supplies binding
 * sync wording before go-live) — same convention as PERSONAL_LICENSE_PLACEHOLDER.
 *
 * Application layer: MAY import harness/* (getDb) + app/* (works).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";
import { isValidISRC, normalizeISRC } from "../label/identifiers";
import { getWork } from "./works";

const SYNC_CATALOG = "sync_catalog";
const SYNC_LICENSES = "sync_licenses";

/**
 * PLACEHOLDER sync-license wording — NOT binding. The label owner must supply
 * the final, legally reviewed synchronization-license text before go-live. Same
 * convention as PERSONAL_LICENSE_PLACEHOLDER. Stamped onto a license at issue.
 */
export const SYNC_LICENSE_PLACEHOLDER =
  "[PLACEHOLDER SYNC LICENSE — owner to supply binding wording before go-live] " +
  "Synchronization license: grants the licensee the right to synchronize the " +
  "licensed recording (master) and its underlying composition with the specified " +
  "audiovisual work, for the stated media type, territory, and term. Final binding " +
  "terms are owner-supplied and legally reviewed before any license is honored.";

/**
 * A PUBLIC sync-catalog entry: what is available to license for sync. Stored in
 * `sync_catalog/{recordingId}` — world-readable, admin-write. `recordingId` is
 * the recording ISRC (normalized).
 */
export interface SyncCatalogEntry {
  recordingId: string;
  workId: string;
  title: string;
  available: boolean;
}

/** Lifecycle of a sync license. */
export type SyncLicenseStatus = "requested" | "cleared" | "issued" | "rejected";

/**
 * A sync license over a recording + its work. SENSITIVE — stored admin-only in
 * `sync_licenses/{id}`. `licenseText` is unset until issuance, when it is stamped
 * with the placeholder wording (owner supplies binding text before go-live).
 */
export interface SyncLicense {
  id: string;
  /** Recording ISRC (normalized). */
  recordingId: string;
  /** The composition (work) id behind the recording. */
  workId: string;
  licensee: string;
  /** e.g. "film", "tv", "game", "trailer". */
  mediaType: string;
  /** e.g. "US", "worldwide". */
  territory: string;
  termMonths: number;
  feeCents: number;
  status: SyncLicenseStatus;
  /** Binding license wording — set only at issuance (placeholder until go-live). */
  licenseText?: string;
  createdAt: string;
  /** Set when the license is issued. */
  issuedAt?: string;
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

// ---------------------------------------------------------------------------
// Sync catalog (PUBLIC) — admin-write entries advertising what's licensable.
// ---------------------------------------------------------------------------

/**
 * Add (or overwrite) a PUBLIC sync-catalog entry for a recording. Validates the
 * recording ISRC; invalid input throws. Idempotent (set-with-id keyed by the
 * normalized ISRC). `available` defaults to true.
 */
export async function addToSyncCatalog(
  entry: { recordingId: string; workId: string; title: string; available?: boolean },
  store?: Firestore,
): Promise<SyncCatalogEntry> {
  if (!isValidISRC(entry.recordingId)) {
    throw new Error(`Invalid recording ISRC: ${entry.recordingId}`);
  }
  const record: SyncCatalogEntry = {
    recordingId: normalizeISRC(entry.recordingId),
    workId: entry.workId,
    title: entry.title,
    available: entry.available ?? true,
  };
  await db(store).collection(SYNC_CATALOG).doc(record.recordingId).set({ ...record });
  return record;
}

/** Read a sync-catalog entry (admin SDK). Returns null if absent. */
export async function getSyncCatalogEntry(
  recordingId: string,
  store?: Firestore,
): Promise<SyncCatalogEntry | null> {
  const id = isValidISRC(recordingId) ? normalizeISRC(recordingId) : recordingId;
  const snap = await db(store).collection(SYNC_CATALOG).doc(id).get();
  return snap.exists ? (snap.data() as SyncCatalogEntry) : null;
}

// ---------------------------------------------------------------------------
// Sync licenses (SENSITIVE, admin-only) — request → clear → issue.
// ---------------------------------------------------------------------------

/** Read a sync license by id (admin SDK). Returns null if absent. */
export async function getSyncLicense(
  id: string,
  store?: Firestore,
): Promise<SyncLicense | null> {
  const snap = await db(store).collection(SYNC_LICENSES).doc(id).get();
  return snap.exists ? (snap.data() as SyncLicense) : null;
}

/** The inbound request shape for a sync license. */
export interface SyncLicenseRequest {
  id: string;
  recordingId: string;
  workId: string;
  licensee: string;
  mediaType: string;
  territory: string;
  termMonths: number;
  feeCents: number;
}

/**
 * Record a sync-license REQUEST (the inbound ask). Validates the recording ISRC
 * and term/fee; writes a `sync_licenses/{id}` record with status "requested". No
 * commitment is made — this just captures the request. Idempotent.
 */
export async function requestSyncLicense(
  request: SyncLicenseRequest,
  store?: Firestore,
): Promise<SyncLicense> {
  if (!isValidISRC(request.recordingId)) {
    throw new Error(`Invalid recording ISRC: ${request.recordingId}`);
  }
  if (!Number.isInteger(request.termMonths) || request.termMonths <= 0) {
    throw new Error("termMonths must be a positive integer.");
  }
  if (!Number.isInteger(request.feeCents) || request.feeCents < 0) {
    throw new Error("feeCents must be a non-negative integer.");
  }
  const license: SyncLicense = {
    id: request.id,
    recordingId: normalizeISRC(request.recordingId),
    workId: request.workId,
    licensee: request.licensee,
    mediaType: request.mediaType,
    territory: request.territory,
    termMonths: request.termMonths,
    feeCents: request.feeCents,
    status: "requested",
    createdAt: new Date().toISOString(),
  };
  await db(store).collection(SYNC_LICENSES).doc(license.id).set(pruneUndefined({ ...license }));
  return license;
}

/**
 * CLEAR a sync license: verify BOTH halves are clearable before any commitment.
 *   - MASTER (recording): the recording must be in the PUBLIC sync catalog and
 *     marked `available`,
 *   - COMPOSITION (work): the underlying `work` must exist.
 * Throws if the license is unknown, not in "requested" status, the recording is
 * missing/unavailable in the catalog, or the work does not exist. On success
 * advances the license to "cleared". Makes NO binding commitment.
 */
export async function clearSyncLicense(
  licenseId: string,
  store?: Firestore,
): Promise<SyncLicense> {
  const license = await getSyncLicense(licenseId, store);
  if (!license) {
    throw new Error(`Unknown sync license: ${licenseId}`);
  }
  if (license.status !== "requested") {
    throw new Error(
      `Sync license ${licenseId} is "${license.status}", not "requested"; cannot clear.`,
    );
  }
  // MASTER clearance: the recording must be advertised + available for sync.
  const catalogEntry = await getSyncCatalogEntry(license.recordingId, store);
  if (!catalogEntry) {
    throw new Error(
      `Master not clearable: recording ${license.recordingId} is not in the sync catalog.`,
    );
  }
  if (!catalogEntry.available) {
    throw new Error(
      `Master not clearable: recording ${license.recordingId} is not available for sync.`,
    );
  }
  // COMPOSITION clearance: the underlying work must exist.
  const work = await getWork(license.workId, store);
  if (!work) {
    throw new Error(
      `Composition not clearable: work ${license.workId} does not exist.`,
    );
  }
  await db(store)
    .collection(SYNC_LICENSES)
    .doc(licenseId)
    .set({ status: "cleared" }, { merge: true });
  const updated = await getSyncLicense(licenseId, store);
  // getSyncLicense cannot return null here (we just wrote it) — narrow for TS.
  if (!updated) {
    throw new Error(`Sync license ${licenseId} vanished after clearing.`);
  }
  return updated;
}

/**
 * ISSUE a sync license — the CONSEQUENTIAL, binding commitment. Requires the
 * license to be "cleared" first (both halves verified). Stamps the placeholder
 * `licenseText` (owner supplies binding wording before go-live), sets status
 * "issued" and `issuedAt`.
 *
 * This is reached by the agent ONLY through the `issue_sync_license` tool, which
 * is registered in CONSEQUENTIAL_TOOLS and therefore passes the P2B04
 * ApprovalGate — it cannot issue without explicit human approval. Throws if the
 * license is unknown or not yet cleared.
 */
export async function issueSyncLicense(
  licenseId: string,
  store?: Firestore,
): Promise<SyncLicense> {
  const license = await getSyncLicense(licenseId, store);
  if (!license) {
    throw new Error(`Unknown sync license: ${licenseId}`);
  }
  if (license.status !== "cleared") {
    throw new Error(
      `Sync license ${licenseId} is "${license.status}", not "cleared"; clear it before issuing.`,
    );
  }
  const issuedAt = new Date().toISOString();
  await db(store)
    .collection(SYNC_LICENSES)
    .doc(licenseId)
    .set(
      { status: "issued", licenseText: SYNC_LICENSE_PLACEHOLDER, issuedAt },
      { merge: true },
    );
  const updated = await getSyncLicense(licenseId, store);
  if (!updated) {
    throw new Error(`Sync license ${licenseId} vanished after issuing.`);
  }
  return updated;
}
