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
  setOwnershipSplitsTool,
  setReleaseIdentifiersTool,
  setTrackIsrcTool,
} from "../app/label/tools";
import {
  getArtist,
  getProduct,
  getProvenance,
  getRelease,
  getRights,
  getTrackMaster,
  listArtists,
  listOrders,
  listReleasesByArtist,
  listTracksByRelease,
  recordOrder,
  setProvenance,
  setTrackMaster,
} from "../app/label/store";
import { contentSha256 } from "../app/label/assets";
import type { ProvenanceRecord } from "../app/label/index";
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
    for (const coll of [
      "artists",
      "releases",
      "tracks",
      "track_masters",
      "products",
      "orders",
      "rights",
      "provenance",
    ]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("getLabelTools exposes the catalog + metadata/rights tools", () => {
    const names = getLabelTools().map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "create_artist",
        "create_product",
        "create_release",
        "create_track",
        "generate_preview",
        "ingest_master",
        "list_orders",
        "set_ownership_splits",
        "set_provenance",
        "set_release_identifiers",
        "set_track_isrc",
      ].sort(),
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

  it("set_track_isrc tool writes a valid ISRC onto the public track doc", async () => {
    await createTrackTool.invoke({
      id: "idtrack",
      releaseId: "tool-release",
      title: "Identified Track",
      durationSec: 180,
      previewClipPath: "previews/tool/idtrack.mp3",
      masterPath: "masters/tool/idtrack.wav",
    });
    await setTrackIsrcTool.invoke({ trackId: "idtrack", isrc: "US-RC1-76-07839" });
    const tracks = await listTracksByRelease("tool-release");
    const track = tracks.find((t) => t.id === "idtrack");
    // Stored normalized (hyphens stripped, uppercase) on the PUBLIC track doc.
    expect(track?.isrc).toBe("USRC17607839");
  });

  it("set_track_isrc tool REJECTS an invalid ISRC", async () => {
    await createTrackTool.invoke({
      id: "badtrack",
      releaseId: "tool-release",
      title: "Bad Track",
      durationSec: 180,
      previewClipPath: "previews/tool/badtrack.mp3",
      masterPath: "masters/tool/badtrack.wav",
    });
    await expect(
      setTrackIsrcTool.invoke({ trackId: "badtrack", isrc: "NOT-AN-ISRC" }),
    ).rejects.toThrow(/invalid isrc/i);
  });

  it("set_release_identifiers tool writes UPC + credits onto the public release doc", async () => {
    await createReleaseTool.invoke({
      id: "idrelease",
      artistId: "tool-artist",
      title: "Identified EP",
      catalogNumber: "PRM-777",
      type: "ep",
      releaseDate: "2026-09-01",
    });
    await setReleaseIdentifiersTool.invoke({
      releaseId: "idrelease",
      upc: "0-36000-29145-2",
      credits: [{ role: "Producer", name: "PlayReggaeMusic.ai" }],
    });
    const release = await getRelease("idrelease");
    expect(release?.upc).toBe("036000291452"); // normalized
    expect(release?.credits).toEqual([{ role: "Producer", name: "PlayReggaeMusic.ai" }]);
  });

  it("set_release_identifiers tool REJECTS a UPC with a bad check digit", async () => {
    await createReleaseTool.invoke({
      id: "badrelease",
      artistId: "tool-artist",
      title: "Bad EP",
      catalogNumber: "PRM-778",
      type: "ep",
      releaseDate: "2026-09-01",
    });
    await expect(
      setReleaseIdentifiersTool.invoke({ releaseId: "badrelease", upc: "036000291453" }),
    ).rejects.toThrow(/invalid upc/i);
  });

  it("set_ownership_splits tool writes SENSITIVE splits to the admin-only rights collection", async () => {
    await setOwnershipSplitsTool.invoke({
      releaseId: "rel-splits",
      splits: [
        { payee: "Label", percent: 60 },
        { payee: "Artist", percent: 40 },
      ],
    });
    // Splits live in `rights`, NOT on any public doc.
    const rights = await getRights("rel-splits");
    expect(rights?.ownershipSplits).toEqual([
      { payee: "Label", percent: 60 },
      { payee: "Artist", percent: 40 },
    ]);
    // The public release doc (if any) never carries ownershipSplits.
    const release = await getRelease("rel-splits");
    expect(release).toBeUndefined();
    const db = getDb();
    const rightsSnap = await db.collection("rights").doc("rel-splits").get();
    expect(rightsSnap.data()).not.toHaveProperty("payee");
  });

  it("set_ownership_splits tool REJECTS splits that do not sum to 100", async () => {
    await expect(
      setOwnershipSplitsTool.invoke({
        releaseId: "rel-bad-splits",
        splits: [
          { payee: "Label", percent: 60 },
          { payee: "Artist", percent: 30 },
        ],
      }),
    ).rejects.toThrow(/sum to 100/i);
    expect(await getRights("rel-bad-splits")).toBeNull();
  });

  it("setProvenance writes provenance/{trackId} with a content SHA-256", async () => {
    const masterBytes = Buffer.from("provenance-master-bytes");
    const record: ProvenanceRecord = {
      trackId: "prov-track",
      generator: "PlayReggaeMusic.ai",
      createdAt: "2026-07-04T00:00:00.000Z",
      disclosure: "AI-generated: produced with artificial intelligence.",
      contentSha256: contentSha256(masterBytes),
    };
    await setProvenance(record);
    const read = await getProvenance("prov-track");
    expect(read?.generator).toBe("PlayReggaeMusic.ai");
    expect(read?.contentSha256).toBe(contentSha256(masterBytes));
    expect(read?.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    // Stored under the provenance collection (not on the public track doc).
    const raw = await getDb().collection("provenance").doc("prov-track").get();
    expect(raw.data()?.trackId).toBe("prov-track");
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

    // Seed carries valid PUBLIC identifiers: a valid release UPC + credits...
    const seededRelease = await getRelease(FOUNDATION_RELEASE_ID);
    expect(seededRelease?.upc).toBe("196633982100");
    expect(seededRelease?.credits?.length).toBeGreaterThan(0);
    // ...and a valid ISRC on every track.
    for (const track of seededTracks) {
      expect(track.isrc).toMatch(/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/);
    }

    // SENSITIVE ownership splits live in the admin-only rights collection and
    // sum to 100; the PUBLIC release doc NEVER carries ownershipSplits.
    const rights = await getRights(FOUNDATION_RELEASE_ID);
    expect(rights?.ownershipSplits.reduce((s, x) => s + x.percent, 0)).toBe(100);
    expect(seededRelease).not.toHaveProperty("ownershipSplits");

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

    // Seed writes a PUBLIC AI-provenance record per track, each with a
    // content SHA-256 binding the disclosure to the (seeded) master bytes.
    expect(first.provenance).toHaveLength(3);
    for (const id of FOUNDATION_TRACK_IDS) {
      const prov = await getProvenance(id);
      expect(prov?.trackId).toBe(id);
      expect(prov?.generator).toBe("PlayReggaeMusic.ai");
      expect(prov?.disclosure).toMatch(/ai-generated/i);
      expect(prov?.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    }

    // Idempotent: a second call must not create duplicates (fixed ids).
    await seedRootsUntold();
    expect(await listArtists()).toHaveLength(1);
    expect(await listReleasesByArtist(ROOTS_UNTOLD_ARTIST_ID)).toHaveLength(1);
    expect(await listTracksByRelease(FOUNDATION_RELEASE_ID)).toHaveLength(3);
  });
});
