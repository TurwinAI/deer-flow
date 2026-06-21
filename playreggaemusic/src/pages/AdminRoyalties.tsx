/**
 * Owner-only Royalty statements view (P2B10).
 *
 * Lists per-artist royalty statements with the cent-exact accounting breakdown:
 * gross → deductions → recoupment → net. Totals reconcile by construction
 * (gross - deductions - recoupment = net). Read-only.
 *
 * Gated behind the `isAdmin` claim. Data flows through `src/lib/admin`
 * (`listRoyaltyStatements`) — in-memory in fixtures mode, the admin-guarded
 * `adminListStatements` callable in production.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listRoyaltyStatements, type RoyaltyStatementRow } from "../lib/admin";
import { watchAdminSession, type AdminSession } from "../lib/auth";

function usd(cents: number): string {
  return `${(cents / 100).toFixed(2)} USD`;
}

export default function AdminRoyalties() {
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined);
  const [rows, setRows] = useState<RoyaltyStatementRow[]>([]);

  useEffect(() => watchAdminSession(setSession), []);

  useEffect(() => {
    if (session?.isAdmin) void listRoyaltyStatements().then(setRows);
  }, [session?.isAdmin]);

  if (session === undefined) return <p>Checking access…</p>;
  if (!session || !session.isAdmin) {
    return (
      <section aria-labelledby="royalties-denied">
        <h1 id="royalties-denied">Admin sign-in required</h1>
        <p>Royalty statements are owner-only.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="royalties-heading">
      <h1 id="royalties-heading">Royalty statements</h1>
      <p>
        Per-artist statements. Net = gross − deductions − recoupment.{" "}
        <Link to="/admin">← Back to admin</Link>
      </p>

      {rows.length === 0 ? (
        <p role="status">No royalty statements have been generated yet.</p>
      ) : (
        <table aria-labelledby="royalties-heading">
          <thead>
            <tr>
              <th scope="col">Artist</th>
              <th scope="col">Period</th>
              <th scope="col">Gross</th>
              <th scope="col">Deductions</th>
              <th scope="col">Recoupment</th>
              <th scope="col">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} data-statement={s.id}>
                <td>{s.artistName}</td>
                <td>{s.period}</td>
                <td>{usd(s.grossCents)}</td>
                <td>{usd(s.deductionsCents)}</td>
                <td>{usd(s.recoupmentAppliedCents)}</td>
                <td>
                  <strong>{usd(s.netCents)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
