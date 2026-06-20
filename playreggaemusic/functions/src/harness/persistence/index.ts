/**
 * Persistence. A Firestore-backed LangGraph.js checkpointer (BaseCheckpointSaver)
 * plus thread store land in B03, verified against the Firestore emulator.
 */
export interface ThreadRecord {
  threadId: string;
  createdAt: string;
  updatedAt: string;
}
