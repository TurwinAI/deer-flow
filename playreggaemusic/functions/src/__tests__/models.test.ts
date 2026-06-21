import { ChatAnthropic } from "@langchain/anthropic";
import { beforeAll, describe, expect, it } from "vitest";
import { createChatModel } from "../harness/models";
import { DEFAULT_HARNESS_CONFIG, loadConfig } from "../harness/config";

describe("model factory (B02)", () => {
  // The factory reads the key from env; a dummy is enough to construct (the
  // model is never invoked in unit gates — no live LLM call).
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  });

  it("constructs a Claude chat model from the default config", () => {
    const model = createChatModel();
    expect(model).toBeInstanceOf(ChatAnthropic);
    expect(String(model.model)).toContain("claude");
  });

  it("honors a configured model id", () => {
    const model = createChatModel({
      ...DEFAULT_HARNESS_CONFIG,
      defaultModel: "claude-haiku-4-5-20251001",
    });
    expect(model.model).toBe("claude-haiku-4-5-20251001");
  });
});

describe("config loader (B02)", () => {
  it("returns defaults with an empty environment", () => {
    expect(loadConfig({})).toEqual(DEFAULT_HARNESS_CONFIG);
  });

  it("applies environment overrides and ignores non-numeric values", () => {
    const cfg = loadConfig({
      PRM_DEFAULT_MODEL: "claude-sonnet-4-6",
      PRM_MAX_TURNS: "32",
      PRM_MAX_TOKENS: "not-a-number",
      PRM_MEMORY_ENABLED: "false",
    });
    expect(cfg.defaultModel).toBe("claude-sonnet-4-6");
    expect(cfg.maxTurns).toBe(32);
    expect(cfg.maxTokens).toBe(DEFAULT_HARNESS_CONFIG.maxTokens);
    expect(cfg.memoryEnabled).toBe(false);
  });
});
