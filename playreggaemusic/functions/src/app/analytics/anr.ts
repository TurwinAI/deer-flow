/**
 * A&R recommendations (P2B08, F1) — DETERMINISTIC "what to do next" PROPOSALS
 * derived from an insight report, stored admin-only in `anr_recommendations`.
 *
 * These are PROPOSALS ONLY. A recommendation is an inert record describing a
 * suggested next action and a non-binding pointer to the NON-consequential tool
 * that would draft it (e.g. plan_campaign) or a note that the consequential act
 * (releasing / spending) would go through the existing approval gates. Producing
 * a recommendation NEVER triggers a release, a campaign send, or a payout — it
 * writes nothing outside `anr_recommendations`. (Tests assert the
 * distributions/payouts/campaigns/marketing_events collections stay unchanged.)
 *
 * The decision logic is deterministic on the report:
 *   - a release whose streams clearly OVERPERFORM the period average → propose a
 *     follow-up single (references the NON-consequential planner),
 *   - a release whose streams clearly UNDERPERFORM the average → propose a
 *     marketing push (references the NON-consequential plan_campaign tool; the
 *     actual spend would still pass the human approval gate),
 *   - the single top-revenue release → propose deepening D2C around it.
 * Same report ⇒ same recommendations (stable ids + ordering), so the unit gate
 * can assert the exact proposals.
 *
 * Application layer: MAY import harness/* (getDb) + app/* (insights).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";
import {
  generateInsightReport,
  type InsightReport,
  type RankedRelease,
} from "./insights";
import type { Period } from "./ingest";

const ANR_RECOMMENDATIONS = "anr_recommendations";

/** The kinds of A&R proposal the engine can emit. */
export type RecommendationKind =
  | "follow_up_single"
  | "marketing_push"
  | "deepen_d2c";

/**
 * A single A&R PROPOSAL. Inert: it records a suggested next action and the
 * NON-consequential tool that would draft it; it never executes anything.
 * `proposalOnly` is always true (a structural reminder this is read/propose-only).
 */
export interface AnrRecommendation {
  /** Stable id `${period}__${kind}__${releaseId}` so re-running is idempotent. */
  id: string;
  period: Period;
  kind: RecommendationKind;
  /** The release the proposal concerns. */
  releaseId: string;
  /** Human-readable rationale (deterministic). */
  rationale: string;
  /**
   * The NON-consequential tool that would act on this proposal (drafting only),
   * or a note that the consequential step passes the approval gate.
   */
  suggestedTool: "plan_campaign" | "none";
  /** Always true — these are proposals, never auto-actions. */
  proposalOnly: true;
}

/**
 * Decide A&R PROPOSALS from a report. PURE + DETERMINISTIC. A release is
 * "overperforming" when its streams are at least 1.5x the per-release average,
 * "underperforming" when at most 0.5x (only meaningful with >= 2 ranked
 * releases). Thresholds use integer arithmetic (no float) so the ordering and
 * selection are reproducible. Returns proposals in a stable order.
 */
export function recommendFromReport(report: InsightReport): AnrRecommendation[] {
  const recs: AnrRecommendation[] = [];
  const ranked = report.topReleasesByStreams;

  if (ranked.length >= 2) {
    const totalStreams = ranked.reduce((sum, r) => sum + r.value, 0);
    const avg = totalStreams / ranked.length;
    for (const release of ranked) {
      // Overperformer: streams >= 1.5 * avg  ⇔  2 * streams >= 3 * avg.
      if (2 * release.value >= 3 * avg) {
        recs.push(followUpSingle(report.period, release));
      }
      // Underperformer: streams <= 0.5 * avg ⇔ 2 * streams <= avg.
      if (2 * release.value <= avg) {
        recs.push(marketingPush(report.period, release));
      }
    }
  }

  // Top-revenue release: propose deepening D2C around the proven seller.
  const topRevenue = report.topReleasesByRevenue[0];
  if (topRevenue) {
    recs.push(deepenD2c(report.period, topRevenue));
  }

  // Stable ordering: by kind, then releaseId, so the set is reproducible.
  return recs.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.releaseId.localeCompare(b.releaseId),
  );
}

function followUpSingle(period: Period, release: RankedRelease): AnrRecommendation {
  return {
    id: `${period}__follow_up_single__${release.releaseId}`,
    period,
    kind: "follow_up_single",
    releaseId: release.releaseId,
    rationale:
      `Release ${release.releaseId} is overperforming on streams (${release.value}). ` +
      `PROPOSAL: develop a follow-up single. This is a proposal only — any actual ` +
      `release goes through the existing distribution approval gate.`,
    suggestedTool: "none",
    proposalOnly: true,
  };
}

function marketingPush(period: Period, release: RankedRelease): AnrRecommendation {
  return {
    id: `${period}__marketing_push__${release.releaseId}`,
    period,
    kind: "marketing_push",
    releaseId: release.releaseId,
    rationale:
      `Release ${release.releaseId} is underperforming on streams (${release.value}). ` +
      `PROPOSAL: plan a marketing push. This is a proposal only — it can be drafted ` +
      `with the non-consequential plan_campaign tool; any spend still requires human ` +
      `approval at the marketing approval gate.`,
    suggestedTool: "plan_campaign",
    proposalOnly: true,
  };
}

function deepenD2c(period: Period, release: RankedRelease): AnrRecommendation {
  return {
    id: `${period}__deepen_d2c__${release.releaseId}`,
    period,
    kind: "deepen_d2c",
    releaseId: release.releaseId,
    rationale:
      `Release ${release.releaseId} is the top D2C revenue earner (${release.value}¢). ` +
      `PROPOSAL: deepen the D2C catalog around it. This is a proposal only — no spend ` +
      `or release is performed.`,
    suggestedTool: "none",
    proposalOnly: true,
  };
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

/** Persist one recommendation to the admin-only collection (idempotent). */
export async function recordRecommendation(
  rec: AnrRecommendation,
  store?: Firestore,
): Promise<AnrRecommendation> {
  await db(store).collection(ANR_RECOMMENDATIONS).doc(rec.id).set({ ...rec });
  return rec;
}

/** List stored A&R recommendations (admin SDK). */
export async function listRecommendations(store?: Firestore): Promise<AnrRecommendation[]> {
  const snap = await db(store).collection(ANR_RECOMMENDATIONS).get();
  return snap.docs.map((d) => d.data() as AnrRecommendation);
}

/**
 * Generate A&R recommendations for a period and persist them to the admin-only
 * `anr_recommendations` collection. Regenerates the period's insight report
 * first (so the proposals reflect current analytics), then derives + stores the
 * deterministic proposals. PROPOSALS ONLY — writes nothing but recommendation
 * records (and the report); triggers NO release, campaign, or payout.
 */
export async function recommendNextActions(
  period: Period,
  options: { priorPeriod?: Period; store?: Firestore } = {},
): Promise<AnrRecommendation[]> {
  const store = options.store;
  const report = await generateInsightReport(period, {
    priorPeriod: options.priorPeriod,
    store,
  });
  const recs = recommendFromReport(report);
  for (const rec of recs) {
    await recordRecommendation(rec, store);
  }
  return recs;
}
