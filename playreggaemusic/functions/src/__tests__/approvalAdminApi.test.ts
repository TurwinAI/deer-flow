/**
 * Autonomy-orchestration admin-callable auth-guard tests (P2B04) — OFFLINE unit.
 *
 * The orchestration ops (listPendingApprovals / approve / listAuditEntries) are
 * MOCKED so the handlers never touch Firestore. Assertions focus on assertAdmin
 * running FIRST: a non-admin / unauthenticated caller is rejected and the
 * underlying op is NEVER called; an admin caller is allowed through; malformed
 * input is rejected.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const listPendingApprovals = vi.fn(async () => [
  { approvalId: "deliver_release__abc", tool: "deliver_release", status: "pending" },
]);
const approve = vi.fn(async (approvalId: string) => ({
  approvalId,
  tool: "deliver_release",
  status: "approved",
}));
const listAuditEntries = vi.fn(async (threadId: string) => [
  { runId: "r", threadId, tool: "echo", argsSummary: "{}", decision: "executed", timestamp: "t" },
]);

vi.mock("../harness/orchestration", () => ({
  listPendingApprovals: () => listPendingApprovals(),
  approve: (approvalId: string) => approve(approvalId),
  listAuditEntries: (threadId: string) => listAuditEntries(threadId),
}));

import {
  handleListPendingApprovals,
  handleApprove,
  handleListAudit,
  type AdminAuthContext,
} from "../app/gateway/adminApi";

const ADMIN: AdminAuthContext = { uid: "owner", token: { admin: true } };
const NON_ADMIN: AdminAuthContext = { uid: "fan", token: { admin: false } };

describe("autonomy orchestration admin callables (P2B04)", () => {
  afterEach(() => vi.clearAllMocks());

  it("handleListPendingApprovals rejects non-admin and never lists", async () => {
    await expect(
      handleListPendingApprovals({ auth: NON_ADMIN, data: {} }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(listPendingApprovals).not.toHaveBeenCalled();
  });

  it("handleListPendingApprovals rejects unauthenticated", async () => {
    await expect(
      handleListPendingApprovals({ auth: undefined, data: {} }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(listPendingApprovals).not.toHaveBeenCalled();
  });

  it("handleListPendingApprovals allows admin", async () => {
    const out = await handleListPendingApprovals({ auth: ADMIN, data: {} });
    expect(out).toHaveLength(1);
    expect(listPendingApprovals).toHaveBeenCalledOnce();
  });

  it("handleApprove rejects non-admin and never approves", async () => {
    await expect(
      handleApprove({ auth: NON_ADMIN, data: { approvalId: "x" } }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(approve).not.toHaveBeenCalled();
  });

  it("handleApprove allows admin and approves the id", async () => {
    const out = await handleApprove({ auth: ADMIN, data: { approvalId: "deliver_release__abc" } });
    expect(out.status).toBe("approved");
    expect(approve).toHaveBeenCalledWith("deliver_release__abc");
  });

  it("handleApprove rejects malformed input", async () => {
    await expect(handleApprove({ auth: ADMIN, data: {} })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    expect(approve).not.toHaveBeenCalled();
  });

  it("handleListAudit rejects non-admin and allows admin", async () => {
    await expect(
      handleListAudit({ auth: NON_ADMIN, data: { threadId: "t1" } }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(listAuditEntries).not.toHaveBeenCalled();

    const out = await handleListAudit({ auth: ADMIN, data: { threadId: "t1" } });
    expect(out).toHaveLength(1);
    expect(listAuditEntries).toHaveBeenCalledWith("t1");
  });

  it("handleListAudit rejects malformed input", async () => {
    await expect(handleListAudit({ auth: ADMIN, data: {} })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});
