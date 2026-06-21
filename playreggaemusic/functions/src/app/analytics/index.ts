/**
 * Analytics domain barrel (P2B08, F11 + F1) — analytics ingestion +
 * deterministic insights/reporting + A&R recommendations (proposals only) +
 * agent tools.
 *
 * Everything here is READ/PROPOSE only: ingesting stats, aggregating reports,
 * and recording recommendations perform NO consequential outward action. The
 * actual releasing/spending remains behind the existing approval gates
 * (P2B03 distribution / P2B07 marketing).
 *
 * Application layer: MAY import harness/* and app/*. The harness never imports
 * this layer (boundary test).
 */
// `ingest` declares `Period` + `ProductReleaseMap`, which the finance barrel
// also declares (identical shapes). To keep the top-level `app` barrel free of
// name-collision ambiguity, re-export ingest WITHOUT those two shared aliases
// here (consumers needing them import directly from finance or analytics/ingest).
export {
  ingestAnalytics,
  recordAnalyticsEvent,
  listAnalyticsEvents,
  FakeDSPStatsSource,
  PolarSalesSource,
  DspStatsSource,
} from "./ingest";
export type {
  AnalyticsSource,
  AnalyticsSourceKind,
  AnalyticsMetric,
  AnalyticsEvent,
  AnalyticsIngestResult,
  DspStatFixture,
} from "./ingest";
export * from "./insights";
export * from "./anr";
export * from "./tools";
