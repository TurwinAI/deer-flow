/**
 * Checkout client (B06). Invokes the `createCheckout` callable Cloud Function
 * and returns the hosted Polar checkout URL. Kept in its own module so the
 * Release page can mock it in tests (no live Functions/Polar call).
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp } from "./firebase";

export interface CheckoutResponse {
  checkoutUrl: string;
  checkoutId: string;
}

/** Create a checkout for a product id and return the hosted checkout URL. */
export async function createCheckout(productId: string): Promise<CheckoutResponse> {
  const fns = getFunctions(getFirebaseApp());
  const callable = httpsCallable<{ productId: string }, CheckoutResponse>(fns, "createCheckout");
  const result = await callable({ productId });
  return result.data;
}
