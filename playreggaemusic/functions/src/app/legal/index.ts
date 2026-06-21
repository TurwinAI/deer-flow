/**
 * Legal/Contracts/Compliance domain (P2B09, F10).
 *
 * Barrel for artist agreements, structured owner-supplied license terms, the
 * pre-distribution compliance gate, and the agent-facing legal tools.
 *
 * Application layer: MAY import harness/* and app/* ; nothing in harness/* may
 * import this layer (boundary test).
 */
export * from "./contracts";
export * from "./license";
export * from "./compliance";
export * from "./tools";
