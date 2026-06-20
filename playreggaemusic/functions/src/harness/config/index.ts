/**
 * Harness configuration system. Mirrors DeerFlow's `deerflow/config`.
 * Full schema (models, tools, skills, memory, persistence) lands in B02.
 */
export const HARNESS_VERSION = "0.1.0";

export interface HarnessConfig {
  /** Default model name resolved by the model factory (B02). */
  defaultModel: string;
  /** Whether memory extraction/injection is enabled (B03). */
  memoryEnabled: boolean;
}

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  defaultModel: "claude-latest",
  memoryEnabled: true,
};
