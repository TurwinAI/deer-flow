/**
 * Model factory. Mirrors DeerFlow's `deerflow/models`.
 * Instantiates a Claude chat model via `@langchain/anthropic`. The API key is
 * read from the environment (never committed); it is not required to construct
 * the model, only to invoke it — so unit gates mock invocation.
 */
import { ChatAnthropic } from "@langchain/anthropic";
import { DEFAULT_HARNESS_CONFIG, type HarnessConfig } from "../config";

export function createChatModel(
  config: HarnessConfig = DEFAULT_HARNESS_CONFIG,
): ChatAnthropic {
  return new ChatAnthropic({
    model: config.defaultModel,
    maxTokens: config.maxTokens,
    temperature: 0,
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });
}
