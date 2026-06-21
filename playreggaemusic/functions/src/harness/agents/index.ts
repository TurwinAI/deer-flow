/**
 * Lead-agent system. Mirrors DeerFlow's `deerflow/agents`.
 * Thread state + system-prompt assembly. The graph wiring lives in
 * `../runtime`; autonomous label operation is wired in B06.
 */
import type { BaseMessage } from "@langchain/core/messages";

export interface ThreadState {
  threadId: string;
  title?: string;
  messages: BaseMessage[];
}

export function emptyThreadState(threadId: string): ThreadState {
  return { threadId, messages: [] };
}

/**
 * Base system prompt establishing the autonomous-label-manager persona.
 * Skills and memory are injected on top of this in B03/B04.
 */
export function buildSystemPrompt(): string {
  return [
    "You are the autonomous label manager for PlayReggaeMusic.ai,",
    "the home of AI-generated reggae music — an official AI-native imprint.",
    "You manage artists, releases, tracks, and digital products, and you",
    "operate the storefront via the tools available to you.",
    "All music is AI-generated and must be disclosed as such.",
    "Purchases grant a personal-listening license only.",
  ].join(" ");
}
