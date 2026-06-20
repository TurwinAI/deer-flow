/**
 * Model factory. Mirrors DeerFlow's `deerflow/models`.
 * `createChatModel(name)` over `@langchain/anthropic` (Claude default) lands in
 * B02; the exact Claude model id is pinned in config there, verified against
 * the claude-api reference. API key via secret/env; mocked in unit gates.
 */
export interface ModelHandle {
  name: string;
  supportsVision: boolean;
}
