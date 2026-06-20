/**
 * Thread store. Small typed CRUD over the `threads/{threadId}` collection.
 * A thread is the durable conversation record the checkpointer keys against;
 * this store holds human-facing metadata (title, timestamps, optional rolling
 * message summary) rather than the graph state itself.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "./firestore";

const THREADS = "threads";

/** Durable per-thread metadata record. */
export interface ThreadRecord {
  threadId: string;
  title?: string;
  /** Optional rolling summary of the conversation, appended over time. */
  messageSummary?: string;
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Create a thread record. Idempotent on threadId (overwrites metadata). */
export async function createThread(
  threadId: string,
  init: { title?: string } = {},
  db: Firestore = getDb(),
): Promise<ThreadRecord> {
  const ts = nowIso();
  const record: ThreadRecord = {
    threadId,
    createdAt: ts,
    updatedAt: ts,
  };
  if (init.title !== undefined) {
    record.title = init.title;
  }
  await db.collection(THREADS).doc(threadId).set(record);
  return record;
}

/** Fetch a thread record, or undefined if it does not exist. */
export async function getThread(
  threadId: string,
  db: Firestore = getDb(),
): Promise<ThreadRecord | undefined> {
  const snap = await db.collection(THREADS).doc(threadId).get();
  return snap.exists ? (snap.data() as ThreadRecord) : undefined;
}

/** Append a line to the rolling message summary, updating the timestamp. */
export async function appendMessageSummary(
  threadId: string,
  summaryLine: string,
  db: Firestore = getDb(),
): Promise<void> {
  const existing = await getThread(threadId, db);
  const prior = existing?.messageSummary ?? "";
  const messageSummary = prior ? `${prior}\n${summaryLine}` : summaryLine;
  await db
    .collection(THREADS)
    .doc(threadId)
    .set({ messageSummary, updatedAt: nowIso() }, { merge: true });
}

/** Update a thread's title, refreshing the timestamp. */
export async function updateThreadTitle(
  threadId: string,
  title: string,
  db: Firestore = getDb(),
): Promise<void> {
  await db
    .collection(THREADS)
    .doc(threadId)
    .set({ title, updatedAt: nowIso() }, { merge: true });
}

/** List threads, newest-updated first. */
export async function listThreads(
  options: { limit?: number } = {},
  db: Firestore = getDb(),
): Promise<ThreadRecord[]> {
  let query = db
    .collection(THREADS)
    .orderBy("updatedAt", "desc") as FirebaseFirestore.Query;
  if (options.limit !== undefined) {
    query = query.limit(options.limit);
  }
  const snap = await query.get();
  return snap.docs.map((d) => d.data() as ThreadRecord);
}
