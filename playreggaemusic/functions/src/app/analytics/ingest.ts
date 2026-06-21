/**
 * Analytics ingestion (P2B08, F11) — multi-source streaming/sales data into the
 * admin-only `analytics_events` collection.
 *
 * A label's analytics function ingests audience/sales data from every source —
 * DSP streaming stats (Spotify/Apple/etc.) and D2C sales — to feed insights +
 * A&R decisioning. Each source is an injectable {@link AnalyticsSource} so every
 * gate runs offline (the Polar/RevenueSource adapter pattern from B05/B06):
 *   - {@link FakeDSPStatsSource} is a DETERMINISTIC fixture standing in for a
 *     DSP-stats report (streams/listeners/saves per release+track). No network.
 *   - {@link PolarSalesSource} derives sales metrics (units + revenue_cents)
 *     from the existing Firestore `orders` mirror. No network.
 *   - {@link DspStatsSource} is the REAL stub: it reads creds from env and THROWS
 *     without them, and is never constructed/invoked in tests.
 *
 * `ingestAnalytics(sources, period)` pulls every source for the period and writes
 * each event to `analytics_events` (deterministic ids, idempotent set-with-id).
 * Analytics is BUSINESS INTELLIGENCE — admin-only, never public. NO live
 * analytics API is reached in any test.
 *
 * This module is READ-ONLY with respect to outward action: pulling stats and
 * storing them performs no consequential action (no release, spend, or payout).
 *
 * Application layer: MAY import harness/* (getDb) + app/* (label store/types).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";
import { listOrders } from "../label/store";
import type { Order } from "../label/index";

const ANALYTICS_EVENTS = "analytics_events";

/** Where an analytics datapoint came from. */
export type AnalyticsSourceKind = "dsp" | "sales";

/**
 * The measured quantities. DSP sources emit streams/listeners/saves; sales
 * sources emit units (paid orders) + revenue_cents (gross sale amount).
 */
export type AnalyticsMetric =
  | "streams"
  | "listeners"
  | "saves"
  | "units"
  | "revenue_cents";

/**
 * A single analytics datapoint attributed to (optionally) a release/track.
 * `value` is a non-negative integer (counts, or integer cents for revenue).
 * `id` is stable per source+period so re-ingesting a period is idempotent.
 */
export interface AnalyticsEvent {
  id: string;
  source: AnalyticsSourceKind;
  /** Release this datapoint is attributed to (if known). */
  releaseId?: string;
  /** Track this datapoint is attributed to (if known). */
  trackId?: string;
  metric: AnalyticsMetric;
  /** Integer measured value (count, or integer cents for revenue_cents). */
  value: number;
  /** ISO-8601 time the datapoint occurred / the period it covers. */
  occurredAt: string;
}

/**
 * An analytics reporting period (calendar string, e.g. "2026-Q2" or "2026-06").
 * Treated opaquely — sources decide what a period means for their data, and it
 * is carried onto every stored event so a report can be scoped to it.
 */
export type Period = string;

/**
 * A pluggable analytics source. `pull(period)` returns the events for that
 * period. Injectable so tests pass fakes and the real impl (which needs creds)
 * is never constructed/invoked in a gate.
 */
export interface AnalyticsSource {
  readonly kind: AnalyticsSourceKind;
  pull(period: Period): Promise<AnalyticsEvent[]>;
}

/** Strip undefined keys — Firestore rejects `undefined` field values. */
function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/** Build a stable, source+period-scoped event id from a fixture's local id. */
function scopedId(kind: AnalyticsSourceKind, period: Period, localId: string): string {
  return `${kind}:${period}:${localId}`;
}

// ---------------------------------------------------------------------------
// Fake DSP-stats source — DETERMINISTIC fixture (streams/listeners/saves).
// ---------------------------------------------------------------------------

/**
 * A per-release/track DSP stat the fixture emits. `streams`/`listeners`/`saves`
 * are non-negative integers; each expands into one AnalyticsEvent per metric
 * (omitting any metric left undefined).
 */
export interface DspStatFixture {
  /** Stable local id (combined with kind+period for the stored event id). */
  id: string;
  releaseId?: string;
  trackId?: string;
  streams?: number;
  listeners?: number;
  saves?: number;
  /** ISO-8601 time the stats cover. */
  occurredAt: string;
}

/**
 * Deterministic DSP-stats fixture standing in for a streaming-platform report.
 * Expands each {@link DspStatFixture} into one AnalyticsEvent per present metric
 * (streams/listeners/saves), scoping ids to the period so re-ingestion is
 * idempotent. Pure + offline — no network.
 */
export class FakeDSPStatsSource implements AnalyticsSource {
  public readonly kind = "dsp" as const;

  constructor(private readonly stats: ReadonlyArray<DspStatFixture>) {}

  async pull(period: Period): Promise<AnalyticsEvent[]> {
    const events: AnalyticsEvent[] = [];
    for (const stat of this.stats) {
      const metrics: ReadonlyArray<[AnalyticsMetric, number | undefined]> = [
        ["streams", stat.streams],
        ["listeners", stat.listeners],
        ["saves", stat.saves],
      ];
      for (const [metric, value] of metrics) {
        if (value === undefined) {
          continue;
        }
        events.push(
          pruneUndefined({
            id: scopedId("dsp", period, `${stat.id}:${metric}`),
            source: "dsp" as const,
            releaseId: stat.releaseId,
            trackId: stat.trackId,
            metric,
            value,
            occurredAt: stat.occurredAt,
          }) as AnalyticsEvent,
        );
      }
    }
    return events;
  }
}

// ---------------------------------------------------------------------------
// Polar sales source — derives sales metrics from the `orders` mirror.
// ---------------------------------------------------------------------------

/**
 * Maps a `Product` id to the `releaseId` it sells, so D2C sales metrics can be
 * attributed to a release. Optional: when a product is not in the map the
 * derived events carry no releaseId (unattributed D2C sales).
 */
export type ProductReleaseMap = Readonly<Record<string, string>>;

/**
 * Reads the Firestore `orders` mirror (the Polar D2C rail from B06) and derives
 * sales analytics for every PAID order: one `units` event (value 1) and one
 * `revenue_cents` event (the order's integer-cent amount). No network — the
 * orders are a local mirror written by the verified webhook.
 */
export class PolarSalesSource implements AnalyticsSource {
  public readonly kind = "sales" as const;

  constructor(
    private readonly productReleaseMap: ProductReleaseMap = {},
    private readonly store?: Firestore,
  ) {}

  async pull(period: Period): Promise<AnalyticsEvent[]> {
    // The Polar mirror is not period-partitioned at the source: every paid order
    // is emitted and period scoping happens via the stored event id + occurredAt.
    const orders = await listOrders(this.store);
    const events: AnalyticsEvent[] = [];
    for (const order of orders.filter((o: Order) => o.status === "paid")) {
      const releaseId = this.productReleaseMap[order.productId];
      events.push(
        pruneUndefined({
          id: scopedId("sales", period, `${order.id}:units`),
          source: "sales" as const,
          releaseId,
          metric: "units" as const,
          value: 1,
          occurredAt: order.createdAt,
        }) as AnalyticsEvent,
      );
      events.push(
        pruneUndefined({
          id: scopedId("sales", period, `${order.id}:revenue_cents`),
          source: "sales" as const,
          releaseId,
          metric: "revenue_cents" as const,
          value: order.amount,
          occurredAt: order.createdAt,
        }) as AnalyticsEvent,
      );
    }
    return events;
  }
}

// ---------------------------------------------------------------------------
// REAL stub — reads creds from env, THROWS without them, NEVER invoked in tests.
// ---------------------------------------------------------------------------

/**
 * Real DSP-stats source. Like the distributor/PRO stubs, it reads its API token
 * from the environment and FAILS LOUD when the token is absent. It is never
 * constructed/invoked by any gate — those use the fake. A real token is
 * operator-supplied at handoff (manifest §9 approval gate). Even with a token,
 * no live stats API is implemented here — reaching that point is a deliberate
 * operator action, never a test.
 */
export class DspStatsSource implements AnalyticsSource {
  public readonly kind = "dsp" as const;
  private readonly apiToken: string;

  constructor(apiToken: string = process.env.DSP_STATS_API_TOKEN ?? "") {
    this.apiToken = apiToken;
  }

  async pull(period: Period): Promise<AnalyticsEvent[]> {
    if (!this.apiToken) {
      throw new Error(
        "DspStatsSource requires DSP_STATS_API_TOKEN (operator-supplied at handoff).",
      );
    }
    throw new Error(`Live DSP stats pull (period ${period}) is not enabled in this build.`);
  }
}

// ---------------------------------------------------------------------------
// Ingestion + store (admin SDK)
// ---------------------------------------------------------------------------

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

/** Persist a single analytics event to the admin-only collection (idempotent). */
export async function recordAnalyticsEvent(
  event: AnalyticsEvent,
  store?: Firestore,
): Promise<AnalyticsEvent> {
  await db(store).collection(ANALYTICS_EVENTS).doc(event.id).set(pruneUndefined({ ...event }));
  return event;
}

/** List all stored analytics events (admin SDK). */
export async function listAnalyticsEvents(store?: Firestore): Promise<AnalyticsEvent[]> {
  const snap = await db(store).collection(ANALYTICS_EVENTS).get();
  return snap.docs.map((d) => d.data() as AnalyticsEvent);
}

/** Result of an ingestion run: the events written + a per-source count. */
export interface AnalyticsIngestResult {
  events: AnalyticsEvent[];
  countBySource: Record<AnalyticsSourceKind, number>;
}

/**
 * Pull every supplied source for the period and persist each event to the
 * admin-only `analytics_events` collection. Idempotent on event id, so a re-run
 * over the same period overwrites identical rows rather than duplicating them.
 * READ/PROPOSE only — performs no consequential outward action.
 */
export async function ingestAnalytics(
  sources: ReadonlyArray<AnalyticsSource>,
  period: Period,
  store?: Firestore,
): Promise<AnalyticsIngestResult> {
  const events: AnalyticsEvent[] = [];
  const countBySource: Record<AnalyticsSourceKind, number> = { dsp: 0, sales: 0 };
  for (const source of sources) {
    const pulled = await source.pull(period);
    for (const event of pulled) {
      await recordAnalyticsEvent(event, store);
      events.push(event);
      countBySource[event.source] += 1;
    }
  }
  return { events, countBySource };
}
