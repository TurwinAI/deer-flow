/**
 * Polar webhook signature verification (B06) — OFFLINE unit gate. Pure crypto,
 * no network, no emulator. Asserts a valid Standard Webhooks signature
 * verifies, a tampered payload/signature fails, the `v1,` prefix and multiple
 * space-separated signatures are tolerated, and missing headers fail closed.
 */
import { describe, expect, it } from "vitest";
import {
  computeWebhookSignature,
  verifyWebhookSignature,
  type WebhookHeaders,
} from "../app/polar/webhook";

const SECRET = "whsec_c2VjcmV0LXRlc3Qta2V5LWZvci13ZWJob29rcw==";
const ID = "msg_abc123";
const TIMESTAMP = "1718841600";
const PAYLOAD = JSON.stringify({ type: "order.paid", data: { id: "ord_1" } });

function signedHeaders(payload = PAYLOAD): WebhookHeaders {
  const sig = computeWebhookSignature(ID, TIMESTAMP, payload, SECRET);
  return {
    "webhook-id": ID,
    "webhook-timestamp": TIMESTAMP,
    "webhook-signature": `v1,${sig}`,
  };
}

describe("verifyWebhookSignature (Standard Webhooks)", () => {
  it("verifies a VALID signature", () => {
    expect(verifyWebhookSignature(PAYLOAD, signedHeaders(), SECRET)).toBe(true);
  });

  it("rejects a TAMPERED payload", () => {
    const headers = signedHeaders(); // signature was over the original PAYLOAD
    const tampered = JSON.stringify({ type: "order.paid", data: { id: "ord_HACKED" } });
    expect(verifyWebhookSignature(tampered, headers, SECRET)).toBe(false);
  });

  it("rejects a TAMPERED signature", () => {
    const headers = signedHeaders();
    headers["webhook-signature"] = "v1,not-the-real-signature-AAAA";
    expect(verifyWebhookSignature(PAYLOAD, headers, SECRET)).toBe(false);
  });

  it("tolerates the v1, prefix and MULTIPLE space-separated signatures", () => {
    const good = computeWebhookSignature(ID, TIMESTAMP, PAYLOAD, SECRET);
    const headers: WebhookHeaders = {
      "webhook-id": ID,
      "webhook-timestamp": TIMESTAMP,
      "webhook-signature": `v1,AAAAwrongsigAAAA v1,${good}`,
    };
    expect(verifyWebhookSignature(PAYLOAD, headers, SECRET)).toBe(true);
  });

  it("fails closed when headers are missing", () => {
    expect(verifyWebhookSignature(PAYLOAD, {}, SECRET)).toBe(false);
    expect(
      verifyWebhookSignature(PAYLOAD, { "webhook-id": ID }, SECRET),
    ).toBe(false);
  });

  it("rejects when the wrong secret is used", () => {
    expect(
      verifyWebhookSignature(PAYLOAD, signedHeaders(), "whsec_d3Jvbmctc2VjcmV0"),
    ).toBe(false);
  });
});
