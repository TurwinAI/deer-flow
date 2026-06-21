/**
 * Owner-only Pending Approvals console (P2B10).
 *
 * The autonomy ApprovalGate BLOCKS consequential agent actions (deliver to DSP,
 * payout, sync-license, marketing spend/post/email) pending a human decision.
 * This page lets the owner review each blocked action (tool + args summary) and
 * APPROVE it. Approving removes it from the list.
 *
 * Gated behind the `isAdmin` claim (via `watchAdminSession`). All data flows
 * through `src/lib/admin`, which is in-memory in fixtures mode and the
 * admin-guarded `adminListPendingApprovals` / `adminApprove` callables in
 * production.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { approvePending, listPendingApprovals, type PendingApproval } from "../lib/admin";
import { watchAdminSession, type AdminSession } from "../lib/auth";

export default function AdminApprovals() {
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => watchAdminSession(setSession), []);

  const refresh = useCallback(async () => {
    setApprovals(await listPendingApprovals());
  }, []);

  useEffect(() => {
    if (session?.isAdmin) void refresh();
  }, [session?.isAdmin, refresh]);

  async function approve(approvalId: string) {
    setBusy(approvalId);
    try {
      await approvePending(approvalId);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  if (session === undefined) return <p>Checking access…</p>;
  if (!session || !session.isAdmin) {
    return (
      <section aria-labelledby="approvals-denied">
        <h1 id="approvals-denied">Admin sign-in required</h1>
        <p>Pending approvals are owner-only.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="approvals-heading">
      <h1 id="approvals-heading">Pending approvals</h1>
      <p>
        Consequential agent actions wait here for your approval before they run.{" "}
        <Link to="/admin">← Back to admin</Link>
      </p>

      {approvals.length === 0 ? (
        <p role="status">No actions are pending approval.</p>
      ) : (
        <ul aria-label="Pending approvals">
          {approvals.map((a) => (
            <li key={a.approvalId} data-tool={a.tool}>
              <span className="approval-tool">{a.tool}</span>{" "}
              <span className="approval-args">{a.argsSummary}</span>
              <button
                type="button"
                onClick={() => approve(a.approvalId)}
                disabled={busy === a.approvalId}
                aria-label={`Approve ${a.tool}`}
              >
                {busy === a.approvalId ? "Approving…" : "Approve"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
