/**
 * Analytics & A&R end-to-end (P2B08, F11 + F1) — EMULATOR-only. Guarded so plain
 * `pnpm test` skips it; run via `pnpm test:emulator`.
 *
 * Proves through the REAL Firestore-backed store (admin SDK):
 *   - ingestAnalytics pulls FakeDSPStatsSource + PolarSalesSource(orders) and
 *     writes every event to the admin-only analytics_events collection,
 *   - generateInsightReport writes insight_reports/{period} reconciling with the
 *     stored events (totals by source/metric, top releases),
 *   - recommendNextActions writes anr_recommendations (PROPOSALS ONLY),
 *   - CRUCIAL: a recommendation creates NO release/distribution or spend — the
 *     distributions / payouts / campaigns / marketing_events collections are
 *     UNCHANGED across the whole flow (no consequential side effect).
 * No live analytics call (the real DspStatsSource is never constructed).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import { recordOrder } from "../app/label/store";
import {
  FOUNDATION_PRODUCT_ID,
  FOUNDATION_RELEASE_ID,
} from "../app/label/seed";
import {
  ingestAnalytics,
  listAnalyticsEvents,
  FakeDSPStatsSource,
  PolarSalesSource,
} from "../app/analytics/ingest";
import { generateInsightReport, getInsightReport } from "../app/analytics/insights";
import { recommendNextActions, listRecommendations } from "../app/analytics/anr";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;
const PERIOD = "2026-10";
const REL_A = FOUNDATION_RELEASE_ID; // overperformer
const REL_B = "river-mumma"; // underperformer

/** Collections that MUST remain untouched — proving no consequential side effect. */
const SIDE_EFFECT_COLLS = ["distributions", "payouts", "campaigns", "marketing_events"] as const;

async function collectionCount(coll: string): Promise<number> {
  const snap = await getDb().collection(coll).get();
  return snap.size;
}

describe.skipIf(RUN)("analytics & A&R (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of [
      "orders",
      "analytics_events",
      "insight_reports",
      "anr_recommendations",
      ...SIDE_EFFECT_COLLS,
    ]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("ingests FakeDSP + PolarSales(orders) into analytics_events", async () => {
    // Two paid D2C orders for the release's product (-> 2 units, revenue).
    await recordOrder({ id: "ord-1", customer: "cus_a", productId: FOUNDATION_PRODUCT_ID, amount: 700, currency: "USD", status: "paid", createdAt: "2026-10-02T00:00:00Z" });
    await recordOrder({ id: "ord-2", customer: "cus_b", productId: FOUNDATION_PRODUCT_ID, amount: 700, currency: "USD", status: "paid", createdAt: "2026-10-03T00:00:00Z" });
    // A pending order MUST NOT count.
    await recordOrder({ id: "ord-3", customer: "cus_c", productId: FOUNDATION_PRODUCT_ID, amount: 700, currency: "USD", status: "pending", createdAt: "2026-10-04T00:00:00Z" });

    const result = await ingestAnalytics(
      [
        new PolarSalesSource({ [FOUNDATION_PRODUCT_ID]: REL_A }),
        new FakeDSPStatsSource([
          { id: "rel-a", releaseId: REL_A, streams: 5000, listeners: 1200, saves: 300, occurredAt: "2026-10-01T00:00:00Z" },
          { id: "rel-b", releaseId: REL_B, streams: 200, occurredAt: "2026-10-01T00:00:00Z" },
        ]),
      ],
      PERIOD,
    );

    // sales: 2 units + 2 revenue = 4; dsp: 3 (a) + 1 (b) = 4.
    expect(result.countBySource).toEqual({ sales: 4, dsp: 4 });

    const stored = await listAnalyticsEvents();
    expect(stored).toHaveLength(8);
    const ids = stored.map((e) => e.id);
    expect(ids).toContain(`sales:${PERIOD}:ord-1:units`);
    expect(ids).toContain(`sales:${PERIOD}:ord-1:revenue_cents`);
    expect(ids).toContain(`dsp:${PERIOD}:rel-a:streams`);
    // The pending order produced no events.
    expect(ids.some((id) => id.includes("ord-3"))).toBe(false);
  });

  it("re-ingesting the same period is idempotent (no duplicates)", async () => {
    const source = new FakeDSPStatsSource([
      { id: "rel-a", releaseId: REL_A, streams: 100, occurredAt: "2026-10-01T00:00:00Z" },
    ]);
    await ingestAnalytics([source], PERIOD);
    await ingestAnalytics([source], PERIOD);
    expect(await listAnalyticsEvents()).toHaveLength(1);
  });

  it("generateInsightReport writes insight_reports/{period} reconciling with events", async () => {
    await recordOrder({ id: "ord-1", customer: "cus_a", productId: FOUNDATION_PRODUCT_ID, amount: 700, currency: "USD", status: "paid", createdAt: "2026-10-02T00:00:00Z" });
    await ingestAnalytics(
      [
        new PolarSalesSource({ [FOUNDATION_PRODUCT_ID]: REL_A }),
        new FakeDSPStatsSource([
          { id: "rel-a", releaseId: REL_A, streams: 5000, listeners: 1200, saves: 300, occurredAt: "2026-10-01T00:00:00Z" },
          { id: "rel-b", releaseId: REL_B, streams: 200, occurredAt: "2026-10-01T00:00:00Z" },
        ]),
      ],
      PERIOD,
    );

    const report = await generateInsightReport(PERIOD);
    const stored = await getInsightReport(PERIOD);
    expect(stored?.id).toBe(PERIOD);

    // Reconcile against the events: streams 5000+200=5200; revenue 700; units 1.
    expect(report.totalsByMetric.streams).toBe(5200);
    expect(report.totalsByMetric.revenue_cents).toBe(700);
    expect(report.totalsByMetric.units).toBe(1);
    // Totals by source sum to sum of all event values.
    const all = await listAnalyticsEvents();
    const totalValue = all.reduce((s, e) => s + e.value, 0);
    expect(report.totalsBySource.dsp + report.totalsBySource.sales).toBe(totalValue);
    // Top by streams is the overperformer.
    expect(report.topReleasesByStreams[0].releaseId).toBe(REL_A);
    expect(stored?.topReleasesByStreams[0]?.value).toBe(5000);
  });

  it("recommendNextActions writes anr_recommendations (proposals only) and creates NO release/spend side effect", async () => {
    // Baseline: the side-effect collections start empty.
    for (const coll of SIDE_EFFECT_COLLS) {
      expect(await collectionCount(coll)).toBe(0);
    }

    await recordOrder({ id: "ord-1", customer: "cus_a", productId: FOUNDATION_PRODUCT_ID, amount: 700, currency: "USD", status: "paid", createdAt: "2026-10-02T00:00:00Z" });
    await ingestAnalytics(
      [
        new PolarSalesSource({ [FOUNDATION_PRODUCT_ID]: REL_A }),
        new FakeDSPStatsSource([
          // rel-a overperforms, rel-b underperforms (avg = 2600).
          { id: "rel-a", releaseId: REL_A, streams: 5000, occurredAt: "2026-10-01T00:00:00Z" },
          { id: "rel-b", releaseId: REL_B, streams: 200, occurredAt: "2026-10-01T00:00:00Z" },
        ]),
      ],
      PERIOD,
    );

    const recs = await recommendNextActions(PERIOD);
    const stored = await listRecommendations();
    expect(stored.length).toBe(recs.length);
    expect(recs.length).toBeGreaterThan(0);

    // Expected proposals: follow_up_single(rel-a), marketing_push(rel-b),
    // deepen_d2c(rel-a, the only revenue earner).
    const byKind = Object.fromEntries(recs.map((r) => [r.kind, r.releaseId]));
    expect(byKind.follow_up_single).toBe(REL_A);
    expect(byKind.marketing_push).toBe(REL_B);
    expect(byKind.deepen_d2c).toBe(REL_A);

    // Every stored recommendation is a PROPOSAL ONLY.
    for (const rec of stored) {
      expect(rec.proposalOnly).toBe(true);
    }

    // PROOF: NO consequential side effect. The recommendation flow created no
    // distribution, payout, campaign, or marketing event.
    for (const coll of SIDE_EFFECT_COLLS) {
      expect(await collectionCount(coll)).toBe(0);
    }
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
