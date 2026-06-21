/**
 * Checkout client (B06). Invokes the `createCheckout` callable Cloud Function
 * and returns the hosted Polar checkout URL. Kept in its own module so the
 * Release page can mock it in tests (no live Functions/Polar call).
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp } from "./firebase";
import { fixturesEnabled } from "./fixtures";

export interface CheckoutResponse {
  checkoutUrl: string;
  checkoutId: string;
}

/**
 * Create a checkout for a product id and return the hosted checkout URL.
 *
 * In fixtures mode (`VITE_USE_FIXTURES === "1"`) this returns a canned local
 * confirmation URL and makes NO call to Functions/Polar, so the offline E2E
 * flow can assert a confirmation without any live payment integration.
 */
export async function createCheckout(productId: string): Promise<CheckoutResponse> {
  if (fixturesEnabled()) {
    return {
      checkoutUrl: `/checkout-confirmation?product=${encodeURIComponent(productId)}`,
      checkoutId: `fixture-checkout-${productId}`,
    };
  }
  const fns = getFunctions(getFirebaseApp());
  const callable = httpsCallable<{ productId: string }, CheckoutResponse>(fns, "createCheckout");
  const result = await callable({ productId });
  return result.data;
}
