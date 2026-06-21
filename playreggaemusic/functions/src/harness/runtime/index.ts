/**
 * Runtime. The lead-agent graph (LangGraph.js) + run helpers. Mirrors
 * DeerFlow's `deerflow/runtime`. The graph is a tool-calling loop: the agent
 * node calls the model; if the response carries tool calls they are executed
 * and fed back; otherwise the run ends. Persistence (checkpointer) is layered
 * in B03; autonomous label operation is wired in B06.
 */
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { wrapTools, type ApprovalGateDeps } from "../orchestration/approvalGate";

export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface RunRecord {
  runId: string;
  threadId: string;
  status: RunStatus;
}

/**
 * Minimal shape the graph needs from a chat model: bind tools, then invoke on
 * a message list. Satisfied by `ChatAnthropic` and by test doubles alike.
 */
export interface ChatModelLike {
  bindTools(tools: StructuredToolInterface[]): {
    invoke(messages: BaseMessage[]): Promise<BaseMessage>;
  };
}

export interface LeadAgentDeps {
  model: ChatModelLike;
  tools: StructuredToolInterface[];
}

/**
 * Build the compiled lead-agent graph. An optional `checkpointer`
 * (B03 — a `BaseCheckpointSaver`, e.g. the `FirestoreCheckpointSaver`) is
 * passed through to `.compile({ checkpointer })` so runs are durable and
 * resumable by thread id.
 *
 * An optional `approvalGate` (P2B04) opts the graph into the ApprovalGate: when
 * supplied, the TOOL EXECUTION (not the model's view of the tools) is wrapped so
 * consequential tool calls are blocked pending approval and every call is
 * audited. When omitted, the graph behaves EXACTLY as before — the model binds
 * to the raw tools and the ToolNode runs them directly (existing tests are
 * unaffected). The gate is generic: it is parameterised by a set of
 * consequential tool NAMES + injected stores, supplied by the app layer.
 */
export function buildLeadAgentGraph({
  model,
  tools,
  checkpointer,
  approvalGate,
}: LeadAgentDeps & {
  checkpointer?: BaseCheckpointSaver;
  approvalGate?: ApprovalGateDeps;
}) {
  // The model always sees the real tool contracts (names/schemas/descriptions).
  const bound = model.bindTools(tools);
  // Execution may be gated: wrapped tools intercept consequential calls + audit.
  const executableTools = approvalGate ? wrapTools(tools, approvalGate) : tools;
  const toolNode = new ToolNode(executableTools);

  const callModel = async (state: typeof MessagesAnnotation.State) => {
    const response = await bound.invoke(state.messages);
    return { messages: [response] };
  };

  const shouldContinue = (
    state: typeof MessagesAnnotation.State,
  ): "tools" | typeof END => {
    const last = state.messages.at(-1) as AIMessage | undefined;
    return last?.tool_calls && last.tool_calls.length > 0 ? "tools" : END;
  };

  return new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue, ["tools", END])
    .addEdge("tools", "agent")
    .compile({ checkpointer });
}

/** Convenience: build the graph and run it to completion over initial messages. */
export async function runLeadAgent(
  deps: LeadAgentDeps,
  messages: BaseMessage[],
): Promise<BaseMessage[]> {
  const graph = buildLeadAgentGraph(deps);
  const result = await graph.invoke({ messages });
  return result.messages;
}

/** A compiled lead-agent graph (the return type of {@link buildLeadAgentGraph}). */
export type LeadAgentGraph = ReturnType<typeof buildLeadAgentGraph>;

/**
 * Run a compiled graph with a HARD turn bound (P2B04, bounded autonomy —
 * constitution §13). `maxTurns` is mapped to LangGraph's `recursionLimit`: a run
 * that would take more agent/tool steps than the bound allows throws
 * `GraphRecursionError` instead of looping unbounded. Returns the final message
 * list when the run completes within the bound.
 */
export async function runBounded(
  graph: LeadAgentGraph,
  messages: BaseMessage[],
  maxTurns: number,
): Promise<BaseMessage[]> {
  const result = await graph.invoke(
    { messages },
    // Each agent->tools->agent cycle is two super-steps; allow 2 per turn plus a
    // final agent answer so a run of exactly maxTurns tool rounds is permitted
    // and anything beyond it trips the limit.
    { recursionLimit: Math.max(1, maxTurns) * 2 + 1 },
  );
  return result.messages;
}
