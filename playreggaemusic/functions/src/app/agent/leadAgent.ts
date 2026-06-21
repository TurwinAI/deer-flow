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
import {
  PlanState,
  buildWritePlanTool,
  type ApprovalGateDeps,
  type ApprovalsStore,
  type AuditStore,
} from "../../harness/orchestration";
import { getLabelTools } from "../label/tools";
import { getDistributionTools } from "../distribution/tools";
import { getFinanceTools } from "../finance/tools";
import { getPublishingTools } from "../publishing/tools";
import { getMarketingTools } from "../marketing/tools";
import type { SocialChannel, EmailChannel, AdChannel } from "../marketing/channels";
import { FakeScheduler } from "../../harness/orchestration";
import type { Scheduler } from "../../harness/orchestration";
import type { ProRegistrar } from "../publishing/pro";
import type { ProductReleaseMap } from "../finance/revenue";
import { createCheckoutForProduct } from "../polar/checkout";
import type { PolarClient } from "../polar/client";

/**
 * The CONSEQUENTIAL tool names this label gates (P2B04). The WIRING of which
 * tools are consequential is an APPLICATION decision and lives here (the harness
 * gate is generic over a name set). Today the only live consequential agent tool
 * is the DSP delivery; payout + marketing-spend names are RESERVED so that when
 * those tools land (P2B05/P2B07) they are gated by default.
 *
 * Note: `deliver_release` is reserved here even though the agent's own
 * distribution tool set deliberately stops at scheduling (the real delivery is
 * an admin callable with an inline `approved` boolean — kept as defense-in-depth
 * per P2B03). Listing it makes the gate the single generic chokepoint the moment
 * a deliver tool is exposed to the agent.
 *
 * `initiate_payout` (P2B05, F7) IS exposed to the agent (finance tools) and is
 * the live consequential payout action: it is gated here so it cannot execute
 * without human approval, and even an approved call reaches only a documented
 * stub (no live payment rail).
 *
 * `issue_sync_license` (P2B06, F9) IS exposed to the agent (publishing tools)
 * and is the binding sync-licensing commitment: it is gated here so the agent
 * cannot issue a license without explicit human approval. Even an approved call
 * stamps only a CLEARLY-MARKED placeholder license text (owner supplies binding
 * wording before go-live).
 *
 * `publish_social_post` / `send_email_blast` / `marketing_spend` (P2B07, F5) ARE
 * exposed to the agent (marketing tools) and are the OUTWARD/SPENDING marketing
 * actions: public posting, email sends, and paid-ad spend. All three are gated
 * here so the agent cannot broadcast or spend without explicit human approval;
 * even an approved call reaches only a Fake channel that records the call and
 * makes no live network request (live channels are owner-side at handoff). The
 * marketing planning/drafting tools (plan_campaign, generate_campaign_copy,
 * schedule_campaign) are deliberately NOT gated — they have no outward effect.
 */
export const CONSEQUENTIAL_TOOLS: readonly string[] = [
  "deliver_release",
  "initiate_payout",
  "marketing_spend",
  "publish_social_post",
  "send_email_blast",
  "issue_sync_license",
];

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
  /**
   * Maps a product id → the release id it sells, so the finance `ingest_revenue`
   * tool can attribute D2C order revenue to a release. Optional (defaults to no
   * attribution).
   */
  productReleaseMap?: ProductReleaseMap;
  /**
   * PRO/MLC registrar backing the `register_pro_affiliation` tool (P2B06).
   * Injected so the autonomy gate uses FakeProRegistrar (no live PRO/MLC call).
   * Defaults to a FakeProRegistrar when omitted.
   */
  proRegistrar?: ProRegistrar;
  /**
   * Scheduler backing the marketing `schedule_campaign` tool (P2B07). Injected
   * so the autonomy gate uses a FakeScheduler (no live infra). Defaults to a
   * FakeScheduler when omitted.
   */
  scheduler?: Scheduler;
  /**
   * Marketing channel adapters (P2B07) backing the CONSEQUENTIAL marketing tools
   * (publish_social_post / send_email_blast / marketing_spend). Injected so the
   * autonomy gate uses Fake channels (no live social/email/ad call). Default to
   * Fake channels when omitted.
   */
  socialChannel?: SocialChannel;
  emailChannel?: EmailChannel;
  adChannel?: AdChannel;
  /**
   * P2B04 ApprovalGate wiring. When supplied, the agent's tool execution passes
   * through the generic ApprovalGate: consequential calls (CONSEQUENTIAL_TOOLS)
   * are blocked pending approval and EVERY tool call is audited. The run context
   * (runId/threadId) + stores are injected so the same path runs against the
   * emulator and a fake store. When omitted, the agent runs ungated (the prior
   * behaviour) — used by callers that gate elsewhere (e.g. admin deliver).
   */
  approval?: {
    runId: string;
    threadId: string;
    approvalsStore?: ApprovalsStore;
    auditStore?: AuditStore;
    /** Override the consequential set (defaults to CONSEQUENTIAL_TOOLS). */
    consequentialTools?: readonly string[];
  };
}

/** The assembled agent: the compiled graph, its tools, prompt, and plan state. */
export interface LabelAgent {
  graph: ReturnType<typeof buildLeadAgentGraph>;
  tools: StructuredToolInterface[];
  systemPrompt: string;
  /** The agent's working plan (mutated by the `write_plan` tool). */
  planState: PlanState;
}

/**
 * Build the lead label agent. Tools = harness builtins ++ label tools ++
 * distribution tools ++ the planner `write_plan` tool ++ an optional
 * create_checkout tool. System prompt = base persona ++ skills ++ memory.
 *
 * When `approval` is supplied the compiled graph runs through the generic
 * ApprovalGate (consequential tools blocked + every call audited); otherwise it
 * runs ungated, exactly as before.
 */
export function buildLabelAgent({
  model,
  checkpointer,
  skills = [],
  memoryFacts = [],
  polarClient,
  productReleaseMap = {},
  proRegistrar,
  scheduler = new FakeScheduler(),
  socialChannel,
  emailChannel,
  adChannel,
  approval,
}: BuildLabelAgentDeps): LabelAgent {
  const planState = new PlanState();
  const tools: StructuredToolInterface[] = [
    ...getBuiltinTools(),
    ...getLabelTools(),
    ...getDistributionTools(),
    ...getFinanceTools(productReleaseMap),
    ...getPublishingTools(proRegistrar),
    ...getMarketingTools({ scheduler, socialChannel, emailChannel, adChannel }),
    buildWritePlanTool(planState),
  ];
  if (polarClient) {
    tools.push(buildCreateCheckoutTool(polarClient));
  }
  const systemPrompt = buildLabelSystemPrompt(skills, memoryFacts);

  let approvalGate: ApprovalGateDeps | undefined;
  if (approval) {
    approvalGate = {
      consequentialTools: approval.consequentialTools ?? CONSEQUENTIAL_TOOLS,
      runId: approval.runId,
      threadId: approval.threadId,
      approvalsStore: approval.approvalsStore,
      auditStore: approval.auditStore,
    };
  }

  const graph = buildLeadAgentGraph({ model, tools, checkpointer, approvalGate });
  return { graph, tools, systemPrompt, planState };
}
