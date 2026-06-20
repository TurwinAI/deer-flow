/**
 * Lead-agent assembly (B06). This is the APPLICATION-layer wiring that ties the
 * harness runtime (B02) + persistence (B03) + skills (B04) + label tools (B05)
 * + Polar checkout (B06) into one agent that autonomously operates the label.
 *
 * The harness↛app firewall means this assembly MUST live in app/ (it imports
 * both harness builtins and the app label/polar tools). harness/* never imports
 * app/* (boundary test).
 */
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { buildLeadAgentGraph, type ChatModelLike } from "../../harness/runtime";
import { buildSystemPrompt } from "../../harness/agents";
import { buildSkillsPromptSection, type SkillRecord } from "../../harness/skills";
import { buildMemoryBlock, type MemoryFact } from "../../harness/memory";
import { getBuiltinTools } from "../../harness/tools";
import { getLabelTools } from "../label/tools";
import { createCheckoutForProduct } from "../polar/checkout";
import type { PolarClient } from "../polar/client";

const createCheckoutSchema = z.object({
  productId: z.string().describe("Firestore product id to sell (e.g. 'foundation-stones-download')"),
});

/**
 * Build a `create_checkout` agent tool bound to an injected Polar client. The
 * client is injected so the autonomy gate runs with a FakePolarClient and never
 * makes a live Polar call.
 */
export function buildCreateCheckoutTool(client: PolarClient): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: "create_checkout",
    description:
      "Create a Polar checkout (test mode) for a music_download product and return its checkout URL.",
    schema: createCheckoutSchema,
    func: async (input: z.infer<typeof createCheckoutSchema>): Promise<string> => {
      const result = await createCheckoutForProduct(input.productId, client);
      return `Checkout created for ${input.productId}: ${result.checkoutUrl} (id ${result.checkoutId}).`;
    },
  });
}

/**
 * Assemble the full system prompt: the base persona + the enabled-skills
 * section + the memory block. Sections are joined only when non-empty so the
 * prompt stays clean when there are no skills/facts.
 */
export function buildLabelSystemPrompt(skills: SkillRecord[], memoryFacts: MemoryFact[]): string {
  const sections = [buildSystemPrompt()];
  const skillsSection = buildSkillsPromptSection(skills);
  if (skillsSection) {
    sections.push(`Available skills:\n${skillsSection}`);
  }
  const memoryBlock = buildMemoryBlock(memoryFacts);
  if (memoryBlock) {
    sections.push(memoryBlock);
  }
  return sections.join("\n\n");
}

export interface BuildLabelAgentDeps {
  model: ChatModelLike;
  /** Optional durable checkpointer (B03 FirestoreCheckpointSaver). */
  checkpointer?: BaseCheckpointSaver;
  /** Enabled skills to surface in the prompt (B04). */
  skills?: SkillRecord[];
  /** Memory facts to inject (B03). */
  memoryFacts?: MemoryFact[];
  /**
   * Polar client backing the `create_checkout` tool. Injected so the autonomy
   * gate uses FakePolarClient (no live calls). When omitted, the checkout tool
   * is not wired in.
   */
  polarClient?: PolarClient;
}

/** The assembled agent: the compiled graph, its tools, and the system prompt. */
export interface LabelAgent {
  graph: ReturnType<typeof buildLeadAgentGraph>;
  tools: StructuredToolInterface[];
  systemPrompt: string;
}

/**
 * Build the lead label agent. Tools = harness builtins ++ label tools ++ an
 * optional create_checkout tool. System prompt = base persona ++ skills ++
 * memory. The compiled graph is returned with its tools + prompt so callers can
 * prepend the system message and invoke.
 */
export function buildLabelAgent({
  model,
  checkpointer,
  skills = [],
  memoryFacts = [],
  polarClient,
}: BuildLabelAgentDeps): LabelAgent {
  const tools: StructuredToolInterface[] = [...getBuiltinTools(), ...getLabelTools()];
  if (polarClient) {
    tools.push(buildCreateCheckoutTool(polarClient));
  }
  const systemPrompt = buildLabelSystemPrompt(skills, memoryFacts);
  const graph = buildLeadAgentGraph({ model, tools, checkpointer });
  return { graph, tools, systemPrompt };
}
