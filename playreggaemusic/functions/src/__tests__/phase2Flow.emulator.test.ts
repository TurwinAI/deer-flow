/**
 * Phase-2 FULL-CHAIN integration proof (P2B10) — EMULATOR-only. Guarded so plain
 * `pnpm test` (no emulator) skips it; run via `pnpm test:emulator`.
 *
 * This is the "agent autonomous run" proof: it drives the autonomous label
 * end-to-end through the ASSEMBLED lead agent + the generic ApprovalGate + the
 * real Firestore-backed stores, with NO live LLM (a ScriptedModel emits the tool
 * calls) and NO live distributor/Polar/PRO call (every external service is a
 * Fake adapter). It exercises, in order:
 *
 *   1. SEED — create artist/release/track/product + identifiers (UPC/ISRC) +
 *      AI-provenance per track + ownership splits + an ACTIVE artist agreement
 *      with AI-generation consent (the legal/compliance preconditions), plus a
 *      paid D2C order so the Polar revenue mirror has income.
 *   2. REVENUE + ROYALTIES — ingest revenue for the period from the Polar
 *      `orders` mirror + a Fake DSP source + a Fake PRO source, then generate the
 *      per-artist royalty statement; assert it reconciles
 *      (gross - deductions - recoupment === net) and the per-source breakdown
 *      sums to gross. Propose a payout off the statement net.
 *   3. AGENT + APPROVALGATE — run the assembled agent (ScriptedModel) wired with
 *      the ApprovalGate:
 *        - `schedule_release` (NON-consequential) EXECUTES → a scheduled
 *          distribution record + an "executed" audit row,
 *        - `initiate_payout` (CONSEQUENTIAL) is BLOCKED pending approval — the
 *          payout does NOT execute; a pending_approvals row + a
 *          "blocked-pending-approval" audit row are written. After the human
 *          approves, re-issuing the SAME call executes (reaching only the
 *          no-money stub).
 *   4. DISTRIBUTION GATE — `deliverRelease({ approved:false })` is REFUSED (the
 *      distributor is never touched); after approval, `deliverRelease({
 *      approved:true })` delivers via the FakeDistributorClient and mirrors the
 *      delivery id/status; a status refresh advances accepted -> delivered.
 *
 * End-state assertions prove: the royalty statement net is computed and
 * reconciles, the consequential payout was GATED (never auto-executed), and
 * distribution ends DELIVERED.
 */
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import {
  seedRootsUntold,
  FOUNDATION_RELEASE_ID,
  FOUNDATION_PRODUCT_ID,
  ROOTS_UNTOLD_ARTIST_ID,
} from "../app/label/seed";
import { buildLabelAgent } from "../app/agent/leadAgent";
import {
  FirestoreApprovalsStore,
  FirestoreAuditStore,
  approve,
  listAuditEntries,
  listPendingApprovals,
} from "../harness/orchestration";
import { FakeDistributorClient } from "../app/distribution/client";
import {
  APPROVAL_REQUIRED_MESSAGE,
  deliverRelease,
  getDistribution,
  refreshDistributionStatus,
} from "../app/distribution/release";
import {
  FakeDistributorRevenueSource,
  FakePRORevenueSource,
  PolarRevenueSource,
  ingestRevenue,
} from "../app/finance/revenue";
import { generateStatement } from "../app/finance/statements";
import { proposePayout, getPayout } from "../app/finance/payout";
import { listOrders } from "../app/label/store";
import type { ChatModelLike } from "../harness/runtime";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

/** Scripted model: returns queued AIMessages in order (no network LLM). */
class ScriptedModel implements ChatModelLike {
  private i = 0;
  constructor(private readonly responses: AIMessage[]) {}
  bindTools(): this {
    return this;
  }
  async invoke(): Promise<AIMessage> {
    const next = this.responses[this.i];
    this.i += 1;
    return next;
  }
}

/** The accounting period this run reconciles over. */
const PERIOD = "2026-07";

describe.skipIf(RUN)("phase-2 full-chain: autonomous label run (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of [
      "artists",
      "releases",
      "tracks",
      "track_masters",
      "products",
      "rights",
      "provenance",
      "artist_agreements",
      "orders",
      "distributions",
      "revenue_events",
      "royalty_statements",
      "recoupment",
      "payouts",
      "pending_approvals",
      "audit_log",
    ]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("seeds, reconciles royalties, runs the agent through the ApprovalGate, gates+delivers distribution", async () => {
    const db = getDb();

    // -- 1. SEED ------------------------------------------------------------
    const seeded = await seedRootsUntold();
    expect(seeded.release.id).toBe(FOUNDATION_RELEASE_ID);
    expect(seeded.tracks).toHaveLength(3);
    // Compliance preconditions are in place from the seed.
    expect(seeded.agreement.status).toBe("active");
    expect(seeded.agreement.consent.aiGenerationConsent).toBe(true);
    expect(seeded.provenance).toHaveLength(3);
    expect(seeded.rights.ownershipSplits.reduce((s, x) => s + x.percent, 0)).toBe(100);

    // Seed one PAID D2C order so the Polar revenue mirror has income to ingest.
    await db.collection("orders").doc("order-phase2-1").set({
      id: "order-phase2-1",
      customer: "cus_phase2",
      productId: FOUNDATION_PRODUCT_ID,
      amount: 700,
      currency: "USD",
      status: "paid",
      createdAt: `${PERIOD}-10T12:00:00.000Z`,
    });
    expect((await listOrders()).some((o) => o.id === "order-phase2-1")).toBe(true);

    // -- 2. REVENUE + ROYALTIES --------------------------------------------
    // Ingest from all three sources: Polar mirror + Fake DSP + Fake PRO.
    const productReleaseMap = { [FOUNDATION_PRODUCT_ID]: FOUNDATION_RELEASE_ID };
    const ingestResult = await ingestRevenue(
      [
        new PolarRevenueSource(productReleaseMap),
        new FakeDistributorRevenueSource([
          {
            id: "dsp-1",
            releaseId: FOUNDATION_RELEASE_ID,
            grossCents: 1300,
            currency: "USD",
            occurredAt: `${PERIOD}-15T00:00:00.000Z`,
          },
        ]),
        new FakePRORevenueSource([
          {
            id: "pro-1",
            releaseId: FOUNDATION_RELEASE_ID,
            grossCents: 1000,
            currency: "USD",
            occurredAt: `${PERIOD}-20T00:00:00.000Z`,
          },
        ]),
      ],
      PERIOD,
    );
    // 1 polar + 1 distributor + 1 pro = 3 events.
    expect(ingestResult.events).toHaveLength(3);
    expect(ingestResult.countBySource).toEqual({ polar: 1, distributor: 1, pro: 1 });

    // Release gross for the period = 700 (polar) + 1300 (dsp) + 1000 (pro) = 3000.
    // Roots Untold's ownership split is 30% -> artist gross share = 900 cents.
    // Apply a flat 100c distribution fee deduction; no outstanding advance from
    // the seed, so recoupment applied = 0; net = 900 - 100 - 0 = 800.
    const statement = await generateStatement(ROOTS_UNTOLD_ARTIST_ID, PERIOD, {
      deductionsCents: 100,
      payeeName: "Roots Untold",
    });

    // Reconciliation invariant (the load-bearing assertion).
    expect(statement.grossCents - statement.deductionsCents - statement.recoupmentAppliedCents).toBe(
      statement.netCents,
    );
    // Concrete computed end-state.
    expect(statement.grossCents).toBe(900);
    expect(statement.deductionsCents).toBe(100);
    expect(statement.recoupmentAppliedCents).toBe(0);
    expect(statement.netCents).toBe(800);

    // The per-source breakdown sums to the artist gross share; every source > 0.
    const bySourceTotal =
      statement.revenueBySource.polar +
      statement.revenueBySource.distributor +
      statement.revenueBySource.pro;
    expect(bySourceTotal).toBe(statement.grossCents);
    expect(statement.revenueBySource.polar).toBeGreaterThan(0);
    expect(statement.revenueBySource.distributor).toBeGreaterThan(0);
    expect(statement.revenueBySource.pro).toBeGreaterThan(0);

    // The statement persisted under the admin-only collection.
    const persisted = await db.collection("royalty_statements").doc(statement.id).get();
    expect(persisted.exists).toBe(true);
    expect((persisted.data() as { netCents: number }).netCents).toBe(800);

    // Propose a payout off the statement net (status "proposed", moves no money).
    const proposed = await proposePayout(ROOTS_UNTOLD_ARTIST_ID, statement.id, { currency: "USD" });
    expect(proposed.status).toBe("proposed");
    expect(proposed.amountCents).toBe(800);

    // -- 3. AGENT + APPROVALGATE -------------------------------------------
    // The ScriptedModel drives the assembled agent: a NON-consequential
    // schedule_release (executes + audited), then a CONSEQUENTIAL initiate_payout
    // (blocked pending approval), then a final answer.
    const approvalsStore = new FirestoreApprovalsStore();
    const auditStore = new FirestoreAuditStore();
    const threadId = "phase2-thread";
    const runId = "phase2-run";

    const model = new ScriptedModel([
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "schedule_release",
            id: "call-sched",
            args: {
              releaseId: FOUNDATION_RELEASE_ID,
              scheduledAt: `${PERIOD}-04T00:00:00Z`,
            },
          },
        ],
      }),
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "initiate_payout",
            id: "call-payout",
            args: { payoutId: proposed.id },
          },
        ],
      }),
      new AIMessage({ content: "Scheduled the release and requested payout approval." }),
    ]);

    const agent = buildLabelAgent({
      model,
      approval: { runId, threadId, approvalsStore, auditStore },
    });
    const messages: BaseMessage[] = [
      new SystemMessage(agent.systemPrompt),
      new HumanMessage("Schedule Foundation Stones for distribution and pay out the artist."),
    ];
    const result = await agent.graph.invoke({ messages });
    expect(String(result.messages.at(-1)?.content)).toMatch(/scheduled/i);

    // schedule_release (non-consequential) executed -> a scheduled record exists.
    const scheduled = await getDistribution(FOUNDATION_RELEASE_ID);
    expect(scheduled?.status).toBe("scheduled");
    expect(scheduled?.scheduledAt).toBe(`${PERIOD}-04T00:00:00Z`);

    // initiate_payout (consequential) was BLOCKED — the payout did NOT execute.
    const payoutAfterAgent = await getPayout(proposed.id);
    expect(payoutAfterAgent?.status).toBe("proposed");

    // A pending approval + a blocked-audit row were written for the payout.
    const pending = await listPendingApprovals(approvalsStore);
    const payoutApproval = pending.find((p) => p.tool === "initiate_payout");
    expect(payoutApproval).toBeDefined();
    const audit = await listAuditEntries(threadId, auditStore);
    const decisions = audit.map((e) => `${e.tool}:${e.decision}`);
    expect(decisions).toContain("schedule_release:executed");
    expect(decisions).toContain("initiate_payout:blocked-pending-approval");

    // The human approves the payout out-of-band; re-issuing the SAME call now
    // executes (reaching only the documented no-money stub). Build a fresh agent
    // bound to the SAME stores so its wrapped tool consults the approved record.
    await approve(payoutApproval!.approvalId, approvalsStore);
    const reAgent = buildLabelAgent({
      model: new ScriptedModel([]),
      approval: { runId, threadId, approvalsStore, auditStore },
    });
    const reIssued = reAgent.tools.find((t) => t.name === "initiate_payout");
    expect(reIssued).toBeDefined();
    const payoutResult = await reIssued!.invoke({ payoutId: proposed.id });
    expect(String(payoutResult)).toMatch(/no money/i);
    const payoutExecuted = await getPayout(proposed.id);
    expect(payoutExecuted?.status).toBe("executed-stub");

    // -- 4. DISTRIBUTION GATE ----------------------------------------------
    const distributor = new FakeDistributorClient();
    // Unapproved delivery is REFUSED — the distributor is never touched.
    await expect(
      deliverRelease(FOUNDATION_RELEASE_ID, { client: distributor, approved: false }),
    ).rejects.toThrow(APPROVAL_REQUIRED_MESSAGE);
    expect(distributor.deliveries).toHaveLength(0);

    // The human approves; delivery proceeds (compliance passes from the seed).
    const delivered = await deliverRelease(FOUNDATION_RELEASE_ID, {
      client: distributor,
      approved: true,
    });
    expect(distributor.deliveries).toHaveLength(1);
    expect(delivered.deliveryId).toBeTruthy();
    expect(delivered.status).toBe("accepted");

    // A status refresh advances accepted -> delivered (FakeDistributor behaviour).
    const refreshed = await refreshDistributionStatus(FOUNDATION_RELEASE_ID, distributor);
    expect(refreshed.status).toBe("delivered");
    const finalDist = await getDistribution(FOUNDATION_RELEASE_ID);
    expect(finalDist?.status).toBe("delivered");
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
