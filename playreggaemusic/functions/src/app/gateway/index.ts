/**
 * Gateway — HTTP/callable endpoints (runs, threads, models, skills, memory).
 * Mirrors DeerFlow's `app/gateway`. This layer MAY import the harness; the
 * import below demonstrates the allowed direction (app -> harness).
 */
import { HARNESS_VERSION } from "../../harness";

export interface GatewayInfo {
  service: string;
  harnessVersion: string;
}

export function gatewayInfo(): GatewayInfo {
  return { service: "playreggaemusic-gateway", harnessVersion: HARNESS_VERSION };
}
