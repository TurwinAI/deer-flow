import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { buildLeadAgentGraph, runLeadAgent, type ChatModelLike } from "../harness/runtime";
import { getBuiltinTools } from "../harness/tools";

/**
 * A scripted chat model: returns the queued AIMessages in order. Lets us drive
 * the tool-calling loop deterministically without a network/LLM.
 */
class ScriptedModel implements ChatModelLike {
  private i = 0;
  constructor(private readonly responses: AIMessage[]) {}
  bindTools() {
    return this;
  }
  async invoke(): Promise<AIMessage> {
    const next = this.responses[this.i];
    this.i += 1;
    return next;
  }
}

describe("lead-agent runtime (B02)", () => {
  it("executes a tool call then returns the final answer", async () => {
    const model = new ScriptedModel([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "echo", args: { text: "irie" }, id: "call-1" }],
      }),
      new AIMessage({ content: "done" }),
    ]);

    const messages = await runLeadAgent(
      { model, tools: getBuiltinTools() },
      [new HumanMessage("echo irie")],
    );

    const contents = messages.map((m) => String(m.content));
    // The echo tool actually ran and its result is in the transcript.
    expect(contents).toContain("echo:irie");
    // The loop terminated on the final non-tool answer.
    expect(contents.at(-1)).toBe("done");
  });

  it("ends immediately when the model returns no tool calls", async () => {
    const model = new ScriptedModel([new AIMessage({ content: "hello" })]);
    const graph = buildLeadAgentGraph({ model, tools: getBuiltinTools() });
    const out = await graph.invoke({ messages: [new HumanMessage("hi")] });
    expect(out.messages.at(-1)?.content).toBe("hello");
    // Only the human turn + one AI turn — the tools node never ran.
    expect(out.messages).toHaveLength(2);
  });
});
