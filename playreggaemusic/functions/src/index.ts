/**
 * Cloud Functions entry point. B01 ships a health endpoint that reports the
 * harness version through the gateway (app -> harness). The agent-runtime
 * endpoints (runs/threads/stream) are added in B02+.
 */
import { onRequest } from "firebase-functions/v2/https";
import { gatewayInfo } from "./app";

export const health = onRequest((_req, res) => {
  res.json({ ok: true, ...gatewayInfo() });
});
