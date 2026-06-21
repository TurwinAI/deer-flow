/**
 * Label catalog tools + store + seed tests (B05). Emulator-only: guarded so
 * plain `pnpm test` (no emulator) skips them. Run via `pnpm test:emulator`.
 *
 * Asserts:
 *   - catalog tools round-trip through the store (create_artist/release/track/
 *     product then read back; list_orders empty then populated),
 *   - seedRootsUntold creates the expected artist/release/tracks/product and is
 *     idempotent on a second call (no duplicates).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import {
  createArtistTool,
  createProductTool,
  createReleaseTool,
  createTrackTool,
  getLabelTools,
  listOrdersTool,
} from "../app/label/tools";
import {
  getArtist,
  getProduct,
  getRelease,
  getTrackMaster,
  listArtists,
  listOrders,
  listReleasesByArtist,
  listTracksByRelease,
  recordOrder,
  setTrackMaster,
} from "../app/label/store";
import {
  FOUNDATION_PRODUCT_ID,
  FOUNDATION_RELEASE_ID,
  FOUNDATION_TRACK_IDS,
  ROOTS_UNTOLD_ARTIST_ID,
  seedRootsUntold,
} from "../app/label/seed";
import type { Order } from "../app/label/index";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(RUN)("label catalog (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of ["artists", "releases", "tracks", "track_masters", "products", "orders"]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("getLabelTools exposes the five catalog tools", () => {
    const names = getLabelTools().map((t) => t.name).sort();
    expect(names).toEqual(
      ["create_artist", "create_product", "create_release", "create_track", "list_orders"].sort(),
    );
  });

  it("create_artist tool round-trips through the store", async () => {
    await createArtistTool.invoke({
      id: "tool-artist",
      name: "Tool Artist",
      bio: "made by a tool",
      spotify: "https://open.spotify.com/artist/tool",
    });
    const artist = await getArtist("tool-artist");
    expect(artist?.name).toBe("Tool Artist");
    expect(artist?.links.spotify).toBe("https://open.spotify.com/artist/tool");
  });

  it("create_release tool links artistId and marks AI-generated", async () => {
    await createReleaseTool.invoke({
      id: "tool-release",
      artistId: "tool-artist",
      title: "Tool EP",
      catalogNumber: "PRM-999",
      type: "ep",
      releaseDate: "2026-08-01",
    });
    const release = await getRelease("tool-release");
    expect(release?.artistId).toBe("tool-artist");
    expect(release?.catalogNumber).toBe("PRM-999");
    expect(release?.aiGenerated).toBe(true);

    const byArtist = await listReleasesByArtist("tool-artist");
    expect(byArtist.map((r) => r.id)).toContain("tool-release");
  });

  it("create_track tool writes a PUBLIC track doc WITHOUT masterPath", async () => {
    await createTrackTool.invoke({
      id: "tool-track",
      releaseId: "tool-release",
      title: "Tool Track",
      durationSec: 180,
      previewClipPath: "previews/tool/track.mp3",
      masterPath: "masters/tool/track.wav",
    });
    const tracks = await listTracksByRelease("tool-release");
    expect(tracks.map((t) => t.id)).toContain("tool-track");
    // The public, world-readable track doc must NOT carry the private master.
    expect(tracks[0]).not.toHaveProperty("masterPath");
    // The private master is routed to the admin-only track_masters collection.
    const master = await getTrackMaster("tool-track");
    expect(master?.masterPath).toBe("masters/tool/track.wav");
  });

  it("setTrackMaster / getTrackMaster round-trip the private master path", async () => {
    expect(await getTrackMaster("solo-track")).toBeNull();
    const written = await setTrackMaster("solo-track", "masters/solo/track.wav");
    expect(written).toEqual({ trackId: "solo-track", masterPath: "masters/solo/track.wav" });
    const read = await getTrackMaster("solo-track");
    expect(read).toEqual({ trackId: "solo-track", masterPath: "masters/solo/track.wav" });
  });

  it("create_product tool round-trips through the store", async () => {
    await createProductTool.invoke({
      id: "tool-product",
      type: "music_download",
      title: "Tool Download",
      priceCents: 500,
      currency: "USD",
      releaseId: "tool-release",
    });
    const product = await getProduct("tool-product");
    expect(product?.type).toBe("music_download");
    expect(product?.priceCents).toBe(500);
  });

  it("list_orders returns [] then a recorded order", async () => {
    const empty = await listOrdersTool.invoke({});
    expect(JSON.parse(empty)).toEqual([]);

    const order: Order = {
      id: "order-1",
      customer: "cus_test",
      productId: "tool-product",
      amount: 700,
      currency: "USD",
      status: "paid",
      createdAt: "2026-06-20T00:00:00.000Z",
    };
    await recordOrder(order);

    const populated = JSON.parse(await listOrdersTool.invoke({})) as Order[];
    expect(populated).toHaveLength(1);
    expect(populated[0].id).toBe("order-1");
    expect(await listOrders()).toHaveLength(1);
  });

  it("seedRootsUntold creates the expected catalog and is idempotent", async () => {
    const first = await seedRootsUntold();
    expect(first.artist.id).toBe(ROOTS_UNTOLD_ARTIST_ID);
    expect(first.release.id).toBe(FOUNDATION_RELEASE_ID);
    expect(first.release.aiGenerated).toBe(true);
    expect(first.release.catalogNumber).toBe("PRM-001");
    expect(first.tracks.map((t) => t.id)).toEqual([...FOUNDATION_TRACK_IDS]);
    expect(first.product.id).toBe(FOUNDATION_PRODUCT_ID);

    // Persisted as expected.
    expect((await getArtist(ROOTS_UNTOLD_ARTIST_ID))?.name).toBe("Roots Untold");
    const seededTracks = await listTracksByRelease(FOUNDATION_RELEASE_ID);
    expect(seededTracks).toHaveLength(3);
    expect((await getProduct(FOUNDATION_PRODUCT_ID))?.type).toBe("music_download");

    // Public track docs must NOT leak the private master path...
    for (const track of seededTracks) {
      expect(track).not.toHaveProperty("masterPath");
    }
    // ...the masters live in the admin-only track_masters collection instead.
    for (const id of FOUNDATION_TRACK_IDS) {
      const master = await getTrackMaster(id);
      expect(master?.trackId).toBe(id);
      expect(master?.masterPath).toMatch(/^masters\//);
    }

    // Idempotent: a second call must not create duplicates (fixed ids).
    await seedRootsUntold();
    expect(await listArtists()).toHaveLength(1);
    expect(await listReleasesByArtist(ROOTS_UNTOLD_ARTIST_ID)).toHaveLength(1);
    expect(await listTracksByRelease(FOUNDATION_RELEASE_ID)).toHaveLength(3);
  });
});
