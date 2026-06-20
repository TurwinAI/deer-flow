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

/** Build the compiled lead-agent graph. */
export function buildLeadAgentGraph({ model, tools }: LeadAgentDeps) {
  const bound = model.bindTools(tools);
  const toolNode = new ToolNode(tools);

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
    .compile();
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
