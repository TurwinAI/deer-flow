/**
 * Tool system. Mirrors DeerFlow's `deerflow/tools`.
 * Built-in tools live here; the label-operation tools the agent uses to run
 * the catalog/orders/Polar autonomously are added in B05/B06.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

/** Trivial built-in used to exercise the runtime tool-calling loop. */
export const echoTool = new DynamicStructuredTool({
  name: "echo",
  description: "Echo the provided text back verbatim.",
  schema: z.object({ text: z.string().describe("text to echo back") }),
  func: async ({ text }: { text: string }) => `echo:${text}`,
});

/** Built-in tool set always available to the lead agent. */
export function getBuiltinTools(): StructuredToolInterface[] {
  return [echoTool];
}
