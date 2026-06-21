/**
 * Download entitlement (B06). A customer is entitled to download a product's
 * track masters once they have a PAID order for that product. `mintDownloadUrl`
 * verifies entitlement, then returns a time-limited signed URL to the track
 * master via an INJECTABLE `signer` so tests need no real GCS bucket.
 *
 * Every minted download carries the AI-generated disclosure and the personal-
 * listening-license note (manifest §8.2 / §8.4).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getOrder, getTrackMaster, listOrders, listTracksByRelease } from "../label/store";
import { getProduct } from "../label/store";
import type { Order } from "../label/index";

/**
 * PLACEHOLDER license string — NOT binding wording. The label owner must supply
 * the final, legally reviewed personal-listening license text before go-live.
 * Used as user-facing copy on downloads/entitlements until then.
 */
export const PERSONAL_LICENSE_PLACEHOLDER =
  "[PLACEHOLDER LICENSE — owner to supply binding wording before go-live] " +
  "Personal-listening license only: this AI-generated recording is licensed to " +
  "you for personal, non-commercial listening. No redistribution, public " +
  "performance, broadcast, or commercial use is granted.";

/** Short AI-generated disclosure included with every download (manifest §8.4). */
export const AI_GENERATED_DISCLOSURE =
  "AI-generated: this recording was produced with artificial intelligence.";

/** A function that turns a Storage object path into a time-limited signed URL. */
export type DownloadSigner = (
  masterPath: string,
  expiresAtMs: number,
) => Promise<string>;

/** Default signed-URL TTL: 15 minutes. */
export const DEFAULT_DOWNLOAD_TTL_MS = 15 * 60 * 1000;

/**
 * Does this customer have a PAID order for this product?
 *
 * Scans the order mirror. Orders are deterministic-id documents written by the
 * webhook handler; a paid order for (customer, product) grants entitlement.
 */
export async function hasEntitlement(
  customer: string,
  productId: string,
  db?: Firestore,
): Promise<boolean> {
  const orders = await listOrders(db);
  return orders.some(
    (o) => o.customer === customer && o.productId === productId && o.status === "paid",
  );
}

/** The metadata returned alongside a minted download URL. */
export interface DownloadGrant {
  url: string;
  trackId: string;
  expiresAt: string;
  aiGenerated: boolean;
  disclosure: string;
  license: string;
}

/**
 * Default signer: an admin Storage `getSignedUrl`. Imported lazily so tests
 * that inject their own signer never touch firebase-admin/storage and never
 * require a real bucket or credentials.
 */
async function defaultSigner(masterPath: string, expiresAtMs: number): Promise<string> {
  const { getStorage } = await import("firebase-admin/storage");
  const [url] = await getStorage()
    .bucket()
    .file(masterPath)
    .getSignedUrl({ action: "read", expires: expiresAtMs });
  return url;
}

/**
 * Mint a time-limited signed download URL for a track master, but only after
 * verifying the order is PAID and unlocks the track's release.
 *
 * @throws if the order is missing/unpaid, the product/track is unknown, the
 *   track does not belong to the order's product release, or the track has no
 *   master registered in the admin-only track_masters collection.
 */
export async function mintDownloadUrl(
  orderId: string,
  trackId: string,
  db?: Firestore,
  signer: DownloadSigner = defaultSigner,
  ttlMs: number = DEFAULT_DOWNLOAD_TTL_MS,
): Promise<DownloadGrant> {
  const order: Order | undefined = await getOrder(orderId, db);
  if (!order) {
    throw new Error(`Unknown order: ${orderId}`);
  }
  if (order.status !== "paid") {
    throw new Error(`Order ${orderId} is not paid (status: ${order.status}).`);
  }

  const product = await getProduct(order.productId, db);
  if (!product) {
    throw new Error(`Order ${orderId} references unknown product ${order.productId}.`);
  }
  if (!product.releaseId) {
    throw new Error(`Product ${product.id} is not linked to a release.`);
  }

  const tracks = await listTracksByRelease(product.releaseId, db);
  const track = tracks.find((t) => t.id === trackId);
  if (!track) {
    throw new Error(
      `Track ${trackId} is not part of the release unlocked by order ${orderId}.`,
    );
  }

  // The private master path is NOT on the public track doc — fetch it from the
  // admin-only track_masters collection (admin SDK bypasses firestore.rules).
  const master = await getTrackMaster(trackId, db);
  if (!master) {
    throw new Error(`Track ${trackId} has no master registered.`);
  }

  const expiresAtMs = Date.now() + ttlMs;
  const url = await signer(master.masterPath, expiresAtMs);

  return {
    url,
    trackId,
    expiresAt: new Date(expiresAtMs).toISOString(),
    aiGenerated: true,
    disclosure: AI_GENERATED_DISCLOSURE,
    license: PERSONAL_LICENSE_PLACEHOLDER,
  };
}
