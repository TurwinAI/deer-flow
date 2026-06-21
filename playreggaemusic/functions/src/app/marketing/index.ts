/**
 * Marketing domain barrel (P2B07, F5) — campaign planner + channel adapters +
 * deterministic copy + scheduling + agent tools.
 *
 * Application layer: MAY import harness/* and app/*. The harness never imports
 * this layer (boundary test).
 */
export * from "./channels";
export * from "./campaign";
export * from "./copy";
export * from "./scheduling";
export * from "./tools";
