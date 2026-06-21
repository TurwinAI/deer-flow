/**
 * Finance domain barrel (P2B05, F7) — royalty + recoupment + statements +
 * payout proposals.
 *
 * Application layer: MAY import harness/* and app/*. The harness never imports
 * this layer (boundary test).
 */
export * from "./revenue";
export * from "./recoupment";
export * from "./royalty";
export * from "./statements";
export * from "./payout";
export * from "./tools";
