/**
 * Lead-agent system. Mirrors DeerFlow's `deerflow/agents`.
 * The LangGraph.js lead-agent graph factory + system-prompt assembly land in B02.
 */
export interface ThreadState {
  threadId: string;
  title?: string;
  /** Message log; concrete message types arrive with the runtime in B02. */
  messages: unknown[];
}

export function emptyThreadState(threadId: string): ThreadState {
  return { threadId, messages: [] };
}
