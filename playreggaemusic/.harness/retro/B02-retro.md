# B02 Retrospective — Agent runtime core

- **Batch:** B02 · **Date:** 2026-06-20 · **Outcome:** VERIFIED

## What was attempted
Stand up the DeerFlow-equivalent agent runtime: a LangGraph.js lead-agent graph implementing a real tool-calling loop, a Claude model factory over `@langchain/anthropic`, an env-overridable config loader, the thread-state schema + base system prompt, and a built-in tool wired end-to-end.

## What was verified
All 8 gates green (web + functions). The tool-calling loop was independently proven to execute a real tool through LangGraph's `ToolNode` and terminate on the final answer. The model factory constructs the configured Claude model with no live call. The harness↛app firewall held and its breaker was re-proven on an injected violation.

## What failed / surprised
- **zod 3.25 TS2589 blowup:** `DynamicStructuredTool` + zod 3.25 triggered "Type instantiation is excessively deep" during typecheck. Resolved by pinning `zod` to exact `3.23.8` (the known inference-safe version). Surprise: the langchain peer range advertises `^3.25 || ^4`, but that range is what breaks TS inference — the older pin is the correct mitigation.
- **ChatAnthropic constructor requires a key:** even constructing (not invoking) throws "Anthropic API key not found" on an empty key. Fixed the test by setting a dummy `ANTHROPIC_API_KEY` in `beforeAll` (model never invoked).

## Failure-taxonomy note
Both issues were **dependency/type-system friction**, not logic defects — expected when first wiring a TS LLM stack. Neither was hidden: the zod pin is documented and exact; the test honestly sets a dummy key and never makes a network call.

## Structural fixes proposed (capability, not blame)
1. Add a short "known pins" note to the functions README (zod 3.23.8 rationale) so later batches don't unpin it chasing a newer zod.
2. Provide a shared test helper for "dummy ANTHROPIC_API_KEY" so every model-touching test sets it consistently (B06 autonomy tests will need it).
3. Reconcile the functions Node engine (20 vs runner 22) before deploy to clear the warning from gate evidence.

## Advance decision
Autorun proceeds to B03 (persistence + memory). The emulator gate is now RUNNABLE (firebase-tools 15.22.0 + Java 21), clearing B01/B02's BLOCKED carry-forward for the persistence/rules gates.
