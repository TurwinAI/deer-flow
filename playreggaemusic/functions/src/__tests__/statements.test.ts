/**
 * Royalty statement tests (P2B05, F7) — unit reconciliation + emulator.
 *
 * EMULATOR-only (generateStatement reads/writes Firestore). Guarded so plain
 * `pnpm test` skips it; run via `pnpm test:emulator`.
 *
 * Proves:
 *   - a generated statement RECONCILES: gross - deductions - recoupment === net,
 *   - revenueBySource totals sum to the statement gross (and reflect the events),
 *   - recoupment is applied (and persisted) against the artist's gross share,
 *   - the statement is stored in the admin-only royalty_statements collection.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import { seedRootsUntold, FOUNDATION_RELEASE_ID, ROOTS_UNTOLD_ARTIST_ID } from "../app/label/seed";
import { ingestRevenue, FakeDistributorRevenueSource, FakePRORevenueSource } from "../app/finance/revenue";
import { recordAdvance, getRecoupmentAccount } from "../app/finance/recoupment";
import { generateStatement, getStatement } from "../app/finance/statements";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;
const PERIOD = "2026-Q3";

describe.skipIf(RUN)("royalty statements (emulator)", () => {
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
    ]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("reconciles (gross - deductions - recoupment === net) and sums revenueBySource", async () => {
    await seedRootsUntold();
    // Guard against cross-suite recoupment pollution for the shared artist id.
    await getDb().collection("recoupment").doc(ROOTS_UNTOLD_ARTIST_ID).delete();
    // The seed splits give "Roots Untold" 30% of the release. Ingest distributor
    // + PRO income attributed to the release for the period.
    await ingestRevenue(
      [
        new FakeDistributorRevenueSource([
          {
            id: "dsp-1",
            releaseId: FOUNDATION_RELEASE_ID,
            grossCents: 10_000,
            currency: "USD",
            occurredAt: "2026-08-01T00:00:00Z",
          },
        ]),
        new FakePRORevenueSource([
          {
            id: "pro-1",
            releaseId: FOUNDATION_RELEASE_ID,
            grossCents: 5_000,
            currency: "USD",
            occurredAt: "2026-08-15T00:00:00Z",
          },
        ]),
      ],
      PERIOD,
    );

    const statement = await generateStatement(ROOTS_UNTOLD_ARTIST_ID, PERIOD, {
      payeeName: "Roots Untold",
    });

    // Artist gross = 30% of 15000 = 4500.
    expect(statement.grossCents).toBe(4_500);
    // No advance recorded -> no recoupment, no deductions.
    expect(statement.deductionsCents).toBe(0);
    expect(statement.recoupmentAppliedCents).toBe(0);
    // RECONCILES.
    expect(statement.grossCents - statement.deductionsCents - statement.recoupmentAppliedCents).toBe(
      statement.netCents,
    );
    expect(statement.netCents).toBe(4_500);
    // revenueBySource sums to gross; spans distributor + pro (no polar here).
    const bySourceTotal =
      statement.revenueBySource.polar +
      statement.revenueBySource.distributor +
      statement.revenueBySource.pro;
    expect(bySourceTotal).toBe(statement.grossCents);
    expect(statement.revenueBySource.distributor).toBe(3_000); // 30% of 10000
    expect(statement.revenueBySource.pro).toBe(1_500); // 30% of 5000

    // Stored in the admin-only collection.
    const stored = await getStatement(statement.id);
    expect(stored?.netCents).toBe(4_500);
  });

  it("applies + persists recoupment against the artist share before net", async () => {
    await seedRootsUntold();
    await recordAdvance(ROOTS_UNTOLD_ARTIST_ID, 2_000); // outstanding advance
    await ingestRevenue(
      [
        new FakeDistributorRevenueSource([
          {
            id: "dsp-2",
            releaseId: FOUNDATION_RELEASE_ID,
            grossCents: 10_000,
            currency: "USD",
            occurredAt: "2026-08-02T00:00:00Z",
          },
        ]),
      ],
      PERIOD,
    );

    const statement = await generateStatement(ROOTS_UNTOLD_ARTIST_ID, PERIOD, {
      payeeName: "Roots Untold",
      deductionsCents: 500,
    });

    // Artist gross = 30% of 10000 = 3000; after 500 deduction = 2500; recoup
    // 2000 advance -> net 500. RECONCILES.
    expect(statement.grossCents).toBe(3_000);
    expect(statement.deductionsCents).toBe(500);
    expect(statement.recoupmentAppliedCents).toBe(2_000);
    expect(statement.netCents).toBe(500);
    expect(statement.grossCents - statement.deductionsCents - statement.recoupmentAppliedCents).toBe(
      statement.netCents,
    );

    // The recoupment was PERSISTED (advance now fully recouped).
    const account = await getRecoupmentAccount(ROOTS_UNTOLD_ARTIST_ID);
    expect(account.recoupedCents).toBe(2_000);
    expect(account.advanceCents).toBe(2_000);
  });

  it("throws for an unknown artist", async () => {
    await expect(generateStatement("nobody", PERIOD)).rejects.toThrow(/Unknown artist/);
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
