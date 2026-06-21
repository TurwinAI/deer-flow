/**
 * Analytics admin-callable auth-guard tests (P2B08, F11 + F1) — OFFLINE unit
 * gate. No emulator, no network, no live analytics.
 *
 * The analytics flow (ingestAnalytics / generateInsightReport /
 * recommendNextActions / listRecommendations) is MOCKED so the handlers never
 * touch Firestore. Assertions focus on:
 *   - assertAdmin runs FIRST: a non-admin / unauthenticated caller is rejected
 *     and NO action happens,
 *   - with admin the handler delegates to the (NON-consequential) flow,
 *   - malformed input is rejected as invalid-argument.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ingestAnalytics = vi.fn(async () => ({
  events: [],
  countBySource: { dsp: 0, sales: 0 },
}));
const generateInsightReport = vi.fn(async (period: string) => ({
  id: period,
  period,
  eventCount: 0,
  totalsBySource: { dsp: 0, sales: 0 },
  totalsByMetric: { streams: 0, listeners: 0, saves: 0, units: 0, revenue_cents: 0 },
  topReleasesByStreams: [],
  topReleasesByRevenue: [],
  growth: [],
  generatedAt: "2026-06-30T00:00:00.000Z",
}));
const recommendNextActions = vi.fn(async () => []);
const listRecommendations = vi.fn(async () => []);

vi.mock("../app/analytics/ingest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/analytics/ingest")>();
  return { ...actual, ingestAnalytics: () => ingestAnalytics() };
});
vi.mock("../app/analytics/insights", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/analytics/insights")>();
  return { ...actual, generateInsightReport: (period: string) => generateInsightReport(period) };
});
vi.mock("../app/analytics/anr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/analytics/anr")>();
  return {
    ...actual,
    recommendNextActions: () => recommendNextActions(),
    listRecommendations: () => listRecommendations(),
  };
});

import {
  handleIngestAnalytics,
  handleGenerateInsights,
  handleRecommendNextActions,
  handleListRecommendations,
  type AdminAuthContext,
} from "../app/gateway/adminApi";

const ADMIN: AdminAuthContext = { uid: "owner", token: { admin: true } };
const NON_ADMIN: AdminAuthContext = { uid: "fan", token: { admin: false } };

describe("analytics admin callables (P2B08)", () => {
  afterEach(() => vi.clearAllMocks());

  it("handleIngestAnalytics rejects non-admin and never ingests", async () => {
    await expect(
      handleIngestAnalytics({ auth: NON_ADMIN, data: { period: "2026-06" } }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(ingestAnalytics).not.toHaveBeenCalled();
  });

  it("handleIngestAnalytics rejects unauthenticated", async () => {
    await expect(
      handleIngestAnalytics({ auth: undefined, data: { period: "2026-06" } }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(ingestAnalytics).not.toHaveBeenCalled();
  });

  it("handleIngestAnalytics allows admin + ingests", async () => {
    const result = await handleIngestAnalytics({ auth: ADMIN, data: { period: "2026-06" } });
    expect(result.countBySource).toEqual({ dsp: 0, sales: 0 });
    expect(ingestAnalytics).toHaveBeenCalledOnce();
  });

  it("handleIngestAnalytics rejects malformed input (missing period)", async () => {
    await expect(
      handleIngestAnalytics({ auth: ADMIN, data: {} }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(ingestAnalytics).not.toHaveBeenCalled();
  });

  it("handleGenerateInsights rejects non-admin; allows admin", async () => {
    await expect(
      handleGenerateInsights({ auth: NON_ADMIN, data: { period: "2026-06" } }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(generateInsightReport).not.toHaveBeenCalled();
    const report = await handleGenerateInsights({ auth: ADMIN, data: { period: "2026-06" } });
    expect(report.id).toBe("2026-06");
    expect(generateInsightReport).toHaveBeenCalledOnce();
  });

  it("handleRecommendNextActions rejects non-admin; allows admin (proposals only)", async () => {
    await expect(
      handleRecommendNextActions({ auth: NON_ADMIN, data: { period: "2026-06" } }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(recommendNextActions).not.toHaveBeenCalled();
    await handleRecommendNextActions({ auth: ADMIN, data: { period: "2026-06" } });
    expect(recommendNextActions).toHaveBeenCalledOnce();
  });

  it("handleListRecommendations rejects non-admin; allows admin", async () => {
    await expect(
      handleListRecommendations({ auth: NON_ADMIN, data: {} }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await handleListRecommendations({ auth: ADMIN, data: {} });
    expect(listRecommendations).toHaveBeenCalledOnce();
  });
});
