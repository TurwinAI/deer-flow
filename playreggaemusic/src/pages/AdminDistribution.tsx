/**
 * Owner-only Distribution status view (P2B10).
 *
 * Lists each release and its DSP distribution lifecycle status (scheduled →
 * delivering → accepted → delivered) so the owner can see what the autonomous
 * label has delivered. Read-only.
 *
 * Gated behind the `isAdmin` claim. Data flows through `src/lib/admin`
 * (`listDistributions`) — in-memory in fixtures mode, the admin-guarded
 * distribution-status callable in production.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listDistributions, type DistributionRow } from "../lib/admin";
import { watchAdminSession, type AdminSession } from "../lib/auth";

export default function AdminDistribution() {
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined);
  const [rows, setRows] = useState<DistributionRow[]>([]);

  useEffect(() => watchAdminSession(setSession), []);

  useEffect(() => {
    if (session?.isAdmin) void listDistributions().then(setRows);
  }, [session?.isAdmin]);

  if (session === undefined) return <p>Checking access…</p>;
  if (!session || !session.isAdmin) {
    return (
      <section aria-labelledby="distribution-denied">
        <h1 id="distribution-denied">Admin sign-in required</h1>
        <p>Distribution status is owner-only.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="distribution-heading">
      <h1 id="distribution-heading">Distribution status</h1>
      <p>
        DSP delivery status per release.{" "}
        <Link to="/admin">← Back to admin</Link>
      </p>

      {rows.length === 0 ? (
        <p role="status">No releases have been scheduled for distribution.</p>
      ) : (
        <table aria-labelledby="distribution-heading">
          <thead>
            <tr>
              <th scope="col">Release</th>
              <th scope="col">Status</th>
              <th scope="col">Scheduled</th>
              <th scope="col">Delivered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.releaseId} data-status={r.status}>
                <td>{r.title}</td>
                <td>{r.status}</td>
                <td>{r.scheduledAt ?? "—"}</td>
                <td>{r.deliveredAt ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
