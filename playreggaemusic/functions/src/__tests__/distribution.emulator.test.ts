/**
 * Release distribution flow tests (P2B03, F4) — EMULATOR-only. Guarded so plain
 * `pnpm test` (no emulator) skips them. Run via `pnpm test:emulator`.
 *
 * Uses the seeded Roots Untold "Foundation Stones" release (valid UPC + a valid
 * ISRC on every track from P2B01). The distributor is the FakeDistributorClient
 * — the real DdexDistributorClient is NEVER constructed or invoked here.
 *
 * Asserts:
 *   - scheduleRelease writes distributions/{releaseId} (status "scheduled"),
 *   - deliverRelease with approved:false THROWS and does NOT call the
 *     distributor (nothing delivered),
 *   - deliverRelease with approved:true calls the distributor and mirrors the
 *     returned deliveryId + status into the record,
 *   - refreshDistributionStatus updates the record from the distributor,
 *   - the schedule_release agent tool writes a scheduled record.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import { seedRootsUntold, FOUNDATION_RELEASE_ID } from "../app/label/seed";
import {
  APPROVAL_REQUIRED_MESSAGE,
  deliverRelease,
  getDistribution,
  refreshDistributionStatus,
  scheduleRelease,
} from "../app/distribution/release";
import { FakeDistributorClient } from "../app/distribution/client";
import { scheduleReleaseTool } from "../app/distribution/tools";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(RUN)("release distribution (emulator)", () => {
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
    ]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("scheduleRelease writes distributions/{releaseId} with status 'scheduled'", async () => {
    await seedRootsUntold();
    const record = await scheduleRelease(FOUNDATION_RELEASE_ID, "2026-07-04T00:00:00Z");
    expect(record.status).toBe("scheduled");
    expect(record.scheduledAt).toBe("2026-07-04T00:00:00Z");

    const read = await getDistribution(FOUNDATION_RELEASE_ID);
    expect(read?.status).toBe("scheduled");
    // Persisted under the operational distributions collection.
    const raw = await getDb().collection("distributions").doc(FOUNDATION_RELEASE_ID).get();
    expect(raw.data()?.releaseId).toBe(FOUNDATION_RELEASE_ID);
  });

  it("scheduleRelease rejects an unknown release", async () => {
    await expect(scheduleRelease("no-such-release", "2026-07-04T00:00:00Z")).rejects.toThrow(
      /unknown release/i,
    );
  });

  it("deliverRelease with approved:false THROWS and does NOT call the distributor", async () => {
    await seedRootsUntold();
    const client = new FakeDistributorClient();
    await expect(
      deliverRelease(FOUNDATION_RELEASE_ID, { client, approved: false }),
    ).rejects.toThrow(APPROVAL_REQUIRED_MESSAGE);
    // The consequential action never reached the distributor.
    expect(client.deliveries).toHaveLength(0);
    // No delivery was mirrored into a distribution record.
    const record = await getDistribution(FOUNDATION_RELEASE_ID);
    expect(record?.deliveryId).toBeUndefined();
  });

  it("deliverRelease with approved:true calls the distributor and mirrors deliveryId + status", async () => {
    await seedRootsUntold();
    const client = new FakeDistributorClient();
    const record = await deliverRelease(FOUNDATION_RELEASE_ID, { client, approved: true });

    // The distributor received exactly one ERN package for this release.
    expect(client.deliveries).toHaveLength(1);
    const delivered = client.deliveries[0];
    expect(delivered.meta.releaseId).toBe(FOUNDATION_RELEASE_ID);
    expect(delivered.meta.upc).toBe("196633982100");
    // The ERN it received carries the UPC + each seeded ISRC.
    expect(delivered.ernXml).toContain("196633982100");
    expect(delivered.ernXml).toContain("USRUM2600001");
    expect(delivered.ernXml).toContain("USRUM2600002");
    expect(delivered.ernXml).toContain("USRUM2600003");

    // The returned deliveryId + status were mirrored into the record.
    expect(record.deliveryId).toBe(delivered.deliveryId);
    expect(record.status).toBe("accepted");
    expect(record.deliveredAt).toBeTruthy();

    const read = await getDistribution(FOUNDATION_RELEASE_ID);
    expect(read?.deliveryId).toBe(delivered.deliveryId);
    expect(read?.status).toBe("accepted");
  });

  it("refreshDistributionStatus updates the record from the distributor", async () => {
    await seedRootsUntold();
    const client = new FakeDistributorClient();
    await deliverRelease(FOUNDATION_RELEASE_ID, { client, approved: true });

    const refreshed = await refreshDistributionStatus(FOUNDATION_RELEASE_ID, client);
    // FakeDistributorClient advances accepted -> delivered on status().
    expect(refreshed.status).toBe("delivered");

    const read = await getDistribution(FOUNDATION_RELEASE_ID);
    expect(read?.status).toBe("delivered");
  });

  it("refreshDistributionStatus throws if the release was never delivered", async () => {
    await seedRootsUntold();
    await scheduleRelease(FOUNDATION_RELEASE_ID, "2026-07-04T00:00:00Z");
    const client = new FakeDistributorClient();
    await expect(refreshDistributionStatus(FOUNDATION_RELEASE_ID, client)).rejects.toThrow(
      /not been delivered/i,
    );
  });

  it("schedule_release agent tool writes a scheduled record (no deliver)", async () => {
    await seedRootsUntold();
    const out = await scheduleReleaseTool.invoke({
      releaseId: FOUNDATION_RELEASE_ID,
      scheduledAt: "2026-08-01T00:00:00Z",
    });
    expect(out).toMatch(/scheduled/i);
    const read = await getDistribution(FOUNDATION_RELEASE_ID);
    expect(read?.status).toBe("scheduled");
    expect(read?.scheduledAt).toBe("2026-08-01T00:00:00Z");
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
