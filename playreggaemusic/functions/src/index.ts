/**
 * Cloud Functions entry point.
 *
 * - `health`     : reports the harness version (B01).
 * - `createCheckout` (callable): creates a Polar checkout for a product (B06).
 * - `polarWebhook` (onRequest): verifies the Standard Webhooks signature, then
 *   records paid orders + grants entitlement (B06).
 *
 * TEST MODE: these endpoints are kept thin and are NOT exercised by the unit /
 * emulator gates (which test the underlying app/* functions directly with a
 * FakePolarClient). The real `PolarSdkClient` only reaches out when an operator
 * has supplied POLAR_ACCESS_TOKEN at handoff (manifest §9 approval gate).
 */
import { onRequest } from "firebase-functions/v2/https";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { gatewayInfo } from "./app";
import { PolarSdkClient } from "./app/polar/client";
import { createCheckoutForProduct } from "./app/polar/checkout";
import {
  handlePolarWebhook,
  verifyWebhookSignature,
  type PolarWebhookEvent,
  type WebhookHeaders,
} from "./app/polar/webhook";

export const health = onRequest((_req, res) => {
  res.json({ ok: true, ...gatewayInfo() });
});

/** Callable: { productId } -> { checkoutUrl, checkoutId }. */
export const createCheckout = onCall(async (request) => {
  const productId = (request.data as { productId?: unknown })?.productId;
  if (typeof productId !== "string" || productId.length === 0) {
    throw new HttpsError("invalid-argument", "productId is required");
  }
  const client = new PolarSdkClient();
  const result = await createCheckoutForProduct(productId, client);
  return { checkoutUrl: result.checkoutUrl, checkoutId: result.checkoutId };
});

/** Webhook receiver: verify signature, then handle. */
export const polarWebhook = onRequest(async (req, res) => {
  const secret = process.env.POLAR_WEBHOOK_SECRET ?? "";
  // Standard Webhooks requires the EXACT raw bytes that were signed.
  const rawBody: string =
    typeof (req as { rawBody?: unknown }).rawBody === "object" &&
    (req as { rawBody?: Buffer }).rawBody instanceof Buffer
      ? (req as { rawBody: Buffer }).rawBody.toString("utf8")
      : JSON.stringify(req.body);

  const headers: WebhookHeaders = {
    "webhook-id": req.header("webhook-id") ?? undefined,
    "webhook-timestamp": req.header("webhook-timestamp") ?? undefined,
    "webhook-signature": req.header("webhook-signature") ?? undefined,
  };

  if (!verifyWebhookSignature(rawBody, headers, secret)) {
    res.status(401).json({ error: "invalid signature" });
    return;
  }

  const event = JSON.parse(rawBody) as PolarWebhookEvent;
  const result = await handlePolarWebhook(event);
  res.status(200).json({ handled: result.handled });
});
