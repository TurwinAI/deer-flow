/**
 * Revenue ingestion (P2B05, F7) — multi-source income into `revenue_events`.
 *
 * A label's royalty accounting starts by ingesting revenue from every source:
 * D2C sales (Polar), DSP streaming/download income (the distributor), and
 * publishing income from a PRO/MLC. Each source is an injectable
 * {@link RevenueSource} so every gate runs offline:
 *   - {@link PolarRevenueSource} reads the existing Firestore `orders` mirror
 *     (paid orders → RevenueEvent). No network.
 *   - {@link FakeDistributorRevenueSource} / {@link FakePRORevenueSource} are
 *     deterministic test fixtures standing in for DSP + publishing income.
 *   - {@link DistributorRevenueSource} / {@link PRORevenueSource} are the REAL
 *     stubs: they read creds from env and THROW without them, and are never
 *     invoked in tests (exactly the Polar/distributor adapter pattern).
 *
 * `ingestRevenue(sources, period)` pulls every source for the period and writes
 * each event to the admin-only `revenue_events` collection (deterministic ids,
 * idempotent set-with-id). NO live revenue API is reached in any test.
 *
 * Application layer: MAY import harness/* (getDb) + app/* (label store/types).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";
import { listOrders } from "../label/store";
import type { Order } from "../label/index";

const REVENUE_EVENTS = "revenue_events";

/** Where a unit of revenue came from. */
export type RevenueSourceKind = "polar" | "distributor" | "pro";

/**
 * A single unit of gross revenue attributed to (optionally) a release/track.
 * `grossCents` is an integer minor-unit amount; royalty math is integer-cent
 * safe end-to-end (no floats). `id` is stable per source so re-ingesting the
 * same period is idempotent.
 */
export interface RevenueEvent {
  id: string;
  source: RevenueSourceKind;
  /** Release this revenue is attributed to (if known). */
  releaseId?: string;
  /** Track this revenue is attributed to (if known). */
  trackId?: string;
  /** Integer gross amount in minor units (cents). */
  grossCents: number;
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
  /** ISO-8601 time the revenue occurred. */
  occurredAt: string;
}

/**
 * An accounting period (calendar string, e.g. "2026-Q2" or "2026-06"). Treated
 * opaquely — sources decide what a period means for their data. Carried onto
 * every stored event so a statement can be scoped to it.
 */
export type Period = string;

/**
 * A pluggable revenue source. `pull(period)` returns the gross events for that
 * period. Injectable so tests pass fakes and the real impls (which need creds)
 * are never constructed/invoked in a gate.
 */
export interface RevenueSource {
  readonly kind: RevenueSourceKind;
  pull(period: Period): Promise<RevenueEvent[]>;
}

/** Strip undefined keys — Firestore rejects `undefined` field values. */
function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

// ---------------------------------------------------------------------------
// Polar source — reads the existing `orders` mirror (paid orders -> revenue).
// ---------------------------------------------------------------------------

/**
 * Maps a `Product` id to the `releaseId` it sells, so D2C order revenue can be
 * attributed to a release. Optional: when a product is not in the map the event
 * carries no releaseId (counts as unattributed D2C income).
 */
export type ProductReleaseMap = Readonly<Record<string, string>>;

/**
 * Reads the Firestore `orders` mirror (the Polar D2C rail from B06) and emits a
 * RevenueEvent for every PAID order. The order amount is already integer cents.
 * No network — the orders are a local mirror written by the verified webhook.
 */
export class PolarRevenueSource implements RevenueSource {
  public readonly kind = "polar" as const;

  constructor(
    private readonly productReleaseMap: ProductReleaseMap = {},
    private readonly store?: Firestore,
  ) {}

  async pull(period: Period): Promise<RevenueEvent[]> {
    // The Polar mirror is not period-partitioned at the source: every paid order
    // is emitted and period attribution happens at statement time (by
    // occurredAt). `period` is accepted to satisfy the RevenueSource contract.
    void period;
    const orders = await listOrders(this.store);
    return orders
      .filter((o: Order) => o.status === "paid")
      .map((o: Order) => {
        const releaseId = this.productReleaseMap[o.productId];
        return pruneUndefined({
          id: `polar:${o.id}`,
          source: "polar" as const,
          releaseId,
          grossCents: o.amount,
          currency: o.currency,
          occurredAt: o.createdAt,
        }) as RevenueEvent;
      });
  }
}

// ---------------------------------------------------------------------------
// Fake DSP (distributor) + PRO sources — deterministic test fixtures.
// ---------------------------------------------------------------------------

/**
 * Deterministic DSP-income fixture standing in for the distributor's revenue
 * report (streaming/download payouts). Returns the events it was constructed
 * with, scoping their id to the period so re-ingestion is idempotent.
 */
export class FakeDistributorRevenueSource implements RevenueSource {
  public readonly kind = "distributor" as const;

  constructor(private readonly events: ReadonlyArray<Omit<RevenueEvent, "source">>) {}

  async pull(period: Period): Promise<RevenueEvent[]> {
    return this.events.map((e) =>
      pruneUndefined({ ...e, id: scopedId("distributor", period, e.id), source: "distributor" as const }) as RevenueEvent,
    );
  }
}

/**
 * Deterministic publishing-income fixture standing in for a PRO/MLC statement
 * (performance/mechanical royalties). Same shape as the distributor fake.
 */
export class FakePRORevenueSource implements RevenueSource {
  public readonly kind = "pro" as const;

  constructor(private readonly events: ReadonlyArray<Omit<RevenueEvent, "source">>) {}

  async pull(period: Period): Promise<RevenueEvent[]> {
    return this.events.map((e) =>
      pruneUndefined({ ...e, id: scopedId("pro", period, e.id), source: "pro" as const }) as RevenueEvent,
    );
  }
}

/** Build a stable, source+period-scoped event id from a fixture's local id. */
function scopedId(kind: RevenueSourceKind, period: Period, localId: string): string {
  return `${kind}:${period}:${localId}`;
}

// ---------------------------------------------------------------------------
// REAL stubs — read creds from env, THROW without them, NEVER invoked in tests.
// ---------------------------------------------------------------------------

/**
 * Real distributor revenue source. Like `DdexDistributorClient`, it reads its
 * API token + base URL from the environment and FAILS LOUD when the token is
 * absent. It is never constructed/invoked by any gate — those use the fake. A
 * real token/host is operator-supplied at handoff (manifest §9 approval gate).
 */
export class DistributorRevenueSource implements RevenueSource {
  public readonly kind = "distributor" as const;
  private readonly apiToken: string;

  constructor(apiToken: string = process.env.DISTRIBUTOR_API_TOKEN ?? "") {
    this.apiToken = apiToken;
  }

  async pull(period: Period): Promise<RevenueEvent[]> {
    if (!this.apiToken) {
      throw new Error(
        "DistributorRevenueSource requires DISTRIBUTOR_API_TOKEN (operator-supplied at handoff).",
      );
    }
    // No live revenue API is implemented here: pulling real DSP income is an
    // operator-side concern wired at handoff. Reaching this point with a token
    // configured is an explicit, deliberate operator action — never a test.
    throw new Error(`Live distributor revenue pull (period ${period}) is not enabled in this build.`);
  }
}

/**
 * Real PRO/MLC publishing-income source. Same posture as the distributor stub:
 * reads a token from env, throws without it, never invoked in tests.
 */
export class PRORevenueSource implements RevenueSource {
  public readonly kind = "pro" as const;
  private readonly apiToken: string;

  constructor(apiToken: string = process.env.PRO_API_TOKEN ?? "") {
    this.apiToken = apiToken;
  }

  async pull(period: Period): Promise<RevenueEvent[]> {
    if (!this.apiToken) {
      throw new Error(
        "PRORevenueSource requires PRO_API_TOKEN (operator-supplied at handoff).",
      );
    }
    throw new Error(`Live PRO revenue pull (period ${period}) is not enabled in this build.`);
  }
}

// ---------------------------------------------------------------------------
// Ingestion + store
// ---------------------------------------------------------------------------

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

/** Persist a single revenue event to the admin-only collection (idempotent). */
export async function recordRevenueEvent(
  event: RevenueEvent,
  store?: Firestore,
): Promise<RevenueEvent> {
  await db(store).collection(REVENUE_EVENTS).doc(event.id).set(pruneUndefined({ ...event }));
  return event;
}

/** Read a single revenue event by id (admin SDK). Returns null if absent. */
export async function getRevenueEvent(
  id: string,
  store?: Firestore,
): Promise<RevenueEvent | null> {
  const snap = await db(store).collection(REVENUE_EVENTS).doc(id).get();
  return snap.exists ? (snap.data() as RevenueEvent) : null;
}

/** List all stored revenue events (admin SDK). */
export async function listRevenueEvents(store?: Firestore): Promise<RevenueEvent[]> {
  const snap = await db(store).collection(REVENUE_EVENTS).get();
  return snap.docs.map((d) => d.data() as RevenueEvent);
}

/** List stored revenue events attributed to a given release (admin SDK). */
export async function listRevenueEventsByRelease(
  releaseId: string,
  store?: Firestore,
): Promise<RevenueEvent[]> {
  const snap = await db(store)
    .collection(REVENUE_EVENTS)
    .where("releaseId", "==", releaseId)
    .get();
  return snap.docs.map((d) => d.data() as RevenueEvent);
}

/** Result of an ingestion run: the events written, grouped count by source. */
export interface RevenueIngestResult {
  events: RevenueEvent[];
  countBySource: Record<RevenueSourceKind, number>;
}

/**
 * Pull every supplied source for the period and persist each event to the
 * admin-only `revenue_events` collection. Idempotent on event id, so a re-run
 * over the same period overwrites identical rows rather than duplicating them.
 */
export async function ingestRevenue(
  sources: ReadonlyArray<RevenueSource>,
  period: Period,
  store?: Firestore,
): Promise<RevenueIngestResult> {
  const events: RevenueEvent[] = [];
  const countBySource: Record<RevenueSourceKind, number> = {
    polar: 0,
    distributor: 0,
    pro: 0,
  };
  for (const source of sources) {
    const pulled = await source.pull(period);
    for (const event of pulled) {
      await recordRevenueEvent(event, store);
      events.push(event);
      countBySource[event.source] += 1;
    }
  }
  return { events, countBySource };
}
