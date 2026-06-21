/**
 * Finance agent tools (P2B05, F7).
 *
 * The agent can:
 *   - ingest_revenue:    pull the Polar D2C `orders` mirror into revenue_events
 *     for a period (the always-available, no-network source). Real DSP/PRO
 *     sources are operator-side and never wired into an agent tool.
 *   - generate_statement: build + store a per-artist royalty statement.
 *   - propose_payout:    propose (status "proposed") a payout for a statement.
 *   - initiate_payout:   the CONSEQUENTIAL action — EXECUTE an (approved) payout.
 *     Registered in CONSEQUENTIAL_TOOLS so the P2B04 ApprovalGate blocks it until
 *     a human approves. Even when approved it reaches only the DOCUMENTED STUB
 *     (executePayoutStub) — there is NO live payment rail. It moves no money.
 *
 * Application layer: imports the harness tool types + zod (allowed direction).
 */
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { PolarRevenueSource, ingestRevenue, type ProductReleaseMap } from "./revenue";
import { generateStatement } from "./statements";
import { executePayoutStub, getPayout, proposePayout } from "./payout";

const ingestRevenueSchema = z.object({
  period: z
    .string()
    .describe("accounting period, e.g. '2026-Q2' or '2026-06'"),
});

const generateStatementSchema = z.object({
  artistId: z.string().describe("id of the artist to generate a statement for"),
  period: z.string().describe("accounting period the statement covers"),
  deductionsCents: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("flat fee deductions in cents to apply before recoupment (optional)"),
});

const proposePayoutSchema = z.object({
  artistId: z.string().describe("id of the artist to pay"),
  statementId: z.string().describe("id of the statement whose net to propose paying"),
});

const initiatePayoutSchema = z.object({
  payoutId: z
    .string()
    .describe("id of the PROPOSED payout to execute (CONSEQUENTIAL — requires approval)"),
});

/**
 * Build `ingest_revenue` bound to a product→release map (so D2C order revenue is
 * attributed to a release). Reads only the Firestore orders mirror — no network.
 */
export function buildIngestRevenueTool(
  productReleaseMap: ProductReleaseMap = {},
): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: "ingest_revenue",
    description:
      "Ingest D2C (Polar) revenue for a period from the local orders mirror into " +
      "the admin-only revenue_events store. Real DSP/PRO income is operator-side " +
      "and not reachable from this tool. No money moves.",
    schema: ingestRevenueSchema,
    func: async (input: z.infer<typeof ingestRevenueSchema>): Promise<string> => {
      const result = await ingestRevenue([new PolarRevenueSource(productReleaseMap)], input.period);
      return `Ingested ${result.events.length} revenue event(s) for ${input.period} (polar ${result.countBySource.polar}).`;
    },
  });
}

export const generateStatementTool = new DynamicStructuredTool({
  name: "generate_statement",
  description:
    "Generate and store a per-artist royalty statement for a period. Totals " +
    "reconcile (gross - deductions - recoupment = net).",
  schema: generateStatementSchema,
  func: async (input: z.infer<typeof generateStatementSchema>): Promise<string> => {
    const statement = await generateStatement(input.artistId, input.period, {
      deductionsCents: input.deductionsCents,
    });
    return (
      `Statement ${statement.id}: gross ${statement.grossCents}¢, ` +
      `deductions ${statement.deductionsCents}¢, recoupment ${statement.recoupmentAppliedCents}¢, ` +
      `net ${statement.netCents}¢.`
    );
  },
});

export const proposePayoutTool = new DynamicStructuredTool({
  name: "propose_payout",
  description:
    "Propose a payout for an artist's statement (status 'proposed', amount = " +
    "statement net). Does NOT pay — executing a payout is a consequential action " +
    "that requires human approval.",
  schema: proposePayoutSchema,
  func: async (input: z.infer<typeof proposePayoutSchema>): Promise<string> => {
    const payout = await proposePayout(input.artistId, input.statementId);
    return `Proposed payout ${payout.id} for ${payout.artistId}: ${payout.amountCents}¢ ${payout.currency} (status ${payout.status}).`;
  },
});

/**
 * `initiate_payout` — the CONSEQUENTIAL execute tool. It is listed in
 * CONSEQUENTIAL_TOOLS, so when the agent runs under the ApprovalGate this call is
 * BLOCKED until a human approves it. The tool body itself reaches ONLY the
 * documented stub (executePayoutStub): there is no payment SDK/rail, so even an
 * approved call moves no money. (When run ungated, e.g. a direct unit invoke, it
 * still only marks the record "executed-stub".)
 */
export const initiatePayoutTool = new DynamicStructuredTool({
  name: "initiate_payout",
  description:
    "EXECUTE a previously-proposed payout. CONSEQUENTIAL: gated by human approval. " +
    "There is NO live payment rail — execution reaches a documented stub that moves " +
    "no money and requires operator payment creds at handoff.",
  schema: initiatePayoutSchema,
  func: async (input: z.infer<typeof initiatePayoutSchema>): Promise<string> => {
    const existing = await getPayout(input.payoutId);
    if (!existing) {
      return `Unknown payout: ${input.payoutId}.`;
    }
    const updated = await executePayoutStub(input.payoutId);
    return (
      `Payout ${updated.id} reached the execute STUB (status ${updated.status}). ` +
      `No money was moved: ${updated.note}`
    );
  },
});

/**
 * The finance tools the lead agent uses. `ingest_revenue` is bound to the
 * supplied product→release map. `initiate_payout` is included but is gated by
 * the ApprovalGate (CONSEQUENTIAL_TOOLS).
 */
export function getFinanceTools(
  productReleaseMap: ProductReleaseMap = {},
): StructuredToolInterface[] {
  return [
    buildIngestRevenueTool(productReleaseMap),
    generateStatementTool,
    proposePayoutTool,
    initiatePayoutTool,
  ];
}
