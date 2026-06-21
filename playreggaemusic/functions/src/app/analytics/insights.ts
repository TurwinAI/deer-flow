/**
 * Insights / reporting (P2B08, F11) — DETERMINISTIC aggregation over stored
 * AnalyticsEvents into a structured `insight_reports/{period}` summary.
 *
 * NO LLM, NO network, NO clock-dependence in the aggregation: given the same set
 * of events the same report is produced, so the unit gate can assert exact
 * totals/orderings. The report is BUSINESS INTELLIGENCE — admin-only.
 *
 * The aggregation computes, for a period:
 *   - totals by source ({dsp, sales}) and by metric (streams/listeners/saves/
 *     units/revenue_cents),
 *   - top releases by streams and by revenue_cents (descending, ties broken by
 *     releaseId for determinism),
 *   - simple growth vs. an optional prior period's report (period-over-period
 *     delta + integer-permille rate, so no floating-point drift).
 *
 * Application layer: MAY import harness/* (getDb) + app/* (analytics ingest).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";
import {
  listAnalyticsEvents,
  type AnalyticsEvent,
  type AnalyticsMetric,
  type AnalyticsSourceKind,
  type Period,
} from "./ingest";

const INSIGHT_REPORTS = "insight_reports";

/** Totals keyed by analytics source kind. */
export type TotalsBySource = Record<AnalyticsSourceKind, number>;

/** Totals keyed by metric. */
export type TotalsByMetric = Record<AnalyticsMetric, number>;

/** A release ranked by a metric (e.g. top by streams / by revenue). */
export interface RankedRelease {
  releaseId: string;
  value: number;
}

/**
 * Period-over-period growth for one metric: the absolute delta and an integer
 * permille (per-1000) rate vs the prior period. Permille keeps the rate integer
 * (deterministic, no float drift): `rate = round(1000 * (curr - prev) / prev)`.
 * When the prior value is 0 the rate is null (undefined growth).
 */
export interface Growth {
  metric: AnalyticsMetric;
  current: number;
  previous: number;
  deltaAbsolute: number;
  /** Integer permille growth rate, or null when the prior value is 0. */
  ratePermille: number | null;
}

/**
 * A structured insight report for one period. Deterministic on its inputs.
 * Stored in the admin-only `insight_reports/{period}` collection.
 */
export interface InsightReport {
  /** Doc id is the period; `id === period`. */
  id: string;
  period: Period;
  /** Total events the report aggregated. */
  eventCount: number;
  totalsBySource: TotalsBySource;
  totalsByMetric: TotalsByMetric;
  /** Releases ranked by total streams (descending; ties by releaseId asc). */
  topReleasesByStreams: RankedRelease[];
  /** Releases ranked by total revenue_cents (descending; ties by releaseId asc). */
  topReleasesByRevenue: RankedRelease[];
  /** Growth vs the prior report's totals (empty when no prior report given). */
  growth: Growth[];
  /** ISO-8601 time the report was generated (metadata; not part of aggregation). */
  generatedAt: string;
}

const ZERO_BY_SOURCE: TotalsBySource = { dsp: 0, sales: 0 };
const ZERO_BY_METRIC: TotalsByMetric = {
  streams: 0,
  listeners: 0,
  saves: 0,
  units: 0,
  revenue_cents: 0,
};

/** Sum events into per-source totals. */
function sumBySource(events: ReadonlyArray<AnalyticsEvent>): TotalsBySource {
  const totals: TotalsBySource = { ...ZERO_BY_SOURCE };
  for (const e of events) {
    totals[e.source] += e.value;
  }
  return totals;
}

/** Sum events into per-metric totals. */
function sumByMetric(events: ReadonlyArray<AnalyticsEvent>): TotalsByMetric {
  const totals: TotalsByMetric = { ...ZERO_BY_METRIC };
  for (const e of events) {
    totals[e.metric] += e.value;
  }
  return totals;
}

/**
 * Rank releases by the total of one metric, descending. Events without a
 * releaseId are ignored (unattributed). Ties broken by releaseId ascending so
 * the ordering is fully deterministic. Zero-total releases are omitted.
 */
function rankReleasesByMetric(
  events: ReadonlyArray<AnalyticsEvent>,
  metric: AnalyticsMetric,
): RankedRelease[] {
  const byRelease = new Map<string, number>();
  for (const e of events) {
    if (e.metric !== metric || e.releaseId === undefined) {
      continue;
    }
    byRelease.set(e.releaseId, (byRelease.get(e.releaseId) ?? 0) + e.value);
  }
  return [...byRelease.entries()]
    .filter(([, value]) => value > 0)
    .map(([releaseId, value]) => ({ releaseId, value }))
    .sort((a, b) => (b.value - a.value) || a.releaseId.localeCompare(b.releaseId));
}

/** Compute integer-permille growth of `current` over `previous`. */
function growthOf(
  metric: AnalyticsMetric,
  current: number,
  previous: number,
): Growth {
  const deltaAbsolute = current - previous;
  const ratePermille =
    previous === 0 ? null : Math.round((1000 * deltaAbsolute) / previous);
  return { metric, current, previous, deltaAbsolute, ratePermille };
}

const GROWTH_METRICS: ReadonlyArray<AnalyticsMetric> = [
  "streams",
  "listeners",
  "saves",
  "units",
  "revenue_cents",
];

/**
 * Build an {@link InsightReport} from a set of events — PURE + DETERMINISTIC
 * (the `generatedAt` metadata aside). `prior`, when supplied, is the previous
 * period's report used to compute period-over-period growth per metric.
 */
export function buildInsightReport(
  period: Period,
  events: ReadonlyArray<AnalyticsEvent>,
  options: { prior?: InsightReport | null; generatedAt?: string } = {},
): InsightReport {
  const totalsByMetric = sumByMetric(events);
  const priorByMetric = options.prior?.totalsByMetric ?? null;
  const growth: Growth[] = priorByMetric
    ? GROWTH_METRICS.map((m) => growthOf(m, totalsByMetric[m], priorByMetric[m]))
    : [];
  return {
    id: period,
    period,
    eventCount: events.length,
    totalsBySource: sumBySource(events),
    totalsByMetric,
    topReleasesByStreams: rankReleasesByMetric(events, "streams"),
    topReleasesByRevenue: rankReleasesByMetric(events, "revenue_cents"),
    growth,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  };
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

/**
 * Filter stored analytics events to a period. Events carry their period inside
 * the stored id as `${source}:${period}:...`; sales events use `sales:${period}`
 * and DSP events `dsp:${period}`. We match on that id prefix so only the
 * period's events are aggregated, independent of `occurredAt`.
 */
function eventsForPeriod(
  events: ReadonlyArray<AnalyticsEvent>,
  period: Period,
): AnalyticsEvent[] {
  return events.filter(
    (e) => e.id.startsWith(`dsp:${period}:`) || e.id.startsWith(`sales:${period}:`),
  );
}

/** Read a stored insight report (admin SDK). Returns null if absent. */
export async function getInsightReport(
  period: Period,
  store?: Firestore,
): Promise<InsightReport | null> {
  const snap = await db(store).collection(INSIGHT_REPORTS).doc(period).get();
  return snap.exists ? (snap.data() as InsightReport) : null;
}

/**
 * Aggregate the stored analytics events for a period into an InsightReport and
 * persist it to the admin-only `insight_reports/{period}` collection (set-with-
 * id, idempotent). When `priorPeriod` is supplied and a report exists for it,
 * growth is computed vs that report. READ-ONLY: reads events + writes a report;
 * performs NO consequential outward action.
 */
export async function generateInsightReport(
  period: Period,
  options: { priorPeriod?: Period; store?: Firestore } = {},
): Promise<InsightReport> {
  const store = options.store;
  const all = await listAnalyticsEvents(store);
  const events = eventsForPeriod(all, period);
  const prior = options.priorPeriod
    ? await getInsightReport(options.priorPeriod, store)
    : null;
  const report = buildInsightReport(period, events, { prior });
  await db(store).collection(INSIGHT_REPORTS).doc(period).set({
    id: report.id,
    period: report.period,
    eventCount: report.eventCount,
    totalsBySource: { ...report.totalsBySource },
    totalsByMetric: { ...report.totalsByMetric },
    topReleasesByStreams: report.topReleasesByStreams.map((r) => ({ ...r })),
    topReleasesByRevenue: report.topReleasesByRevenue.map((r) => ({ ...r })),
    growth: report.growth.map((g) => ({ ...g })),
    generatedAt: report.generatedAt,
  });
  return report;
}
