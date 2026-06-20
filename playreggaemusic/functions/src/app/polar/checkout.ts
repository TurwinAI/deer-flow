/**
 * Checkout creation (B06). Looks up a Firestore product, then asks the injected
 * `PolarClient` to create a checkout and returns the hosted checkout URL.
 *
 * The Polar client is injected (FakePolarClient in tests), so this is fully
 * exercisable against the Firestore emulator with no live Polar calls.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getProduct } from "../label/store";
import type { CheckoutResult, PolarClient } from "./client";

/** Default redirect the buyer lands on after a successful checkout. */
export const DEFAULT_SUCCESS_URL = "https://playreggaemusic.ai/thank-you";

/**
 * Create a checkout for a Firestore product id.
 *
 * Resolves the local product (to map our id -> the Polar product id and to fail
 * fast on unknown / not-yet-published products), then delegates to the injected
 * client. The local product id is mirrored into checkout metadata so the
 * webhook can record the order against the right catalog product.
 */
export async function createCheckoutForProduct(
  productId: string,
  client: PolarClient,
  db?: Firestore,
): Promise<CheckoutResult> {
  const product = await getProduct(productId, db);
  if (!product) {
    throw new Error(`Unknown product: ${productId}`);
  }
  if (!product.polarProductId) {
    throw new Error(
      `Product ${productId} has no polarProductId — create it in Polar before selling.`,
    );
  }
  return client.createCheckout({
    productId: product.polarProductId,
    priceId: product.polarPriceId,
    successUrl: DEFAULT_SUCCESS_URL,
    metadata: { productId },
  });
}
