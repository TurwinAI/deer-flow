/**
 * ApprovalGate unit gate (P2B04, F12) — OFFLINE, no emulator.
 *
 * The PROOF that the gate blocks a consequential call until approved. A fake
 * consequential tool carries an OBSERVABLE side effect (it pushes onto an array
 * + increments a counter). We assert:
 *   - a consequential call with NO approval is BLOCKED: the side effect did NOT
 *     happen, a pending ApprovalRecord is written, and an audit entry
 *     "blocked-pending-approval" is recorded,
 *   - after approve(approvalId), the SAME call EXECUTES (side effect happens)
 *     and audits "executed",
 *   - a NON-consequential tool executes and audits "executed" without any gate.
 *
 * Stores are in-memory fakes so no Firestore/network is needed.
 */
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  wrapTools,
  approve,
  listPendingApprovals,
  approvalIdFor,
  hashArgs,
  type ApprovalRecord,
  type ApprovalsStore,
} from "../harness/orchestration/approvalGate";
import type { AuditEntry, AuditStore } from "../harness/orchestration/audit";

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
  async setStatus(
    id: string,
    status: "approved" | "rejected",
  ): Promise<ApprovalRecord> {
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

/** A fake consequential tool with an OBSERVABLE side effect. */
function buildSideEffectTool(sink: string[]) {
  return new DynamicStructuredTool({
    name: "deliver_release",
    description: "CONSEQUENTIAL: deliver a release (records a side effect).",
    schema: z.object({ releaseId: z.string() }),
    func: async (input: { releaseId: string }): Promise<string> => {
      sink.push(input.releaseId); // <-- the observable side effect
      return `delivered ${input.releaseId}`;
    },
  });
}

function buildEchoTool() {
  return new DynamicStructuredTool({
    name: "echo",
    description: "non-consequential echo",
    schema: z.object({ text: z.string() }),
    func: async (input: { text: string }): Promise<string> => `echo:${input.text}`,
  });
}

const CONSEQUENTIAL = ["deliver_release"] as const;

describe("ApprovalGate (P2B04)", () => {
  it("BLOCKS a consequential call so the side-effect-did-not-happen until approved", async () => {
    const sideEffects: string[] = [];
    const approvals = new MemoryApprovalsStore();
    const audit = new MemoryAuditStore();
    const [wrappedDeliver] = wrapTools([buildSideEffectTool(sideEffects)], {
      consequentialTools: CONSEQUENTIAL,
      approvalsStore: approvals,
      auditStore: audit,
      runId: "run-1",
      threadId: "thread-1",
    });

    // 1) First call: BLOCKED. The side effect MUST NOT have happened.
    const blocked = await wrappedDeliver.invoke({ releaseId: "foundation-stones" });
    expect(sideEffects).toHaveLength(0); // <-- PROOF: tool did not run
    const parsed = JSON.parse(String(blocked)) as { approvalRequired: boolean; approvalId: string };
    expect(parsed.approvalRequired).toBe(true);

    // a pending ApprovalRecord was written...
    const pending = await listPendingApprovals(approvals);
    expect(pending).toHaveLength(1);
    expect(pending[0].tool).toBe("deliver_release");
    expect(pending[0].status).toBe("pending");
    const expectedId = approvalIdFor("deliver_release", hashArgs({ releaseId: "foundation-stones" }));
    expect(pending[0].approvalId).toBe(expectedId);
    expect(parsed.approvalId).toBe(expectedId);

    // ...and an audit entry "blocked-pending-approval" was recorded.
    expect(audit.entries.at(-1)).toMatchObject({
      tool: "deliver_release",
      decision: "blocked-pending-approval",
    });

    // 2) Approve, then re-issue the SAME call: it EXECUTES now.
    await approve(expectedId, approvals);
    const ran = await wrappedDeliver.invoke({ releaseId: "foundation-stones" });
    expect(String(ran)).toContain("delivered foundation-stones");
    expect(sideEffects).toEqual(["foundation-stones"]); // <-- side effect happened exactly once
    expect(audit.entries.at(-1)).toMatchObject({
      tool: "deliver_release",
      decision: "executed",
    });
  });

  it("a NON-consequential tool executes immediately and audits 'executed'", async () => {
    const approvals = new MemoryApprovalsStore();
    const audit = new MemoryAuditStore();
    const [wrappedEcho] = wrapTools([buildEchoTool()], {
      consequentialTools: CONSEQUENTIAL,
      approvalsStore: approvals,
      auditStore: audit,
      runId: "run-1",
      threadId: "thread-1",
    });

    const out = await wrappedEcho.invoke({ text: "irie" });
    expect(String(out)).toBe("echo:irie");
    expect(await listPendingApprovals(approvals)).toHaveLength(0); // never gated
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ tool: "echo", decision: "executed" });
  });

  it("different args produce distinct approvals (hash-scoped)", async () => {
    const sideEffects: string[] = [];
    const approvals = new MemoryApprovalsStore();
    const audit = new MemoryAuditStore();
    const [wrapped] = wrapTools([buildSideEffectTool(sideEffects)], {
      consequentialTools: CONSEQUENTIAL,
      approvalsStore: approvals,
      auditStore: audit,
      runId: "r",
      threadId: "t",
    });

    await wrapped.invoke({ releaseId: "rel-a" });
    await wrapped.invoke({ releaseId: "rel-b" });
    expect(sideEffects).toHaveLength(0);
    expect(await listPendingApprovals(approvals)).toHaveLength(2);

    // Approving rel-a does NOT unlock rel-b.
    await approve(approvalIdFor("deliver_release", hashArgs({ releaseId: "rel-a" })), approvals);
    await wrapped.invoke({ releaseId: "rel-a" });
    await wrapped.invoke({ releaseId: "rel-b" });
    expect(sideEffects).toEqual(["rel-a"]); // rel-b still blocked
  });

  it("approve() throws on an unknown approval id", async () => {
    const approvals = new MemoryApprovalsStore();
    await expect(approve("does-not-exist", approvals)).rejects.toThrow(/unknown approval/i);
  });
});
