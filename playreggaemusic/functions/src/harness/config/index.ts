/**
 * Harness configuration system. Mirrors DeerFlow's `deerflow/config`.
 * Values are env-overridable; the default model id is operator-configurable
 * and confirmed against the claude-api reference at deploy time.
 */
export const HARNESS_VERSION = "0.2.0";

export interface HarnessConfig {
  /** Default Claude model id resolved by the model factory. */
  defaultModel: string;
  /** Max output tokens per model call. */
  maxTokens: number;
  /** Hard cap on agent loop turns (tool-call rounds) to bound runaway loops. */
  maxTurns: number;
  /** Whether memory extraction/injection is enabled (B03). */
  memoryEnabled: boolean;
}

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  defaultModel: "claude-opus-4-8",
  maxTokens: 4096,
  maxTurns: 16,
  memoryEnabled: true,
};

type EnvLike = Record<string, string | undefined>;

/** Resolve config from environment overrides, falling back to defaults. */
export function loadConfig(env: EnvLike = process.env): HarnessConfig {
  return {
    defaultModel: env.PRM_DEFAULT_MODEL ?? DEFAULT_HARNESS_CONFIG.defaultModel,
    maxTokens: numberFrom(env.PRM_MAX_TOKENS, DEFAULT_HARNESS_CONFIG.maxTokens),
    maxTurns: numberFrom(env.PRM_MAX_TURNS, DEFAULT_HARNESS_CONFIG.maxTurns),
    memoryEnabled: (env.PRM_MEMORY_ENABLED ?? "true") !== "false",
  };
}

function numberFrom(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
