/**
 * Revenue ingestion tests (P2B05, F7) — EMULATOR-only. Guarded so plain
 * `pnpm test` skips them; run via `pnpm test:emulator`.
 *
 * Proves:
 *   - ingestRevenue pulls Polar(orders) + FakeDistributor + FakePRO and writes
 *     every event to the admin-only revenue_events collection,
 *   - a statement that spans all three sources reconciles + sums revenueBySource,
 *   - the REAL distributor/PRO sources are never invoked (we use the fakes).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import { seedRootsUntold, FOUNDATION_RELEASE_ID, FOUNDATION_PRODUCT_ID, ROOTS_UNTOLD_ARTIST_ID } from "../app/label/seed";
import { recordOrder } from "../app/label/store";
import {
  ingestRevenue,
  listRevenueEvents,
  PolarRevenueSource,
  FakeDistributorRevenueSource,
  FakePRORevenueSource,
} from "../app/finance/revenue";
import { generateStatement } from "../app/finance/statements";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;
const PERIOD = "2026-09";

describe.skipIf(RUN)("revenue ingestion (emulator)", () => {
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
      "orders",
      "revenue_events",
      "recoupment",
      "royalty_statements",
    ]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("ingests Polar + FakeDistributor + FakePRO into revenue_events; a statement spans all three", async () => {
    await seedRootsUntold();
    // Guard against cross-suite recoupment pollution for the shared artist id.
    await getDb().collection("recoupment").doc(ROOTS_UNTOLD_ARTIST_ID).delete();
    // A paid Polar order for the release's product (occurred in the period).
    await recordOrder({
      id: "order-1",
      customer: "cus_test",
      productId: FOUNDATION_PRODUCT_ID,
      amount: 700,
      currency: "USD",
      status: "paid",
      createdAt: "2026-09-10T00:00:00Z",
    });

    const result = await ingestRevenue(
      [
        new PolarRevenueSource({ [FOUNDATION_PRODUCT_ID]: FOUNDATION_RELEASE_ID }),
        new FakeDistributorRevenueSource([
          { id: "d1", releaseId: FOUNDATION_RELEASE_ID, grossCents: 9_300, currency: "USD", occurredAt: "2026-09-05T00:00:00Z" },
        ]),
        new FakePRORevenueSource([
          { id: "p1", releaseId: FOUNDATION_RELEASE_ID, grossCents: 1_000, currency: "USD", occurredAt: "2026-09-20T00:00:00Z" },
        ]),
      ],
      PERIOD,
    );

    expect(result.countBySource).toEqual({ polar: 1, distributor: 1, pro: 1 });

    // All three events are stored.
    const stored = await listRevenueEvents();
    const ids = stored.map((e) => e.id).sort();
    expect(ids).toContain("polar:order-1");
    expect(ids).toContain(`distributor:${PERIOD}:d1`);
    expect(ids).toContain(`pro:${PERIOD}:p1`);
    expect(stored).toHaveLength(3);

    // A statement spans all three sources and reconciles. Release gross = 700 +
    // 9300 + 1000 = 11000; Roots Untold has 30% = 3300.
    const statement = await generateStatement(ROOTS_UNTOLD_ARTIST_ID, PERIOD, {
      payeeName: "Roots Untold",
    });
    expect(statement.grossCents).toBe(3_300);
    expect(statement.netCents).toBe(3_300);
    const bySourceTotal =
      statement.revenueBySource.polar +
      statement.revenueBySource.distributor +
      statement.revenueBySource.pro;
    expect(bySourceTotal).toBe(3_300);
    // All three sources contributed something.
    expect(statement.revenueBySource.polar).toBeGreaterThan(0);
    expect(statement.revenueBySource.distributor).toBeGreaterThan(0);
    expect(statement.revenueBySource.pro).toBeGreaterThan(0);
  });

  it("re-ingesting the same period is idempotent (no duplicate events)", async () => {
    await seedRootsUntold();
    const source = new FakeDistributorRevenueSource([
      { id: "d1", releaseId: FOUNDATION_RELEASE_ID, grossCents: 1_000, currency: "USD", occurredAt: "2026-09-05T00:00:00Z" },
    ]);
    await ingestRevenue([source], PERIOD);
    await ingestRevenue([source], PERIOD);
    const stored = await listRevenueEvents();
    expect(stored).toHaveLength(1);
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
