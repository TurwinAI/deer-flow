/**
 * Structured license terms (P2B09, F10) — EMULATOR gate. Guarded so plain
 * `pnpm test` (no emulator) skips them. Run via `pnpm test:emulator`.
 *
 * Asserts:
 *   - getLicenseTerms returns a CLEARLY-MARKED placeholder (isPlaceholder:true)
 *     by default (no owner-set terms),
 *   - setLicenseTerms stores owner wording and flips isPlaceholder:false,
 *   - the entitlement download still mints, carrying the current license text
 *     (placeholder by default, then the owner wording once set).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import {
  getLicenseTerms,
  setLicenseTerms,
  PERSONAL_DOWNLOAD_KIND,
  PERSONAL_LICENSE_PLACEHOLDER,
} from "../app/legal/license";
import {
  createProduct,
  createRelease,
  createTrack,
  recordOrder,
  setTrackMaster,
} from "../app/label/store";
import { mintDownloadUrl, type DownloadSigner } from "../app/polar/entitlement";
import type { Order, Product, Release, Track } from "../app/label/index";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

const fakeSigner: DownloadSigner = async (masterPath, expiresAtMs) =>
  `https://signed.example/${masterPath}?exp=${expiresAtMs}`;

const RELEASE: Release = {
  id: "lic-rel",
  artistId: "lic-art",
  title: "License Test",
  catalogNumber: "PRM-LIC",
  type: "ep",
  releaseDate: "2026-07-01",
  aiGenerated: true,
};
const TRACK: Track = {
  id: "lic-trk",
  releaseId: "lic-rel",
  title: "License Track",
  durationSec: 200,
  previewClipPath: "previews/lic/track.mp3",
};
const PRODUCT: Product = {
  id: "lic-prod",
  type: "music_download",
  title: "License Download",
  priceCents: 700,
  currency: "USD",
  releaseId: "lic-rel",
};
const ORDER: Order = {
  id: "lic-ord",
  customer: "cus_lic",
  productId: "lic-prod",
  amount: 700,
  currency: "USD",
  status: "paid",
  createdAt: "2026-06-20T00:00:00.000Z",
};

describe.skipIf(RUN)("license terms (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of [
      "license_terms",
      "releases",
      "tracks",
      "track_masters",
      "products",
      "orders",
    ]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("getLicenseTerms returns a clearly-marked placeholder by default", async () => {
    const terms = await getLicenseTerms(PERSONAL_DOWNLOAD_KIND);
    expect(terms.isPlaceholder).toBe(true);
    expect(terms.bodyText).toBe(PERSONAL_LICENSE_PLACEHOLDER);
    expect(terms.bodyText).toMatch(/placeholder/i);
  });

  it("setLicenseTerms stores owner wording and flips isPlaceholder:false", async () => {
    const owner = "Personal-listening license (owner-supplied, legally reviewed wording).";
    const set = await setLicenseTerms(PERSONAL_DOWNLOAD_KIND, owner);
    expect(set.isPlaceholder).toBe(false);
    expect(set.bodyText).toBe(owner);

    const read = await getLicenseTerms(PERSONAL_DOWNLOAD_KIND);
    expect(read.isPlaceholder).toBe(false);
    expect(read.bodyText).toBe(owner);
  });

  it("setLicenseTerms rejects empty wording", async () => {
    await expect(setLicenseTerms(PERSONAL_DOWNLOAD_KIND, "   ")).rejects.toThrow(/bodyText/i);
  });

  it("entitlement download mints with the placeholder license by default", async () => {
    await createRelease(RELEASE);
    await createTrack(TRACK);
    await setTrackMaster(TRACK.id, "masters/lic/track.wav");
    await createProduct(PRODUCT);
    await recordOrder(ORDER);

    const grant = await mintDownloadUrl("lic-ord", "lic-trk", undefined, fakeSigner);
    expect(grant.license).toBe(PERSONAL_LICENSE_PLACEHOLDER);
    expect(grant.aiGenerated).toBe(true);
  });

  it("entitlement download mints with owner wording once set", async () => {
    await createRelease(RELEASE);
    await createTrack(TRACK);
    await setTrackMaster(TRACK.id, "masters/lic/track.wav");
    await createProduct(PRODUCT);
    await recordOrder(ORDER);
    const owner = "Owner-supplied binding personal-listening license.";
    await setLicenseTerms(PERSONAL_DOWNLOAD_KIND, owner);

    const grant = await mintDownloadUrl("lic-ord", "lic-trk", undefined, fakeSigner);
    expect(grant.license).toBe(owner);
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
