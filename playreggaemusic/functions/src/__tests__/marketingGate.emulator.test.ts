/**
 * Marketing consequential-action gate (P2B07, F5) — EMULATOR-only. Guarded so
 * plain `pnpm test` skips it; run via `pnpm test:emulator`.
 *
 * Drives the ASSEMBLED label agent + the generic P2B04 ApprovalGate end-to-end
 * (real Firestore-backed approvals + audit stores). For EACH of the three
 * outward/spending marketing tools — publish_social_post, send_email_blast,
 * marketing_spend — proves:
 *   - pre-approval the call is BLOCKED: the INJECTED Fake channel recorded NO
 *     call, a pending_approvals row exists, and the audit log has a blocked row,
 *   - after approve(id) + re-run the SAME call EXECUTES: the Fake channel records
 *     EXACTLY one call and the audit log has an executed row.
 * The Fake channels are the ONLY adapters wired in — no live social/email/ad
 * network is reachable. A scripted model drives the agent (no live LLM).
 */
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import { buildLabelAgent } from "../app/agent/leadAgent";
import {
  FakeSocialChannel,
  FakeEmailChannel,
  FakeAdChannel,
} from "../app/marketing/channels";
import {
  approve,
  listPendingApprovals,
  FirestoreApprovalsStore,
} from "../harness/orchestration/approvalGate";
import { listAuditEntries, FirestoreAuditStore } from "../harness/orchestration/audit";
import type { ChatModelLike } from "../harness/runtime";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

/** Scripted model: returns queued AIMessages in order (no network). */
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

/** A model that issues one tool call, then (next turn) a final answer. */
function oneCall(name: string, args: Record<string, unknown>): AIMessage[] {
  return [
    new AIMessage({ content: "", tool_calls: [{ name, id: `call-${name}`, args }] }),
    new AIMessage({ content: "done" }),
  ];
}

describe.skipIf(RUN)("marketing consequential gate (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of ["pending_approvals", "audit_log"]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  interface ChannelBundle {
    deps: { socialChannel?: FakeSocialChannel; emailChannel?: FakeEmailChannel; adChannel?: FakeAdChannel };
    count: () => number;
  }

  /** Total recorded calls across whichever Fake channel is wired. */
  function totalCalls(b: ChannelBundle): number {
    return b.count();
  }

  async function runGateCase(
    tool: string,
    args: Record<string, unknown>,
    makeBundle: () => ChannelBundle,
  ): Promise<void> {
    const approvalsStore = new FirestoreApprovalsStore();
    const auditStore = new FirestoreAuditStore();
    const threadId = `mkt-${tool}`;
    const runId = `run-${tool}`;

    // First run: model issues the consequential call, gate BLOCKS it.
    const bundle1 = makeBundle();
    const agent1 = buildLabelAgent({
      model: new ScriptedModel(oneCall(tool, args)),
      ...bundle1.deps,
      approval: { runId, threadId, approvalsStore, auditStore },
    });
    // Prove the tool is wired into the agent (only the Fake adapters are used).
    expect(agent1.tools.map((t) => t.name)).toContain(tool);

    await agent1.graph.invoke({
      messages: [new SystemMessage(agent1.systemPrompt), new HumanMessage(`Please ${tool}.`)],
    });

    // BLOCKED: no Fake channel call happened.
    expect(totalCalls(bundle1)).toBe(0);

    // pending_approvals + blocked audit row exist for this tool.
    const pending = await listPendingApprovals(approvalsStore);
    const mine = pending.find((p) => p.tool === tool);
    expect(mine).toBeDefined();
    const auditBefore = await listAuditEntries(threadId, auditStore);
    expect(auditBefore.map((e) => `${e.tool}:${e.decision}`)).toContain(
      `${tool}:blocked-pending-approval`,
    );

    // Approve the pending request.
    await approve(mine!.approvalId, approvalsStore);

    // Second run with FRESH channels: the SAME call now EXECUTES exactly once.
    const bundle2 = makeBundle();
    const agent2 = buildLabelAgent({
      model: new ScriptedModel(oneCall(tool, args)),
      ...bundle2.deps,
      approval: { runId, threadId, approvalsStore, auditStore },
    });
    await agent2.graph.invoke({
      messages: [new SystemMessage(agent2.systemPrompt), new HumanMessage(`Please ${tool}.`)],
    });
    expect(totalCalls(bundle2)).toBe(1);

    const auditAfter = await listAuditEntries(threadId, auditStore);
    expect(auditAfter.map((e) => `${e.tool}:${e.decision}`)).toContain(`${tool}:executed`);
  }

  it("publish_social_post is blocked until approved (Fake records 1 call after)", async () => {
    await runGateCase(
      "publish_social_post",
      { platform: "instagram", message: "Foundation Stones out now" },
      () => {
        const ch = new FakeSocialChannel();
        return { deps: { socialChannel: ch }, count: () => ch.posts.length };
      },
    );
  });

  it("send_email_blast is blocked until approved (Fake records 1 call after)", async () => {
    await runGateCase(
      "send_email_blast",
      { segment: "newsletter", subject: "New EP", body: "Foundation Stones is here" },
      () => {
        const ch = new FakeEmailChannel();
        return { deps: { emailChannel: ch }, count: () => ch.blasts.length };
      },
    );
  });

  it("marketing_spend is blocked until approved (Fake records 1 call after)", async () => {
    await runGateCase(
      "marketing_spend",
      { platform: "meta", budgetCents: 5000, currency: "USD", objective: "reach" },
      () => {
        const ch = new FakeAdChannel();
        return { deps: { adChannel: ch }, count: () => ch.spends.length };
      },
    );
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
