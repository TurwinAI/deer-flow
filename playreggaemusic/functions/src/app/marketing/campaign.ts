/**
 * Campaign planner + store (P2B07, F5).
 *
 * A release campaign is a deterministic, ordered sequence of marketing STEPS
 * expanded from a fixed RELEASE-CAMPAIGN TEMPLATE: announce → preview drop →
 * playlist pitch → email blast → ad spend. `planReleaseCampaign` is pure +
 * deterministic (same release + opts → same steps) so the unit gate can assert
 * the exact expansion; it does NOT execute any step (no outward effect).
 *
 * Campaigns are OPERATIONAL: stored admin-only in `campaigns/{id}` (firestore.
 * rules denies ALL client access; the admin SDK bypasses rules). The agent /
 * admin plans + schedules; the consequential outward steps (publish/email/spend)
 * run only through the ApprovalGate / approved admin callables.
 *
 * Application layer: MAY import harness/* (getDb).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";

const CAMPAIGNS = "campaigns";

/** The kinds of step a campaign can contain, in canonical template order. */
export type CampaignStepKind =
  | "announce"
  | "preview_drop"
  | "playlist_pitch"
  | "email_blast"
  | "ad_spend";

/** Lifecycle of a single campaign step. */
export type CampaignStepStatus = "planned" | "scheduled" | "done";

/** Lifecycle of a campaign as a whole. */
export type CampaignStatus = "planned" | "scheduled" | "active" | "done";

/** One ordered step in a campaign. */
export interface CampaignStep {
  /** Stable id — `${campaignId}__${kind}` (one step per kind in the template). */
  id: string;
  kind: CampaignStepKind;
  /** ISO-8601 time the step is scheduled to fire (set by scheduling). */
  scheduledAt?: string;
  status: CampaignStepStatus;
}

/** A release marketing campaign. */
export interface Campaign {
  id: string;
  releaseId: string;
  status: CampaignStatus;
  /** Total advertising budget for the campaign, in cents. */
  budgetCents: number;
  steps: CampaignStep[];
}

/** The canonical RELEASE-CAMPAIGN TEMPLATE: ordered step kinds. */
export const RELEASE_CAMPAIGN_TEMPLATE: readonly CampaignStepKind[] = [
  "announce",
  "preview_drop",
  "playlist_pitch",
  "email_blast",
  "ad_spend",
];

/** Options for {@link planReleaseCampaign}. */
export interface PlanCampaignOptions {
  /**
   * Deterministic campaign id. Defaults to `campaign-${releaseId}` so re-planning
   * the same release is idempotent (set-with-id, not auto-id).
   */
  campaignId?: string;
  /** Total ad budget in cents (drives the ad_spend step). Defaults to 0. */
  budgetCents?: number;
}

/** Derive the deterministic campaign id for a release. */
export function campaignIdFor(releaseId: string, override?: string): string {
  return override ?? `campaign-${releaseId}`;
}

/**
 * Expand the release-campaign template into an ordered Campaign. PURE +
 * DETERMINISTIC: no I/O, no clock, no random — the same inputs yield the exact
 * same steps (one per template kind, in template order, status "planned").
 * Performs NO outward effect.
 */
export function planReleaseCampaign(
  releaseId: string,
  opts: PlanCampaignOptions = {},
): Campaign {
  const id = campaignIdFor(releaseId, opts.campaignId);
  const steps: CampaignStep[] = RELEASE_CAMPAIGN_TEMPLATE.map((kind) => ({
    id: `${id}__${kind}`,
    kind,
    status: "planned",
  }));
  return {
    id,
    releaseId,
    status: "planned",
    budgetCents: opts.budgetCents ?? 0,
    steps,
  };
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/** Strip absent optional keys from each step (Firestore rejects `undefined`). */
function serializeSteps(steps: CampaignStep[]): CampaignStep[] {
  return steps.map((s) => pruneUndefined({ ...s }) as CampaignStep);
}

/**
 * Persist a campaign to the admin-only `campaigns/{id}` collection
 * (set-with-id, idempotent). Returns the stored campaign.
 */
export async function saveCampaign(
  campaign: Campaign,
  store?: Firestore,
): Promise<Campaign> {
  const data = {
    id: campaign.id,
    releaseId: campaign.releaseId,
    status: campaign.status,
    budgetCents: campaign.budgetCents,
    steps: serializeSteps(campaign.steps),
  };
  await db(store).collection(CAMPAIGNS).doc(campaign.id).set(data);
  return campaign;
}

/** Read a campaign (admin SDK). Returns null if absent. */
export async function getCampaign(
  campaignId: string,
  store?: Firestore,
): Promise<Campaign | null> {
  const snap = await db(store).collection(CAMPAIGNS).doc(campaignId).get();
  return snap.exists ? (snap.data() as Campaign) : null;
}

/** List all campaigns (admin SDK). */
export async function listCampaigns(store?: Firestore): Promise<Campaign[]> {
  const snap = await db(store).collection(CAMPAIGNS).get();
  return snap.docs.map((d) => d.data() as Campaign);
}

/**
 * Plan a release campaign AND persist it (admin path). Deterministic id; the
 * stored steps are all "planned" — nothing is scheduled or executed here.
 */
export async function planAndSaveCampaign(
  releaseId: string,
  opts: PlanCampaignOptions = {},
  store?: Firestore,
): Promise<Campaign> {
  const campaign = planReleaseCampaign(releaseId, opts);
  return saveCampaign(campaign, store);
}

const MARKETING_EVENTS = "marketing_events";

/** The kinds of outward marketing action that get logged. */
export type MarketingEventKind = "social_post" | "email_blast" | "ad_spend";

/**
 * A sent-log entry recording one OUTWARD marketing action that actually fired
 * (after human approval). SENSITIVE/operational — stored admin-only in
 * `marketing_events/{id}` (firestore.rules denies all client access). `ref` is
 * the channel's returned id (post/send/ad-order id) for reconciliation.
 */
export interface MarketingEvent {
  id: string;
  kind: MarketingEventKind;
  /** The channel's returned id (postId / sendId / adOrderId). */
  ref: string;
  /** Short human-readable summary of the action. */
  summary: string;
  /** ISO-8601 time the action fired. */
  occurredAt: string;
}

/** Append a sent-log entry to the admin-only `marketing_events` collection. */
export async function recordMarketingEvent(
  event: MarketingEvent,
  store?: Firestore,
): Promise<MarketingEvent> {
  await db(store).collection(MARKETING_EVENTS).doc(event.id).set({ ...event });
  return event;
}

/** List logged outward marketing events (admin SDK). */
export async function listMarketingEvents(store?: Firestore): Promise<MarketingEvent[]> {
  const snap = await db(store).collection(MARKETING_EVENTS).get();
  return snap.docs.map((d) => d.data() as MarketingEvent);
}
