/**
 * Polar webhook handling (B06). Polar signs webhooks with the Standard Webhooks
 * scheme (https://www.standardwebhooks.com): the signed content is
 * `${id}.${timestamp}.${payload}`, HMAC-SHA256 with the (base64) secret, output
 * base64. The `webhook-signature` header carries one or more space-separated
 * signatures, each prefixed `v1,`. Verification uses a constant-time compare.
 *
 * `handlePolarWebhook` records paid orders into Firestore via the label store
 * and grants the personal-listening entitlement. Signature verification is a
 * pure function so it is unit-testable with no network; order recording runs
 * against the Firestore emulator.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { recordOrder } from "../label/store";
import type { Order, OrderStatus } from "../label/index";

/** The three Standard Webhooks headers we read (lowercased by most runtimes). */
export interface WebhookHeaders {
  "webhook-id"?: string;
  "webhook-timestamp"?: string;
  "webhook-signature"?: string;
}

/**
 * Polar's `whsec_`-prefixed secrets are base64. Standard Webhooks HMACs against
 * the DECODED secret bytes. If the secret carries the prefix, strip it; then
 * base64-decode. A plain (non-base64) secret is used as raw UTF-8 bytes.
 */
function secretToKey(secret: string): Buffer {
  const stripped = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  // Standard Webhooks secrets are base64; fall back to utf8 for plain secrets.
  const decoded = Buffer.from(stripped, "base64");
  return decoded.length > 0 ? decoded : Buffer.from(stripped, "utf8");
}

/** Compute the base64 HMAC-SHA256 over the signed content for a given secret. */
export function computeWebhookSignature(
  id: string,
  timestamp: string,
  payload: string,
  secret: string,
): string {
  const signedContent = `${id}.${timestamp}.${payload}`;
  return createHmac("sha256", secretToKey(secret)).update(signedContent).digest("base64");
}

/** Constant-time string compare that never short-circuits on length. */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Compare against itself to keep the timing profile flat, then fail.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify a Standard Webhooks signature.
 *
 * Tolerates the `v1,` version prefix and MULTIPLE space-separated signatures in
 * the header (any one matching passes). Returns false on missing headers rather
 * than throwing, so endpoints can map it to a 400/401 cleanly.
 */
export function verifyWebhookSignature(
  payload: string,
  headers: WebhookHeaders,
  secret: string,
): boolean {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatureHeader = headers["webhook-signature"];
  if (!id || !timestamp || !signatureHeader) {
    return false;
  }
  const expected = computeWebhookSignature(id, timestamp, payload, secret);
  // The header may list several signatures separated by spaces, each "v1,<sig>".
  for (const entry of signatureHeader.split(" ")) {
    if (!entry) continue;
    const comma = entry.indexOf(",");
    const candidate = comma === -1 ? entry : entry.slice(comma + 1);
    if (constantTimeEquals(candidate, expected)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

/**
 * Minimal shape of the Polar event envelope we consume. Polar emits
 * `order.paid` / `order.created` / `checkout.updated` etc.; we act only on the
 * "paid" transitions. The `data` payload mirrors a Polar order.
 */
export interface PolarWebhookEvent {
  type: string;
  data: {
    id?: string;
    /** Polar customer id or our mirrored customer reference. */
    customer_id?: string;
    /** Amount in minor units (cents). */
    amount?: number;
    currency?: string;
    status?: string;
    metadata?: { productId?: string } & Record<string, string>;
    /** Some events carry the product id directly. */
    product_id?: string;
  };
}

/** Outcome of handling an event: whether an order was recorded, and which. */
export interface WebhookHandleResult {
  handled: boolean;
  order?: Order;
  reason?: string;
}

/** Event types that represent a completed (paid) purchase. */
const PAID_EVENT_TYPES: ReadonlySet<string> = new Set([
  "order.paid",
  "order.created",
  "checkout.updated",
]);

function isPaid(event: PolarWebhookEvent): boolean {
  if (event.type === "order.paid") return true;
  // For order.created / checkout.updated, require an explicit paid status.
  return PAID_EVENT_TYPES.has(event.type) && event.data.status === "paid";
}

/**
 * Handle a verified Polar webhook event. On a paid order it records the order
 * mirror in Firestore (granting the personal-listening entitlement, since
 * entitlement is derived from a paid order — see entitlement.ts). Non-paid /
 * unrelated events are ignored (handled: false) so the endpoint can ack with
 * 200 without side effects.
 */
export async function handlePolarWebhook(
  event: PolarWebhookEvent,
  db?: Firestore,
): Promise<WebhookHandleResult> {
  if (!isPaid(event)) {
    return { handled: false, reason: `ignored event type ${event.type}` };
  }
  const data = event.data;
  const productId = data.metadata?.productId ?? data.product_id;
  if (!data.id || !productId) {
    return { handled: false, reason: "paid event missing order id or productId" };
  }
  const order: Order = {
    id: data.id,
    customer: data.customer_id ?? "unknown",
    productId,
    amount: data.amount ?? 0,
    currency: data.currency ?? "USD",
    status: "paid" satisfies OrderStatus,
    createdAt: new Date().toISOString(),
  };
  await recordOrder(order, db);
  return { handled: true, order };
}
