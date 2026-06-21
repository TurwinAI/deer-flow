/**
 * Insights aggregation + A&R recommendation logic (P2B08, F11 + F1) — OFFLINE
 * unit gate. No emulator, no network, no LLM.
 *
 * Asserts:
 *   - buildInsightReport aggregates DETERMINISTICALLY on fixtures: totals by
 *     source + metric are exact; the top release by streams / by revenue is
 *     correct (with deterministic tie-breaking); growth vs a prior report is
 *     computed correctly (integer permille),
 *   - recommendFromReport is DETERMINISTIC: a clearly-overperforming release
 *     yields a follow_up_single; a clearly-underperforming one a marketing_push;
 *     the top-revenue release a deepen_d2c — and every recommendation is a
 *     PROPOSAL ONLY (proposalOnly === true, never an action).
 */
import { describe, expect, it } from "vitest";
import { buildInsightReport, type InsightReport } from "../app/analytics/insights";
import type { AnalyticsEvent } from "../app/analytics/ingest";
import { recommendFromReport } from "../app/analytics/anr";

const GEN = "2026-06-30T00:00:00.000Z";

/** Build a DSP streams event. */
function streams(id: string, releaseId: string, value: number): AnalyticsEvent {
  return { id: `dsp:2026-06:${id}`, source: "dsp", releaseId, metric: "streams", value, occurredAt: "2026-06-01T00:00:00Z" };
}
/** Build a sales revenue event. */
function revenue(id: string, releaseId: string, value: number): AnalyticsEvent {
  return { id: `sales:2026-06:${id}`, source: "sales", releaseId, metric: "revenue_cents", value, occurredAt: "2026-06-01T00:00:00Z" };
}
/** Build a sales units event. */
function units(id: string, releaseId: string, value: number): AnalyticsEvent {
  return { id: `sales:2026-06:${id}`, source: "sales", releaseId, metric: "units", value, occurredAt: "2026-06-01T00:00:00Z" };
}

describe("buildInsightReport (P2B08 deterministic aggregation)", () => {
  const events: AnalyticsEvent[] = [
    streams("s1", "rel-a", 1000),
    streams("s2", "rel-b", 200),
    streams("s3", "rel-c", 300),
    revenue("r1", "rel-a", 5000),
    revenue("r2", "rel-b", 9000),
    units("u1", "rel-a", 1),
    units("u2", "rel-b", 1),
  ];

  it("totals by source are exact", () => {
    const report = buildInsightReport("2026-06", events, { generatedAt: GEN });
    // dsp: 1000+200+300=1500; sales: 5000+9000 revenue + 1+1 units = 14002.
    expect(report.totalsBySource.dsp).toBe(1500);
    expect(report.totalsBySource.sales).toBe(14002);
  });

  it("totals by metric are exact", () => {
    const report = buildInsightReport("2026-06", events, { generatedAt: GEN });
    expect(report.totalsByMetric.streams).toBe(1500);
    expect(report.totalsByMetric.revenue_cents).toBe(14000);
    expect(report.totalsByMetric.units).toBe(2);
    expect(report.totalsByMetric.listeners).toBe(0);
    expect(report.totalsByMetric.saves).toBe(0);
  });

  it("top release by streams is correct and ordered descending", () => {
    const report = buildInsightReport("2026-06", events, { generatedAt: GEN });
    expect(report.topReleasesByStreams.map((r) => r.releaseId)).toEqual(["rel-a", "rel-c", "rel-b"]);
    expect(report.topReleasesByStreams[0]).toEqual({ releaseId: "rel-a", value: 1000 });
  });

  it("top release by revenue is correct (rel-b leads on revenue, not streams)", () => {
    const report = buildInsightReport("2026-06", events, { generatedAt: GEN });
    expect(report.topReleasesByRevenue[0]).toEqual({ releaseId: "rel-b", value: 9000 });
  });

  it("breaks ties deterministically by releaseId ascending", () => {
    const tied: AnalyticsEvent[] = [
      streams("t1", "rel-z", 500),
      streams("t2", "rel-a", 500),
    ];
    const report = buildInsightReport("2026-06", tied, { generatedAt: GEN });
    expect(report.topReleasesByStreams.map((r) => r.releaseId)).toEqual(["rel-a", "rel-z"]);
  });

  it("is deterministic: same events -> identical report (aggregation fields)", () => {
    const a = buildInsightReport("2026-06", events, { generatedAt: GEN });
    const b = buildInsightReport("2026-06", events, { generatedAt: GEN });
    expect(a).toEqual(b);
  });

  it("computes growth vs a prior report (integer permille)", () => {
    const prior: InsightReport = buildInsightReport(
      "2026-05",
      [streams("p1", "rel-a", 500)],
      { generatedAt: GEN },
    );
    // current streams total 1500 vs prior 500 -> delta 1000, +2000 permille (200%).
    const report = buildInsightReport("2026-06", events, { prior, generatedAt: GEN });
    const streamsGrowth = report.growth.find((g) => g.metric === "streams");
    expect(streamsGrowth).toMatchObject({ current: 1500, previous: 500, deltaAbsolute: 1000, ratePermille: 2000 });
  });

  it("growth rate is null when the prior value is 0 (undefined growth)", () => {
    const prior = buildInsightReport("2026-05", [], { generatedAt: GEN });
    const report = buildInsightReport("2026-06", events, { prior, generatedAt: GEN });
    const streamsGrowth = report.growth.find((g) => g.metric === "streams");
    expect(streamsGrowth?.ratePermille).toBeNull();
  });

  it("emits no growth when there is no prior report", () => {
    const report = buildInsightReport("2026-06", events, { generatedAt: GEN });
    expect(report.growth).toEqual([]);
  });
});

describe("recommendFromReport (P2B08 deterministic A&R proposals)", () => {
  // rel-a (1000) overperforms; rel-b (100) underperforms; avg = (1000+400+100)/3 = 500.
  // over: 2*1000 >= 3*500 (2000>=1500) yes. under: 2*100 <= 500 (200<=500) yes.
  // rel-c (400): over 800>=1500 no; under 800<=500 no -> no rec.
  const report = buildInsightReport(
    "2026-06",
    [
      streams("s1", "rel-a", 1000),
      streams("s2", "rel-c", 400),
      streams("s3", "rel-b", 100),
      revenue("r1", "rel-a", 5000),
      revenue("r2", "rel-b", 1000),
    ],
    { generatedAt: GEN },
  );

  it("a clearly-overperforming release yields a follow_up_single", () => {
    const recs = recommendFromReport(report);
    const followUp = recs.find((r) => r.kind === "follow_up_single");
    expect(followUp?.releaseId).toBe("rel-a");
    expect(followUp?.rationale).toContain("overperforming");
  });

  it("a clearly-underperforming release yields a marketing_push referencing plan_campaign", () => {
    const recs = recommendFromReport(report);
    const push = recs.find((r) => r.kind === "marketing_push");
    expect(push?.releaseId).toBe("rel-b");
    expect(push?.suggestedTool).toBe("plan_campaign");
    expect(push?.rationale).toContain("approval");
  });

  it("the top-revenue release yields a deepen_d2c proposal", () => {
    const recs = recommendFromReport(report);
    const deepen = recs.find((r) => r.kind === "deepen_d2c");
    expect(deepen?.releaseId).toBe("rel-a");
  });

  it("EVERY recommendation is a PROPOSAL ONLY (never an action)", () => {
    const recs = recommendFromReport(report);
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(rec.proposalOnly).toBe(true);
      // suggestedTool is either nothing or the NON-consequential planner.
      expect(["none", "plan_campaign"]).toContain(rec.suggestedTool);
    }
  });

  it("is deterministic: same report -> identical recommendations + stable order", () => {
    const a = recommendFromReport(report);
    const b = recommendFromReport(report);
    expect(a).toEqual(b);
    // Stable order: sorted by kind then releaseId.
    expect(a.map((r) => r.kind)).toEqual(["deepen_d2c", "follow_up_single", "marketing_push"]);
  });

  it("emits no recommendations when there is insufficient signal (< 2 releases)", () => {
    const thin = buildInsightReport("2026-06", [streams("only", "rel-a", 10)], { generatedAt: GEN });
    // With one release there is a top-revenue release? No revenue event here, so none.
    expect(recommendFromReport(thin)).toEqual([]);
  });
});
