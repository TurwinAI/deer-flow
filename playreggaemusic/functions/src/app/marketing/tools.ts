/**
 * Agent marketing tools (P2B07, F5).
 *
 * DynamicStructuredTool wrappers so the lead agent can operate the marketing
 * side of the label. Two classes of tool:
 *
 *   NON-CONSEQUENTIAL (planning / drafting — no outward effect):
 *     - plan_campaign           expand the release-campaign template + persist,
 *     - generate_campaign_copy  produce deterministic on-brand copy,
 *     - schedule_campaign       schedule the steps via the injected scheduler.
 *
 *   CONSEQUENTIAL (outward / spending — registered in CONSEQUENTIAL_TOOLS so the
 *   generic P2B04 ApprovalGate BLOCKS them until a human approves):
 *     - publish_social_post     publish a public post via the social channel,
 *     - send_email_blast        send an email blast via the email channel,
 *     - marketing_spend         place paid-ad spend via the ad channel.
 *
 * The channels + scheduler are INJECTED (Fake* in tests) so NO live social /
 * email / ad call is ever made in a gate. The gate is the chokepoint — the tools
 * themselves just call the injected adapter; an unapproved consequential call is
 * blocked by the ApprovalGate BEFORE the tool body runs, so the Fake adapter is
 * never touched pre-approval.
 *
 * Application layer: imports the harness tool types + zod (allowed direction).
 */
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import type { Scheduler } from "../../harness/orchestration";
import { getRelease } from "../label/store";
import {
  planAndSaveCampaign,
  type CampaignStepKind,
} from "./campaign";
import { generateCampaignCopy } from "./copy";
import { scheduleCampaign } from "./scheduling";
import {
  FakeSocialChannel,
  FakeEmailChannel,
  FakeAdChannel,
  type SocialChannel,
  type EmailChannel,
  type AdChannel,
} from "./channels";

const stepKindSchema = z.enum([
  "announce",
  "preview_drop",
  "playlist_pitch",
  "email_blast",
  "ad_spend",
]);

const planCampaignSchema = z.object({
  releaseId: z.string().describe("id of the release to plan a marketing campaign for"),
  budgetCents: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("total advertising budget for the campaign in cents (default 0)"),
});

const generateCopySchema = z.object({
  releaseId: z.string().describe("id of the release the copy is for"),
  kind: stepKindSchema.describe("which campaign step the copy is for"),
});

const scheduleCampaignSchema = z.object({
  campaignId: z.string().describe("id of a planned campaign to schedule"),
  baseTime: z
    .string()
    .describe("ISO-8601 time the FIRST step fires, e.g. '2026-07-01T00:00:00Z'"),
  cadenceDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("whole days between consecutive steps (default 1)"),
});

const publishSocialPostSchema = z.object({
  platform: z.string().describe("social platform, e.g. 'instagram', 'x', 'mastodon'"),
  message: z.string().describe("the post body (on-brand copy)"),
  assetPath: z.string().optional().describe("optional public asset path/URL to attach"),
});

const sendEmailBlastSchema = z.object({
  segment: z.string().describe("audience segment / list name, e.g. 'newsletter'"),
  subject: z.string().describe("email subject line"),
  body: z.string().describe("email body (on-brand copy)"),
});

const marketingSpendSchema = z.object({
  platform: z.string().describe("ad platform, e.g. 'meta', 'google'"),
  budgetCents: z.number().int().positive().describe("spend amount in cents"),
  currency: z.string().describe("ISO currency code, e.g. 'USD'"),
  objective: z.string().describe("the campaign / objective the spend funds"),
});

// ---------------------------------------------------------------------------
// NON-CONSEQUENTIAL tools (planning / drafting / scheduling — no outward effect)
// ---------------------------------------------------------------------------

export const planCampaignTool = new DynamicStructuredTool({
  name: "plan_campaign",
  description:
    "Plan a marketing campaign for a release: expand the release-campaign " +
    "template into ordered steps (announce, preview drop, playlist pitch, email " +
    "blast, ad spend) and persist it. Planning only — performs NO outward effect.",
  schema: planCampaignSchema,
  func: async (input: z.infer<typeof planCampaignSchema>): Promise<string> => {
    const release = await getRelease(input.releaseId);
    if (!release) {
      return `Unknown release: ${input.releaseId}.`;
    }
    const campaign = await planAndSaveCampaign(input.releaseId, {
      budgetCents: input.budgetCents,
    });
    return (
      `Planned campaign ${campaign.id} for release ${campaign.releaseId} with ` +
      `${campaign.steps.length} step(s): ${campaign.steps.map((s) => s.kind).join(", ")}.`
    );
  },
});

export const generateCampaignCopyTool = new DynamicStructuredTool({
  name: "generate_campaign_copy",
  description:
    "Generate on-brand, AI-disclosed marketing copy for a release + campaign " +
    "step kind. Deterministic drafting only — performs NO outward effect.",
  schema: generateCopySchema,
  func: async (input: z.infer<typeof generateCopySchema>): Promise<string> => {
    const release = await getRelease(input.releaseId);
    if (!release) {
      return `Unknown release: ${input.releaseId}.`;
    }
    return generateCampaignCopy(release, input.kind as CampaignStepKind);
  },
});

/**
 * Build the `schedule_campaign` tool bound to an injected scheduler. The
 * scheduler is injected so the gate runs with a FakeScheduler and never
 * provisions live infra. Scheduling is non-consequential (no outward effect).
 */
export function buildScheduleCampaignTool(scheduler: Scheduler): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: "schedule_campaign",
    description:
      "Schedule a planned campaign's steps through the scheduler. Records " +
      "scheduled runs + stamps step times. Scheduling only — performs NO outward " +
      "effect (the outward steps still require human approval when they fire).",
    schema: scheduleCampaignSchema,
    func: async (input: z.infer<typeof scheduleCampaignSchema>): Promise<string> => {
      const result = await scheduleCampaign(input.campaignId, scheduler, {
        baseTime: input.baseTime,
        cadenceDays: input.cadenceDays,
      });
      return (
        `Scheduled campaign ${result.campaign.id}: ${result.scheduledSteps.length} ` +
        `step(s) (status ${result.campaign.status}).`
      );
    },
  });
}

// ---------------------------------------------------------------------------
// CONSEQUENTIAL tools (outward / spending — gated by the ApprovalGate)
// ---------------------------------------------------------------------------

/**
 * Build the `publish_social_post` tool bound to an injected social channel.
 * CONSEQUENTIAL (public broadcast) — gated by CONSEQUENTIAL_TOOLS. The channel
 * is injected (FakeSocialChannel default) so no live post is ever made.
 */
export function buildPublishSocialPostTool(
  channel: SocialChannel = new FakeSocialChannel(),
): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: "publish_social_post",
    description:
      "Publish a PUBLIC social post via the social channel. CONSEQUENTIAL — a " +
      "public broadcast that requires human approval before it can run.",
    schema: publishSocialPostSchema,
    func: async (input: z.infer<typeof publishSocialPostSchema>): Promise<string> => {
      const result = await channel.post({
        platform: input.platform,
        message: input.message,
        assetPath: input.assetPath,
      });
      return `Published social post ${result.postId} to ${result.platform}.`;
    },
  });
}

/**
 * Build the `send_email_blast` tool bound to an injected email channel.
 * CONSEQUENTIAL (outward send) — gated by CONSEQUENTIAL_TOOLS. The channel is
 * injected (FakeEmailChannel default) so no live email is ever sent.
 */
export function buildSendEmailBlastTool(
  channel: EmailChannel = new FakeEmailChannel(),
): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: "send_email_blast",
    description:
      "Send an email blast to an audience segment via the email channel. " +
      "CONSEQUENTIAL — an outward send that requires human approval before it runs.",
    schema: sendEmailBlastSchema,
    func: async (input: z.infer<typeof sendEmailBlastSchema>): Promise<string> => {
      const result = await channel.send({
        segment: input.segment,
        subject: input.subject,
        body: input.body,
      });
      return `Sent email blast ${result.sendId} to segment ${result.segment}.`;
    },
  });
}

/**
 * Build the `marketing_spend` tool bound to an injected ad channel.
 * CONSEQUENTIAL (spends money) — gated by CONSEQUENTIAL_TOOLS. The channel is
 * injected (FakeAdChannel default) so no live ad spend is ever placed.
 */
export function buildMarketingSpendTool(
  channel: AdChannel = new FakeAdChannel(),
): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: "marketing_spend",
    description:
      "Place paid-advertising spend via the ad channel. CONSEQUENTIAL — spends " +
      "money and requires human approval before it can run.",
    schema: marketingSpendSchema,
    func: async (input: z.infer<typeof marketingSpendSchema>): Promise<string> => {
      const result = await channel.spend({
        platform: input.platform,
        budgetCents: input.budgetCents,
        currency: input.currency,
        objective: input.objective,
      });
      return `Placed ad spend ${result.adOrderId} on ${result.platform} (${result.budgetCents} ${result.currency}).`;
    },
  });
}

/** Injected channels + scheduler for the marketing tools. */
export interface MarketingToolDeps {
  scheduler: Scheduler;
  socialChannel?: SocialChannel;
  emailChannel?: EmailChannel;
  adChannel?: AdChannel;
}

/**
 * All marketing tools the lead agent uses. The scheduler + channels are injected
 * (Fake* defaults) so no live infra/social/email/ad call is ever made. The three
 * outward/spending tools (publish_social_post, send_email_blast, marketing_spend)
 * are consequential and gated by the ApprovalGate (CONSEQUENTIAL_TOOLS).
 */
export function getMarketingTools(deps: MarketingToolDeps): StructuredToolInterface[] {
  return [
    planCampaignTool,
    generateCampaignCopyTool,
    buildScheduleCampaignTool(deps.scheduler),
    buildPublishSocialPostTool(deps.socialChannel),
    buildSendEmailBlastTool(deps.emailChannel),
    buildMarketingSpendTool(deps.adChannel),
  ];
}
