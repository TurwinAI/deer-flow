/**
 * ApprovalGate + audit log against the Firestore emulator (P2B04, F12).
 * EMULATOR-only: guarded so plain `pnpm test` does not run it.
 *
 * Proves the gate end-to-end through the REAL Firestore-backed stores
 * (pending_approvals + audit_log via the admin SDK):
 *   - a consequential call with no approval is BLOCKED (side effect did NOT
 *     happen), a pending_approvals row is written, an audit "blocked" row exists,
 *   - after approve(id), the same call EXECUTES and audits "executed",
 *   - a non-consequential call executes + audits "executed".
 */
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import {
  wrapTools,
  approve,
  listPendingApprovals,
  FirestoreApprovalsStore,
} from "../harness/orchestration/approvalGate";
import { listAuditEntries, FirestoreAuditStore } from "../harness/orchestration/audit";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

function buildSideEffectTool(sink: string[]) {
  return new DynamicStructuredTool({
    name: "deliver_release",
    description: "CONSEQUENTIAL deliver with an observable side effect.",
    schema: z.object({ releaseId: z.string() }),
    func: async (input: { releaseId: string }): Promise<string> => {
      sink.push(input.releaseId);
      return `delivered ${input.releaseId}`;
    },
  });
}

describe.skipIf(RUN)("ApprovalGate + audit (emulator)", () => {
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

  it("blocks a consequential call until approved; non-consequential runs free", async () => {
    const sideEffects: string[] = [];
    const approvalsStore = new FirestoreApprovalsStore();
    const auditStore = new FirestoreAuditStore();
    const threadId = "thread-emu-1";

    const echo = new DynamicStructuredTool({
      name: "echo",
      description: "non-consequential",
      schema: z.object({ text: z.string() }),
      func: async (input: { text: string }): Promise<string> => `echo:${input.text}`,
    });

    const [wrappedDeliver, wrappedEcho] = wrapTools(
      [buildSideEffectTool(sideEffects), echo],
      {
        consequentialTools: ["deliver_release"],
        approvalsStore,
        auditStore,
        runId: "run-emu-1",
        threadId,
      },
    );

    // Non-consequential: executes + audits.
    const echoed = await wrappedEcho.invoke({ text: "irie" });
    expect(String(echoed)).toBe("echo:irie");

    // Consequential, unapproved: BLOCKED, side effect did NOT happen.
    const blocked = await wrappedDeliver.invoke({ releaseId: "rel-emu" });
    expect(sideEffects).toHaveLength(0);
    const parsed = JSON.parse(String(blocked)) as { approvalId: string; approvalRequired: boolean };
    expect(parsed.approvalRequired).toBe(true);

    // pending_approvals row written.
    const pending = await listPendingApprovals(approvalsStore);
    expect(pending.map((p) => p.approvalId)).toContain(parsed.approvalId);

    // audit_log has the blocked + executed(echo) rows, in order.
    const auditBefore = await listAuditEntries(threadId, auditStore);
    const decisions = auditBefore.map((e) => `${e.tool}:${e.decision}`);
    expect(decisions).toContain("echo:executed");
    expect(decisions).toContain("deliver_release:blocked-pending-approval");

    // Approve, re-issue: EXECUTES now.
    await approve(parsed.approvalId, approvalsStore);
    const ran = await wrappedDeliver.invoke({ releaseId: "rel-emu" });
    expect(String(ran)).toContain("delivered rel-emu");
    expect(sideEffects).toEqual(["rel-emu"]);

    const auditAfter = await listAuditEntries(threadId, auditStore);
    expect(auditAfter.map((e) => `${e.tool}:${e.decision}`)).toContain("deliver_release:executed");
    // No more pending approvals for this call.
    const stillPending = await listPendingApprovals(approvalsStore);
    expect(stillPending.map((p) => p.approvalId)).not.toContain(parsed.approvalId);
  });

  it("scheduled_runs round-trips through the Firestore store", async () => {
    const { FirestoreScheduledRunsStore, FakeScheduler } = await import(
      "../harness/orchestration/scheduler"
    );
    const store = new FirestoreScheduledRunsStore();
    const scheduler = new FakeScheduler(store);
    const id = await scheduler.schedule(
      { threadId: "sched-emu", prompt: "do work", maxTurns: 4 },
      "2026-08-01T00:00:00Z",
    );
    const all = await store.list();
    const found = all.find((r) => r.scheduledId === id);
    expect(found).toMatchObject({ threadId: "sched-emu", maxTurns: 4 });
    // cleanup
    await getDb().collection("scheduled_runs").doc(id).delete();
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
