/**
 * Middleware chain (pragmatic subset of DeerFlow's). Implemented in B02+:
 * error-handling, title, memory-queue, uploads. Sandbox/guardrail/MCP
 * middlewares are deferred (out of v1 scope).
 */
export interface Middleware {
  readonly name: string;
}
