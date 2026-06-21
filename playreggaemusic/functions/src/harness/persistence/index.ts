/**
 * Persistence barrel. Firestore-backed LangGraph checkpointer
 * (BaseCheckpointSaver) + thread store, verified against the Firestore emulator
 * in B03.
 *
 * `ThreadRecord` now lives in `threadStore` (the module that owns the
 * `threads/{id}` collection). `RunRecord` continues to live in `runtime`.
 */
export { getDb } from "./firestore";
export { FirestoreCheckpointSaver } from "./checkpointer";
export {
  createThread,
  getThread,
  appendMessageSummary,
  updateThreadTitle,
  listThreads,
  type ThreadRecord,
} from "./threadStore";
