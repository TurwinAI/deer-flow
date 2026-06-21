/**
 * Publishing domain barrel (P2B06, F8/F9) — works registry + PRO/MLC affiliation
 * + sync catalog/licensing.
 *
 * Application layer: MAY import harness/* and app/*. The harness never imports
 * this layer (boundary test).
 */
export * from "./works";
export * from "./pro";
export * from "./sync";
export * from "./tools";
