/**
 * Works registry (P2B06, F8 Publishing admin).
 *
 * A "work" is the COMPOSITION (song) behind one or more recordings. The label's
 * publishing side registers each work, tracks its ISWC, links the recording
 * ISRCs that embody it, and records the writer SPLITS (who wrote what share).
 *
 * Mirrors the P2B01 rights pattern (public release doc + private `rights`):
 *   - PUBLIC `works/{id}` carries only TRANSPARENCY fields (id, title, iswc?,
 *     linkedIsrcs[]) — world-readable, admin-write,
 *   - SENSITIVE writer splits live SEPARATELY in the admin-only
 *     `work_splits/{workId}` collection (firestore.rules denies all client
 *     access; the admin SDK bypasses rules), exactly like ownership splits never
 *     appear in the public release doc.
 *
 * Identifiers are validated before any write: the ISWC via `isValidISWC` and
 * EACH linked ISRC via `isValidISRC` — an invalid identifier throws and nothing
 * is persisted. Writer splits are validated via `validateSplits` (a non-empty
 * set must sum to 100).
 *
 * Application layer: MAY import harness/* (getDb) + app/* (label identifiers).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";
import {
  isValidISRC,
  isValidISWC,
  normalizeISRC,
  normalizeISWC,
  validateSplits,
} from "../label/identifiers";

const WORKS = "works";
const WORK_SPLITS = "work_splits";

/**
 * A composition. PUBLIC transparency fields only — this doc is world-readable.
 * Writer splits are NEVER stored here; they live in `work_splits/{workId}`.
 */
export interface Work {
  id: string;
  title: string;
  /**
   * PUBLIC ISWC (ISO 15707, `T-NNNNNNNNN-C`). Optional until assigned. Stored
   * normalized. Safe to expose.
   */
  iswc?: string;
  /**
   * The recording ISRCs that embody this composition. PUBLIC linkage so a
   * listener can connect a recording to its underlying work. Stored normalized.
   */
  linkedIsrcs: string[];
}

/** A single writer's share of a composition, e.g. `{ payee: "Roots Untold", percent: 50 }`. */
export interface WriterSplit {
  payee: string;
  percent: number;
}

/**
 * SENSITIVE writer splits for a work. Stored in the admin-only
 * `work_splits/{workId}` collection (firestore.rules denies all client access).
 * A non-empty set must sum to 100 (see `validateSplits`). Never in the public
 * `works` doc.
 */
export interface WorkSplits {
  workId: string;
  writerSplits: WriterSplit[];
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * Validate + normalize a work's PUBLIC identifiers. Rejects an invalid ISWC and
 * any invalid linked ISRC. Returns a copy with `iswc` + `linkedIsrcs` normalized.
 * Throws on invalid input so no bad identifier is ever persisted.
 */
function normalizeWorkIdentifiers(work: Work): Work {
  const next: Work = { ...work };
  if (work.iswc !== undefined) {
    if (!isValidISWC(work.iswc)) {
      throw new Error(`Invalid ISWC: ${work.iswc}`);
    }
    next.iswc = normalizeISWC(work.iswc);
  }
  next.linkedIsrcs = work.linkedIsrcs.map((isrc) => {
    if (!isValidISRC(isrc)) {
      throw new Error(`Invalid linked ISRC: ${isrc}`);
    }
    return normalizeISRC(isrc);
  });
  return next;
}

/**
 * Register (create/overwrite) a composition. Writes ONLY the PUBLIC `works/{id}`
 * doc (no writer splits). Validates the ISWC + every linked ISRC first; invalid
 * input throws and nothing is persisted. Idempotent (set-with-id).
 */
export async function registerWork(work: Work, store?: Firestore): Promise<Work> {
  const normalized = normalizeWorkIdentifiers(work);
  await db(store).collection(WORKS).doc(normalized.id).set(pruneUndefined({ ...normalized }));
  return normalized;
}

/** Read a work's PUBLIC doc (admin SDK). Returns null if absent. */
export async function getWork(id: string, store?: Firestore): Promise<Work | null> {
  const snap = await db(store).collection(WORKS).doc(id).get();
  return snap.exists ? (snap.data() as Work) : null;
}

/**
 * Set a work's SENSITIVE writer splits. Writes ONLY to the admin-only
 * `work_splits/{workId}` collection (never the public works doc). The splits are
 * validated first (a non-empty set must sum to 100); invalid splits throw and
 * nothing is persisted.
 */
export async function setWriterSplits(
  workId: string,
  splits: WriterSplit[],
  store?: Firestore,
): Promise<WorkSplits> {
  const { splits: validated } = validateSplits(splits);
  const record: WorkSplits = { workId, writerSplits: validated };
  await db(store)
    .collection(WORK_SPLITS)
    .doc(workId)
    .set({ workId, writerSplits: validated.map((s) => ({ ...s })) });
  return record;
}

/** Read a work's writer splits (admin SDK). Returns null if unset. */
export async function getWriterSplits(
  workId: string,
  store?: Firestore,
): Promise<WorkSplits | null> {
  const snap = await db(store).collection(WORK_SPLITS).doc(workId).get();
  return snap.exists ? (snap.data() as WorkSplits) : null;
}
