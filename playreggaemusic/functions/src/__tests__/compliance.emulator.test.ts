/**
 * Release compliance gate + distribution integration (P2B09, F10) — EMULATOR
 * gate. Guarded so plain `pnpm test` (no emulator) skips them. Run via
 * `pnpm test:emulator`.
 *
 * Uses the seeded Roots Untold "Foundation Stones" release, which P2B09 seeds
 * with an ACTIVE artist agreement (AI-generation consent) so it is compliant.
 * The distributor is the FakeDistributorClient — the real one is NEVER used.
 *
 * Asserts:
 *   - the seeded release is COMPLIANT (only the license-placeholder WARNING),
 *   - removing provenance / rights / the active agreement makes it NON-compliant
 *     with the specific issue,
 *   - deliverRelease on a NON-compliant release THROWS and does NOT call the
 *     distributor even when approved:true,
 *   - deliverRelease on the compliant seeded release still succeeds (regression).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import {
  seedRootsUntold,
  FOUNDATION_RELEASE_ID,
  FOUNDATION_TRACK_IDS,
  ROOTS_UNTOLD_ARTIST_ID,
} from "../app/label/seed";
import { checkReleaseCompliance, WARNING_PREFIX } from "../app/legal/compliance";
import {
  COMPLIANCE_FAILED_MESSAGE,
  deliverRelease,
  getDistribution,
} from "../app/distribution/release";
import { FakeDistributorClient } from "../app/distribution/client";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(RUN)("release compliance + distribution integration (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of [
      "artists",
      "releases",
      "tracks",
      "track_masters",
      "products",
      "rights",
      "provenance",
      "distributions",
      "artist_agreements",
      "license_terms",
    ]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("the seeded release is COMPLIANT (only the license-placeholder WARNING)", async () => {
    await seedRootsUntold();
    const result = await checkReleaseCompliance(FOUNDATION_RELEASE_ID);
    expect(result.compliant).toBe(true);
    expect(result.issues.every((i) => i.startsWith(WARNING_PREFIX))).toBe(true);
  });

  it("removing a track's provenance makes it NON-compliant (specific issue)", async () => {
    await seedRootsUntold();
    await getDb().collection("provenance").doc(FOUNDATION_TRACK_IDS[1]).delete();
    const result = await checkReleaseCompliance(FOUNDATION_RELEASE_ID);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => i.includes(FOUNDATION_TRACK_IDS[1]) && /provenance/i.test(i))).toBe(
      true,
    );
  });

  it("removing the rights record makes it NON-compliant (specific issue)", async () => {
    await seedRootsUntold();
    await getDb().collection("rights").doc(FOUNDATION_RELEASE_ID).delete();
    const result = await checkReleaseCompliance(FOUNDATION_RELEASE_ID);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => /ownership splits missing/i.test(i))).toBe(true);
  });

  it("removing the active agreement makes it NON-compliant (specific issue)", async () => {
    await seedRootsUntold();
    await getDb().collection("artist_agreements").doc(ROOTS_UNTOLD_ARTIST_ID).delete();
    const result = await checkReleaseCompliance(FOUNDATION_RELEASE_ID);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => /agreement missing/i.test(i))).toBe(true);
  });

  it("deliverRelease REFUSES a non-compliant release (no distributor call) even when approved", async () => {
    await seedRootsUntold();
    // Break compliance: drop the active artist agreement.
    await getDb().collection("artist_agreements").doc(ROOTS_UNTOLD_ARTIST_ID).delete();

    const client = new FakeDistributorClient();
    await expect(
      deliverRelease(FOUNDATION_RELEASE_ID, { client, approved: true }),
    ).rejects.toThrow(COMPLIANCE_FAILED_MESSAGE);

    // The consequential action never reached the distributor.
    expect(client.deliveries).toHaveLength(0);
    // No delivery was mirrored into a distribution record.
    const record = await getDistribution(FOUNDATION_RELEASE_ID);
    expect(record?.deliveryId).toBeUndefined();
  });

  it("the refusal lists the specific compliance issue", async () => {
    await seedRootsUntold();
    await getDb().collection("rights").doc(FOUNDATION_RELEASE_ID).delete();
    const client = new FakeDistributorClient();
    await expect(
      deliverRelease(FOUNDATION_RELEASE_ID, { client, approved: true }),
    ).rejects.toThrow(/ownership splits missing/i);
    expect(client.deliveries).toHaveLength(0);
  });

  it("deliverRelease on the COMPLIANT seeded release still succeeds (regression)", async () => {
    await seedRootsUntold();
    const client = new FakeDistributorClient();
    const record = await deliverRelease(FOUNDATION_RELEASE_ID, { client, approved: true });
    expect(client.deliveries).toHaveLength(1);
    expect(record.status).toBe("accepted");
    expect(record.deliveryId).toBeTruthy();
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
