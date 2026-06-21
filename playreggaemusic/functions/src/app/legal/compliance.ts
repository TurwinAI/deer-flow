/**
 * Release compliance gate (P2B09, F10 Legal/Compliance).
 *
 * `checkReleaseCompliance(releaseId)` verifies a release is legally clear to
 * distribute BEFORE the consequential DSP delivery. It is a HARD gate wired into
 * `deliverRelease` (in addition to the human approval gate): a non-compliant
 * release is refused even when approved.
 *
 * Compliance requires ALL of:
 *   (a) AI-disclosure present — `release.aiGenerated === true` AND a provenance
 *       record exists for EACH track on the release,
 *   (b) ownership splits exist for the release and sum to 100 (the admin-only
 *       `rights` record),
 *   (c) an ACTIVE artist agreement with `consent.aiGenerationConsent === true`
 *       on file for the release's artist.
 *
 * License wording is a WARNING, not a hard fail: if the personal-download license
 * terms are still the placeholder (owner has not supplied binding wording), an
 * issue is listed but it does NOT block delivery (owner supplies wording before
 * go-live). All hard failures DO block.
 *
 * Application layer: MAY import harness/* and app/* (label store, contracts,
 * license).
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  getProvenance,
  getRelease,
  getRights,
  listTracksByRelease,
} from "../label/store";
import { getAgreement } from "./contracts";
import { getLicenseTerms, PERSONAL_DOWNLOAD_KIND } from "./license";

/** The result of a compliance check: overall verdict + the specific issues. */
export interface ComplianceResult {
  compliant: boolean;
  /** Human-readable issues. A WARNING-prefixed issue does NOT affect `compliant`. */
  issues: string[];
}

/** Prefix marking an issue as a non-blocking WARNING. */
export const WARNING_PREFIX = "WARNING: ";

/**
 * Check whether a release is compliant for distribution. Returns
 * `{ compliant, issues }`. Hard failures set `compliant: false` with a specific
 * issue; the license-placeholder case is appended as a non-blocking WARNING.
 *
 * Never throws for a missing release — an unknown release is simply non-compliant
 * with a clear issue (so the deliver path surfaces it as a refusal, not a crash).
 */
export async function checkReleaseCompliance(
  releaseId: string,
  store?: Firestore,
): Promise<ComplianceResult> {
  const issues: string[] = [];

  const release = await getRelease(releaseId, store);
  if (!release) {
    return { compliant: false, issues: [`Unknown release: ${releaseId}`] };
  }

  // (a) AI-disclosure: the release must be flagged AI-generated, and EVERY track
  // must carry a provenance disclosure record.
  if (release.aiGenerated !== true) {
    issues.push(`AI-disclosure missing: release ${releaseId} is not flagged aiGenerated.`);
  }
  const tracks = await listTracksByRelease(releaseId, store);
  if (tracks.length === 0) {
    issues.push(`AI-disclosure missing: release ${releaseId} has no tracks to disclose.`);
  }
  for (const track of tracks) {
    const provenance = await getProvenance(track.id, store);
    if (!provenance) {
      issues.push(
        `AI-disclosure missing: track ${track.id} has no AI-provenance record.`,
      );
    }
  }

  // (b) Ownership splits: a rights record must exist and sum to 100.
  const rights = await getRights(releaseId, store);
  if (!rights || rights.ownershipSplits.length === 0) {
    issues.push(`Ownership splits missing: no rights record for release ${releaseId}.`);
  } else {
    const total = rights.ownershipSplits.reduce((sum, s) => sum + s.percent, 0);
    if (Math.abs(total - 100) > 1e-9) {
      issues.push(
        `Ownership splits invalid: release ${releaseId} splits sum to ${total}, not 100.`,
      );
    }
  }

  // (c) Active artist agreement with AI-generation consent.
  const agreement = await getAgreement(release.artistId, store);
  if (!agreement) {
    issues.push(
      `Artist agreement missing: no agreement on file for artist ${release.artistId}.`,
    );
  } else if (agreement.status !== "active") {
    issues.push(
      `Artist agreement not active: agreement for artist ${release.artistId} is "${agreement.status}".`,
    );
  } else if (agreement.consent.aiGenerationConsent !== true) {
    issues.push(
      `AI-generation consent missing: artist ${release.artistId} has not consented to AI generation.`,
    );
  }

  // The number of HARD issues determines compliance (warnings appended below).
  const compliant = issues.length === 0;

  // License wording: a WARNING (not a hard fail). If the personal-download terms
  // are still the placeholder, surface it so the owner supplies binding wording
  // before go-live — but it does not block delivery.
  const license = await getLicenseTerms(PERSONAL_DOWNLOAD_KIND, store);
  if (license.isPlaceholder) {
    issues.push(
      `${WARNING_PREFIX}personal-download license is still the placeholder; ` +
        "owner must supply binding wording before go-live.",
    );
  }

  return { compliant, issues };
}
