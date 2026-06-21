/**
 * Agent audit log (P2B04, F12) — GENERIC runtime capability.
 *
 * Every tool call the runtime makes is recorded here: which tool, a short
 * summary of its arguments, whether it was executed or blocked pending
 * approval, and when. This is a constitution §12 (traceable authority) artifact:
 * no consequential action is anonymous.
 *
 * GENERIC: this module lives in the harness and knows nothing about specific
 * tools. The set of consequential tools is supplied by the application layer
 * (app/agent/leadAgent) as plain strings. The audit STORE is injectable so the
 * same code is exercised against the Firestore emulator and a fake store.
 *
 * harness↛app firewall: this file imports ONLY harness persistence + zod-free
 * standard libs. It never imports app/*.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../persistence/firestore";

const AUDIT_LOG = "audit_log";

/** Whether a tool call was executed or blocked at the approval gate. */
export type AuditDecision = "executed" | "blocked-pending-approval";

/** One recorded tool call. */
export interface AuditEntry {
  /** Run that issued the call (free-form; the runtime supplies it). */
  runId: string;
  /** Thread the run belongs to. */
  threadId: string;
  /** Tool name. */
  tool: string;
  /** A short, human-readable summary of the arguments (never secrets). */
  argsSummary: string;
  /** Whether the call ran or was blocked. */
  decision: AuditDecision;
  /** ISO-8601 time the entry was recorded. */
  timestamp: string;
}

/**
 * The narrow store the audit log needs. Injectable so tests can pass a fake and
 * the emulator suite passes a real Firestore. Defaults to the admin SDK.
 */
export interface AuditStore {
  record(entry: AuditEntry): Promise<void>;
  list(threadId: string): Promise<AuditEntry[]>;
}

/**
 * Firestore-backed audit store (admin SDK). Writes to the admin-only
 * `audit_log` collection with auto-ids; lists by threadId ordered by timestamp.
 */
export class FirestoreAuditStore implements AuditStore {
  constructor(private readonly db: Firestore = getDb()) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.collection(AUDIT_LOG).add({ ...entry });
  }

  async list(threadId: string): Promise<AuditEntry[]> {
    const snap = await this.db
      .collection(AUDIT_LOG)
      .where("threadId", "==", threadId)
      .get();
    const entries = snap.docs.map((d) => d.data() as AuditEntry);
    // Order in-process by timestamp so we need no composite index in the
    // emulator/prod (where()+orderBy() on different fields needs one).
    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}

/** Summarise tool arguments to a short, log-safe string. */
export function summariseArgs(args: unknown): string {
  if (args === undefined || args === null) {
    return "";
  }
  let json: string;
  try {
    json = typeof args === "string" ? args : JSON.stringify(args);
  } catch {
    json = String(args);
  }
  const MAX = 500;
  return json.length > MAX ? `${json.slice(0, MAX)}…` : json;
}

/** Record a single audit entry via the given store (default: Firestore). */
export async function recordAuditEntry(
  entry: AuditEntry,
  store: AuditStore = new FirestoreAuditStore(),
): Promise<void> {
  await store.record(entry);
}

/** List a thread's audit entries in chronological order (default: Firestore). */
export async function listAuditEntries(
  threadId: string,
  store: AuditStore = new FirestoreAuditStore(),
): Promise<AuditEntry[]> {
  return store.list(threadId);
}
