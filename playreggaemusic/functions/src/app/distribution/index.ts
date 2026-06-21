/**
 * Distribution domain barrel (P2B03, F4) — DSP delivery via DDEX.
 *
 * Application layer: MAY import harness/* and app/*. The harness never imports
 * this layer (boundary test).
 */
export * from "./ddex";
export * from "./client";
export * from "./store";
export * from "./release";
export * from "./tools";
