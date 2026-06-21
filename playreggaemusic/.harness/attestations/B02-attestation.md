# B02 Attestation — Agent runtime core

- **Batch:** B02
- **Status:** VERIFIED
- **Date:** 2026-06-20
- **Branch:** `claude/prm-build-2026-trigger-r91u1m`
- **Builder:** build role
- **Verifier:** independent agent (did NOT build B02) — separation of powers per manifest §8
- **Approver:** operator (owner) — release withheld for the final acceptance gate; no self-release
- **Artifact hashes:** `B02-sha256.txt` (51 files). Aggregate SHA256: `6afe69c569fdfc8671e874f2f3b75f0eed8706e7d5c33fed45ec0f79501ca135`

## Scope delivered (manifest §6, B02)
LangGraph.js lead-agent graph (tool-calling loop: agent → conditional → ToolNode → agent); Claude model factory over `@langchain/anthropic` (env-keyed, never invoked in gates); env-overridable config loader; thread-state schema + base system prompt; built-in `echo` tool wired through the loop.

## Gate evidence (fresh, independently re-run; exit codes ground-truthed)

| # | Gate | Command | Exit | Result | Confidence |
|---|------|---------|------|--------|-----------|
| 1 | web types | `pnpm typecheck` | 0 | PASS | high |
| 2 | web lint | `pnpm lint` | 0 | PASS | high |
| 3 | web test | `pnpm test` (2) | 0 | PASS | high |
| 4 | web build | `pnpm build` | 0 | PASS | high |
| 5 | fn types | `pnpm typecheck` | 0 | PASS | high |
| 6 | fn lint | `pnpm lint` | 0 | PASS | high |
| 7 | fn test | `pnpm test` (10: boundary 2, models 4, runtime 2, smoke 2) | 0 | PASS | high |
| 8 | fn build | `pnpm build` (`lib/harness/{runtime,models,config,tools}/index.js`) | 0 | PASS | high |

No BLOCKED gates this batch.

## Evidence quality (verifier findings)
- **Loop genuinely exercised:** `echo:irie` is produced by executing the tool via `ToolNode`, not a literal in the test; termination verified two ways (final answer + 2-message no-tool path).
- **No live LLM call:** factory only constructs `ChatAnthropic` with a dummy key; never `.invoke()`d. Default id `claude-opus-4-8` and test ids `claude-haiku-4-5-20251001`/`claude-sonnet-4-6` verified valid against the claude-api reference.
- **Boundary breaker proven:** verifier injected `import … from "../../app/label"` into `harness/tools`, boundary test FAILED naming the offender, then reverted byte-exact (SHA256 identical).
- **Honesty scan clean:** no scope creep (persistence/skills/memory/Polar remain stubs), no `any`-casts, no `eslint-disable`. zod pin `3.23.8` is a legitimate TS2589 mitigation, pinned exact.

## What failed / was skipped
Nothing. (Note: functions package declares Node 20 vs runner Node 22 → benign engine warning; reconcile before deploy. Lockfile still resolves a transitive `zod@3.25.76` for langchain internals; project graph typechecks clean.)

## Verifier verdict (verbatim)
"**Overall verdict: VERIFIED** … All eight gates reproduce GREEN … the runtime test genuinely drives the LangGraph tool-calling loop … no fabricated coverage, no RED-as-GREEN, no scope creep … the zod 3.23.8 pin is a legitimate fix … Evidence quality is high."

## Disposition
B02 VERIFIED. Autorun advances to B03 (persistence + memory). `firebase-tools 15.22.0` now installed + Java 21 present → the previously-BLOCKED Firestore-emulator gate is RUNNABLE for B03.
