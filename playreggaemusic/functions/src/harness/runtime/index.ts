/**
 * Runtime. Run manager + SSE streaming bridge that drive the lead-agent graph.
 * Mirrors DeerFlow's `deerflow/runtime`. Implemented in B02 (loop) and wired to
 * autonomous label operation in B06.
 */
export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface RunRecord {
  runId: string;
  threadId: string;
  status: RunStatus;
}
