/**
 * Payout tests (P2B05, F7) — EMULATOR-only. Guarded so plain `pnpm test` skips
 * them; run via `pnpm test:emulator`.
 *
 * The HEADLINE finance gate. Proves:
 *   - proposePayout writes a payouts/{id} record with status "proposed"
 *     (amount = statement net); no money moves,
 *   - `initiate_payout`, issued by the ASSEMBLED agent under the P2B04
 *     ApprovalGate, is BLOCKED until approved: the payout is NOT executed, a
 *     pending approval + a blocked audit entry exist,
 *   - after approve(), re-issuing the SAME call proceeds to the DOCUMENTED STUB
 *     (status "executed-stub") — still NO real money moved,
 *   - NO live payment rail/call is reachable (the only "execute" path is the
 *     stub, which moves no money).
 */
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import { buildLabelAgent } from "../app/agent/leadAgent";
import type { ChatModelLike } from "../harness/runtime";
import {
  approve,
  type ApprovalRecord,
  type ApprovalsStore,
} from "../harness/orchestration/approvalGate";
import type { AuditEntry, AuditStore } from "../harness/orchestration/audit";
import { seedRootsUntold, ROOTS_UNTOLD_ARTIST_ID, FOUNDATION_RELEASE_ID } from "../app/label/seed";
import { ingestRevenue, FakeDistributorRevenueSource } from "../app/finance/revenue";
import { generateStatement } from "../app/finance/statements";
import { proposePayout, getPayout, payoutId } from "../app/finance/payout";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;
const PERIOD = "2026-Q4";

class MemoryApprovalsStore implements ApprovalsStore {
  public readonly records = new Map<string, ApprovalRecord>();
  async get(id: string): Promise<ApprovalRecord | null> {
    return this.records.get(id) ?? null;
  }
  async putPending(record: ApprovalRecord): Promise<ApprovalRecord> {
    const existing = this.records.get(record.approvalId);
    if (existing) return existing;
    this.records.set(record.approvalId, { ...record });
    return record;
  }
  async setStatus(id: string, status: "approved" | "rejected"): Promise<ApprovalRecord> {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Unknown approval: ${id}`);
    const updated = { ...existing, status, decidedAt: "2026-06-21T00:00:00.000Z" };
    this.records.set(id, updated);
    return updated;
  }
  async listPending(): Promise<ApprovalRecord[]> {
    return [...this.records.values()].filter((r) => r.status === "pending");
  }
}

class MemoryAuditStore implements AuditStore {
  public readonly entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push({ ...entry });
  }
  async list(threadId: string): Promise<AuditEntry[]> {
    return this.entries.filter((e) => e.threadId === threadId);
  }
}

/** Scripted model: emits queued AIMessages in order (no LLM, no network). */
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

async function seedProposedPayout(): Promise<string> {
  await seedRootsUntold();
  // Ensure a clean (no-advance) recoupment account for the artist so the
  // statement net equals the artist's gross share (no cross-suite pollution).
  await getDb().collection("recoupment").doc(ROOTS_UNTOLD_ARTIST_ID).delete();
  await ingestRevenue(
    [
      new FakeDistributorRevenueSource([
        { id: "dsp", releaseId: FOUNDATION_RELEASE_ID, grossCents: 10_000, currency: "USD", occurredAt: "2026-11-01T00:00:00Z" },
      ]),
    ],
    PERIOD,
  );
  const statement = await generateStatement(ROOTS_UNTOLD_ARTIST_ID, PERIOD, { payeeName: "Roots Untold" });
  const payout = await proposePayout(ROOTS_UNTOLD_ARTIST_ID, statement.id);
  return payout.id;
}

describe.skipIf(RUN)("payouts: propose + gated initiate (emulator)", () => {
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
      "revenue_events",
      "recoupment",
      "royalty_statements",
      "payouts",
    ]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("proposePayout writes a 'proposed' record with amount = statement net", async () => {
    const id = await seedProposedPayout();
    const payout = await getPayout(id);
    expect(payout?.status).toBe("proposed");
    // Roots Untold = 30% of 10000 = 3000.
    expect(payout?.amountCents).toBe(3_000);
    expect(payout?.executedAt).toBeUndefined();
  });

  it("initiate_payout via the agent + ApprovalGate is BLOCKED until approved; then reaches the stub (no money)", async () => {
    const pid = await seedProposedPayout();

    const approvalsStore = new MemoryApprovalsStore();
    const auditStore = new MemoryAuditStore();
    const threadId = "thread-payout-1";

    // The agent emits an initiate_payout tool call, then a final answer.
    const script = (): ScriptedModel =>
      new ScriptedModel([
        new AIMessage({
          content: "",
          tool_calls: [{ name: "initiate_payout", id: "call-payout", args: { payoutId: pid } }],
        }),
        new AIMessage({ content: "Done with payout step." }),
      ]);

    const agent = buildLabelAgent({
      model: script(),
      approval: { runId: "run-payout-1", threadId, approvalsStore, auditStore },
    });
    // initiate_payout is one of the agent's tools and is consequential.
    expect(agent.tools.map((t) => t.name)).toContain("initiate_payout");

    const messages: BaseMessage[] = [
      new SystemMessage(agent.systemPrompt),
      new HumanMessage("Pay out the Roots Untold statement."),
    ];
    await agent.graph.invoke({ messages });

    // BLOCKED: payout NOT executed (still "proposed", no executedAt).
    const afterBlock = await getPayout(pid);
    expect(afterBlock?.status).toBe("proposed");
    expect(afterBlock?.executedAt).toBeUndefined();

    // A pending approval + a blocked audit entry exist.
    const pending = await approvalsStore.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].tool).toBe("initiate_payout");
    const blockedAudit = auditStore.entries.filter(
      (e) => e.tool === "initiate_payout" && e.decision === "blocked-pending-approval",
    );
    expect(blockedAudit).toHaveLength(1);

    // Approve the pending request, re-run the SAME call.
    await approve(pending[0].approvalId, approvalsStore);
    const agent2 = buildLabelAgent({
      model: script(),
      approval: { runId: "run-payout-1", threadId, approvalsStore, auditStore },
    });
    await agent2.graph.invoke({
      messages: [new SystemMessage(agent2.systemPrompt), new HumanMessage("Pay out the Roots Untold statement.")],
    });

    // Now it reached the DOCUMENTED STUB — status executed-stub, NO money moved.
    const afterApprove = await getPayout(pid);
    expect(afterApprove?.status).toBe("executed-stub");
    expect(afterApprove?.executedAt).toBeDefined();
    expect(afterApprove?.note).toMatch(/no money was moved/i);
    // Amount is unchanged (mirrors the statement net; the stub touches no rail).
    expect(afterApprove?.amountCents).toBe(3_000);

    // The executed audit entry was recorded.
    const executedAudit = auditStore.entries.filter(
      (e) => e.tool === "initiate_payout" && e.decision === "executed",
    );
    expect(executedAudit).toHaveLength(1);

    expect(payoutId).toBeDefined();
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
