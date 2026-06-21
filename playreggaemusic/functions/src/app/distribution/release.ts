/**
 * Release distribution flow (P2B03, F4).
 *
 * Three operations over the `distributions/{releaseId}` record:
 *   - scheduleRelease: record an intent to deliver (status "scheduled").
 *   - deliverRelease:  the CONSEQUENTIAL action — build + validate the DDEX ERN,
 *     submit it to the injected distributor, mirror the returned delivery
 *     id/status into the record. REFUSES to deliver unless `approved === true`.
 *   - getDistribution / refreshDistributionStatus: read + re-poll status.
 *
 * HUMAN-IN-THE-LOOP GATE (constitution §7/§13): delivering to DSPs is a
 * consequential, hard-to-reverse public action. `deliverRelease` throws
 * "distribution requires approval" unless the caller passes `approved: true`,
 * and it does so BEFORE constructing the ERN or touching the distributor client
 * — so an unapproved call never reaches the network. P2B04 will replace this
 * inline boolean with the full ApprovalGate + audit log; this is the minimal,
 * load-bearing gate for now.
 *
 * The distributor client is INJECTED (FakeDistributorClient in tests), so the
 * whole flow is exercisable against the Firestore emulator with no live calls.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getRelease, listTracksByRelease, getArtist } from "../label/store";
import { checkReleaseCompliance } from "../legal/compliance";
import { buildErnMessage, validateErn } from "./ddex";
import type { DistributorClient } from "./client";
import {
  getDistributionRecord,
  putDistribution,
  updateDistribution,
  type DistributionRecord,
} from "./store";

/** Error message thrown when deliverRelease is called without approval. */
export const APPROVAL_REQUIRED_MESSAGE = "distribution requires approval";

/** Message prefix thrown when deliverRelease is refused for non-compliance. */
export const COMPLIANCE_FAILED_MESSAGE = "distribution refused — release is not compliant";

/**
 * Schedule a release for distribution. Writes/merges a `distributions/{releaseId}`
 * record with status "scheduled" and the requested time. Verifies the release
 * exists first. Does NOT deliver anything.
 */
export async function scheduleRelease(
  releaseId: string,
  scheduledAt: string,
  store?: Firestore,
): Promise<DistributionRecord> {
  const release = await getRelease(releaseId, store);
  if (!release) {
    throw new Error(`Unknown release: ${releaseId}`);
  }
  return putDistribution(
    {
      releaseId,
      status: "scheduled",
      scheduledAt,
      updatedAt: new Date().toISOString(),
    },
    store,
  );
}

/** Options for {@link deliverRelease}. */
export interface DeliverReleaseOptions {
  /** The injected distributor client (FakeDistributorClient in tests). */
  client: DistributorClient;
  /**
   * Human-in-the-loop approval. MUST be `true` or delivery is refused. An admin
   * passing `approved: true` represents the human approval of this consequential
   * action.
   */
  approved: boolean;
  /** Optional Firestore override (tests pass the emulator db). */
  store?: Firestore;
}

/**
 * Deliver a release to DSPs via the distributor (CONSEQUENTIAL).
 *
 * Two hard preconditions fire BEFORE the ERN is built or the client is touched,
 * so a refused call performs no network/distributor work at all:
 *   1. APPROVAL GATE — refuses unless `approved === true` (throws
 *      `APPROVAL_REQUIRED_MESSAGE`).
 *   2. COMPLIANCE GATE (P2B09) — runs `checkReleaseCompliance` and refuses (throws
 *      `COMPLIANCE_FAILED_MESSAGE` + the listed issues) unless the release is
 *      compliant: AI-disclosure (aiGenerated + provenance per track), ownership
 *      splits summing to 100, and an ACTIVE artist agreement with AI-generation
 *      consent. This blocks an approved-but-non-compliant release from shipping.
 * When both pass:
 *   3. load the release + its tracks (+ artist for the display name),
 *   4. build + structurally validate the DDEX ERN (rejects bad UPC/ISRC),
 *   5. submit it to the injected client,
 *   6. mirror the returned deliveryId + status into the distribution record.
 */
export async function deliverRelease(
  releaseId: string,
  options: DeliverReleaseOptions,
): Promise<DistributionRecord> {
  // -- APPROVAL GATE (fires before any consequential work) -----------------
  if (options.approved !== true) {
    throw new Error(APPROVAL_REQUIRED_MESSAGE);
  }

  const { client, store } = options;

  // -- COMPLIANCE GATE (P2B09) — refuse a non-compliant release even when
  // approved, BEFORE building the ERN or touching the distributor. --------
  const compliance = await checkReleaseCompliance(releaseId, store);
  if (!compliance.compliant) {
    throw new Error(`${COMPLIANCE_FAILED_MESSAGE}: ${compliance.issues.join("; ")}`);
  }

  const release = await getRelease(releaseId, store);
  if (!release) {
    throw new Error(`Unknown release: ${releaseId}`);
  }
  const tracks = await listTracksByRelease(releaseId, store);
  const artist = await getArtist(release.artistId, store);
  const artistName = artist?.name ?? release.artistId;

  // Build + validate the ERN (throws on missing/invalid UPC or any ISRC).
  const ernXml = buildErnMessage(release, tracks, { artistName });
  const validation = validateErn(ernXml);
  if (!validation.ok) {
    throw new Error(`Built ERN failed validation: ${validation.problems.join("; ")}`);
  }

  if (release.upc === undefined) {
    // Unreachable (buildErnMessage already enforced this) — defensive.
    throw new Error(`Release ${releaseId} has no UPC.`);
  }

  // Submit to the distributor (the injected client).
  const result = await client.deliver(ernXml, {
    releaseId,
    upc: release.upc,
    title: release.title,
  });

  const now = new Date().toISOString();
  return putDistribution(
    {
      releaseId,
      status: result.status,
      deliveryId: result.deliveryId,
      deliveredAt: now,
      updatedAt: now,
    },
    store,
  );
}

/** Read a release's distribution record. Returns null if none. */
export async function getDistribution(
  releaseId: string,
  store?: Firestore,
): Promise<DistributionRecord | null> {
  return getDistributionRecord(releaseId, store);
}

/**
 * Refresh a delivered release's status from the distributor and mirror it into
 * the record. Throws if the release has no delivery yet. Uses the injected
 * client's `status()` — no live call in tests (FakeDistributorClient).
 */
export async function refreshDistributionStatus(
  releaseId: string,
  client: DistributorClient,
  store?: Firestore,
): Promise<DistributionRecord> {
  const record = await getDistributionRecord(releaseId, store);
  if (!record) {
    throw new Error(`No distribution record for release ${releaseId}.`);
  }
  if (!record.deliveryId) {
    throw new Error(`Release ${releaseId} has not been delivered yet.`);
  }
  const status = await client.status(record.deliveryId);
  return updateDistribution(
    releaseId,
    { status, updatedAt: new Date().toISOString() },
    store,
  );
}
