/**
 * Polar checkout + webhook + entitlement (B06) — EMULATOR gate. Guarded so
 * plain `pnpm test` skips them. Run via `pnpm test:emulator`.
 *
 * Polar is MOCKED throughout (FakePolarClient); the storage signer is MOCKED
 * (a fake signer), so NO live Polar call and NO real GCS bucket is touched.
 *
 * Asserts:
 *  - checkout: createCheckoutForProduct looks up the emulator product and
 *    returns the FakePolarClient's URL; unknown / un-published products throw,
 *  - webhook: a paid event records an order (emulator); a non-paid event is
 *    ignored,
 *  - entitlement: entitled customer -> signed url; not entitled -> throws.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import { createProduct, createRelease, createTrack, getOrder } from "../app/label/store";
import { FakePolarClient } from "../app/polar/client";
import { createCheckoutForProduct } from "../app/polar/checkout";
import { handlePolarWebhook, type PolarWebhookEvent } from "../app/polar/webhook";
import {
  hasEntitlement,
  mintDownloadUrl,
  PERSONAL_LICENSE_PLACEHOLDER,
  type DownloadSigner,
} from "../app/polar/entitlement";
import { recordOrder } from "../app/label/store";
import type { Order, Product, Release, Track } from "../app/label/index";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

const PRODUCT: Product = {
  id: "prod-test",
  type: "music_download",
  title: "Test Download",
  priceCents: 700,
  currency: "USD",
  releaseId: "rel-test",
  polarProductId: "polar_prod_test",
  polarPriceId: "polar_price_test",
};

const RELEASE: Release = {
  id: "rel-test",
  artistId: "art-test",
  title: "Test Release",
  catalogNumber: "PRM-TEST",
  type: "ep",
  releaseDate: "2026-07-01",
  aiGenerated: true,
};

const TRACK: Track = {
  id: "trk-test",
  releaseId: "rel-test",
  title: "Test Track",
  durationSec: 200,
  previewClipPath: "previews/test/track.mp3",
  masterPath: "masters/test/track.wav",
};

/** A fake signer: returns a deterministic URL, never touches GCS. */
const fakeSigner: DownloadSigner = async (masterPath, expiresAtMs) =>
  `https://signed.example/${masterPath}?exp=${expiresAtMs}`;

describe.skipIf(RUN)("polar checkout/webhook/entitlement (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of ["artists", "releases", "tracks", "products", "orders"]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  // -- checkout ------------------------------------------------------------
  it("createCheckoutForProduct returns the mocked checkout URL", async () => {
    await createProduct(PRODUCT);
    const client = new FakePolarClient();
    const result = await createCheckoutForProduct("prod-test", client);
    expect(result.checkoutUrl).toContain("polar.sh/checkout");
    // Mapped our Firestore id -> the Polar product id, mirrored our id in metadata.
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].productId).toBe("polar_prod_test");
    expect(client.calls[0].metadata?.productId).toBe("prod-test");
  });

  it("createCheckoutForProduct throws on an unknown product", async () => {
    const client = new FakePolarClient();
    await expect(createCheckoutForProduct("nope", client)).rejects.toThrow(/unknown product/i);
  });

  it("createCheckoutForProduct throws when polarProductId is missing", async () => {
    await createProduct({ ...PRODUCT, id: "prod-unpublished", polarProductId: undefined });
    const client = new FakePolarClient();
    await expect(createCheckoutForProduct("prod-unpublished", client)).rejects.toThrow(
      /no polarProductId/i,
    );
  });

  // -- webhook -------------------------------------------------------------
  it("handlePolarWebhook records an order on a paid event", async () => {
    const event: PolarWebhookEvent = {
      type: "order.paid",
      data: {
        id: "ord_paid_1",
        customer_id: "cus_123",
        amount: 700,
        currency: "USD",
        metadata: { productId: "prod-test" },
      },
    };
    const result = await handlePolarWebhook(event);
    expect(result.handled).toBe(true);
    const stored = await getOrder("ord_paid_1");
    expect(stored?.status).toBe("paid");
    expect(stored?.productId).toBe("prod-test");
    expect(stored?.customer).toBe("cus_123");
  });

  it("handlePolarWebhook ignores a non-paid event", async () => {
    const event: PolarWebhookEvent = {
      type: "subscription.created",
      data: { id: "sub_1", metadata: { productId: "prod-test" } },
    };
    const result = await handlePolarWebhook(event);
    expect(result.handled).toBe(false);
    expect(await getOrder("sub_1")).toBeUndefined();
  });

  // -- entitlement ---------------------------------------------------------
  it("entitled customer gets a signed download url with disclosure + license", async () => {
    await createRelease(RELEASE);
    await createTrack(TRACK);
    await createProduct(PRODUCT);
    const order: Order = {
      id: "ord_ent_1",
      customer: "cus_ent",
      productId: "prod-test",
      amount: 700,
      currency: "USD",
      status: "paid",
      createdAt: "2026-06-20T00:00:00.000Z",
    };
    await recordOrder(order);

    expect(await hasEntitlement("cus_ent", "prod-test")).toBe(true);

    const grant = await mintDownloadUrl("ord_ent_1", "trk-test", undefined, fakeSigner);
    expect(grant.url).toContain("masters/test/track.wav");
    expect(grant.aiGenerated).toBe(true);
    expect(grant.disclosure).toMatch(/ai-generated/i);
    expect(grant.license).toBe(PERSONAL_LICENSE_PLACEHOLDER);
  });

  it("not-entitled customer has no entitlement and minting unpaid order throws", async () => {
    await createRelease(RELEASE);
    await createTrack(TRACK);
    await createProduct(PRODUCT);
    expect(await hasEntitlement("cus_nope", "prod-test")).toBe(false);

    const pending: Order = {
      id: "ord_pending",
      customer: "cus_p",
      productId: "prod-test",
      amount: 700,
      currency: "USD",
      status: "pending",
      createdAt: "2026-06-20T00:00:00.000Z",
    };
    await recordOrder(pending);
    await expect(
      mintDownloadUrl("ord_pending", "trk-test", undefined, fakeSigner),
    ).rejects.toThrow(/not paid/i);
  });
});
