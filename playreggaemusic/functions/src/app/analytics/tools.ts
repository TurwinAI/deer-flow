/**
 * Agent analytics tools (P2B08, F11 + F1).
 *
 * DynamicStructuredTool wrappers so the lead agent can operate the analytics /
 * A&R side of the label. ALL THREE are NON-CONSEQUENTIAL — read/propose only:
 *   - ingest_analytics:      pull the Polar D2C `orders` mirror into the admin-
 *     only analytics_events store for a period (the always-available, no-network
 *     source). The REAL DSP-stats source is operator-side and is NEVER wired into
 *     an agent tool.
 *   - generate_insights:     aggregate the period's events into a deterministic
 *     insight_reports/{period} summary.
 *   - recommend_next_actions: derive deterministic A&R PROPOSALS into
 *     anr_recommendations. A recommendation NEVER triggers a release, spend, or
 *     payout — it is an inert proposal. The consequential acts (releasing /
 *     spending) remain behind the existing approval gates (P2B03/P2B07).
 *
 * None of these are listed in CONSEQUENTIAL_TOOLS — they have no outward effect,
 * so the ApprovalGate does not (and need not) block them.
 *
 * Application layer: imports the harness tool types + zod (allowed direction).
 */
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { PolarSalesSource, ingestAnalytics, type ProductReleaseMap } from "./ingest";
import { generateInsightReport } from "./insights";
import { recommendNextActions } from "./anr";

const ingestAnalyticsSchema = z.object({
  period: z.string().describe("analytics period, e.g. '2026-Q2' or '2026-06'"),
});

const generateInsightsSchema = z.object({
  period: z.string().describe("period to aggregate an insight report for"),
  priorPeriod: z
    .string()
    .optional()
    .describe("optional prior period to compute period-over-period growth against"),
});

const recommendNextActionsSchema = z.object({
  period: z.string().describe("period to derive A&R recommendations for"),
  priorPeriod: z
    .string()
    .optional()
    .describe("optional prior period for growth context"),
});

/**
 * Build `ingest_analytics` bound to a product→release map (so D2C sales metrics
 * are attributed to a release). Reads only the Firestore orders mirror — no
 * network. NON-consequential.
 */
export function buildIngestAnalyticsTool(
  productReleaseMap: ProductReleaseMap = {},
): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: "ingest_analytics",
    description:
      "Ingest D2C (Polar) sales analytics for a period from the local orders " +
      "mirror into the admin-only analytics_events store. Real DSP stats are " +
      "operator-side and not reachable from this tool. Read-only — no outward " +
      "effect.",
    schema: ingestAnalyticsSchema,
    func: async (input: z.infer<typeof ingestAnalyticsSchema>): Promise<string> => {
      const result = await ingestAnalytics([new PolarSalesSource(productReleaseMap)], input.period);
      return (
        `Ingested ${result.events.length} analytics event(s) for ${input.period} ` +
        `(sales ${result.countBySource.sales}, dsp ${result.countBySource.dsp}).`
      );
    },
  });
}

export const generateInsightsTool = new DynamicStructuredTool({
  name: "generate_insights",
  description:
    "Aggregate the period's analytics events into a deterministic insight " +
    "report (totals by source/metric, top releases by streams/revenue, growth) " +
    "and store it. Read-only — no outward effect.",
  schema: generateInsightsSchema,
  func: async (input: z.infer<typeof generateInsightsSchema>): Promise<string> => {
    const report = await generateInsightReport(input.period, { priorPeriod: input.priorPeriod });
    const topStreams = report.topReleasesByStreams[0];
    return (
      `Insight report ${report.id}: ${report.eventCount} event(s); ` +
      `streams ${report.totalsByMetric.streams}, revenue ${report.totalsByMetric.revenue_cents}¢; ` +
      `top by streams: ${topStreams ? `${topStreams.releaseId} (${topStreams.value})` : "none"}.`
    );
  },
});

export const recommendNextActionsTool = new DynamicStructuredTool({
  name: "recommend_next_actions",
  description:
    "Derive deterministic A&R recommendations (PROPOSALS ONLY) for a period and " +
    "store them. A recommendation NEVER triggers a release, spend, or payout — " +
    "it is an inert proposal; consequential acts still pass the existing approval " +
    "gates. Read/propose only — no outward effect.",
  schema: recommendNextActionsSchema,
  func: async (input: z.infer<typeof recommendNextActionsSchema>): Promise<string> => {
    const recs = await recommendNextActions(input.period, { priorPeriod: input.priorPeriod });
    if (recs.length === 0) {
      return `No A&R recommendations for ${input.period} (insufficient signal).`;
    }
    return (
      `Proposed ${recs.length} A&R recommendation(s) for ${input.period}: ` +
      `${recs.map((r) => `${r.kind}->${r.releaseId}`).join(", ")}. Proposals only.`
    );
  },
});

/**
 * All analytics tools the lead agent uses. `ingest_analytics` is bound to the
 * supplied product→release map. ALL THREE are NON-consequential (read/propose
 * only) — none are gated by the ApprovalGate.
 */
export function getAnalyticsTools(
  productReleaseMap: ProductReleaseMap = {},
): StructuredToolInterface[] {
  return [
    buildIngestAnalyticsTool(productReleaseMap),
    generateInsightsTool,
    recommendNextActionsTool,
  ];
}
