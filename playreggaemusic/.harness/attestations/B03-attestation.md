# B03 Attestation — Persistence + memory

- **Batch:** B03
- **Status:** VERIFIED
- **Date:** 2026-06-20
- **Branch:** `claude/prm-build-2026-trigger-r91u1m`
- **Builder:** build role (build-role subagent under orchestrator) + orchestrator gate re-run
- **Verifier:** independent agent (did NOT build B03) — separation of powers per manifest §8
- **Approver:** operator (owner) — release withheld for final acceptance gate; no self-release
- **Artifact hashes:** `B03-sha256.txt` (60 files). Aggregate SHA256: `5b16a7575cc9255990cda990f3476256c7e9aeaf12ad9f595e24373fca2aed72`

## Scope delivered (manifest §6, B03)
Firestore-backed LangGraph checkpointer (`FirestoreCheckpointSaver extends BaseCheckpointSaver`); thread store (`threads/` CRUD); per-user memory (Firestore facts + `<memory>` injection + deterministic `extractFacts` stub); engine-collection security rules (threads/checkpoints/checkpoint_writes/memory denied to clients; admin SDK bypasses); optional `checkpointer` wired into the lead-agent graph.

## Gate evidence (fresh, independently re-run; exit codes ground-truthed)

| # | Gate | Command | Exit | Result | Confidence |
|---|------|---------|------|--------|-----------|
| 1 | fn types | `pnpm typecheck` | 0 | PASS | high |
| 2 | fn lint | `pnpm lint` | 0 | PASS | high |
| 3 | fn test (no emu) | `pnpm test` (10 pass, 11 skip) | 0 | PASS | high |
| 4 | fn rules/persistence (emulator) | `pnpm test:emulator` (21 pass) | 0 | **PASS** | high |
| 5 | fn build | `pnpm build` (lib/persistence/*) | 0 | PASS | high |
| 6 | web types | `pnpm typecheck` | 0 | PASS | high |
| 7 | web lint | `pnpm lint` | 0 | PASS | high |
| 8 | web test | `pnpm test` (2) | 0 | PASS | high |
| 9 | web build | `pnpm build` | 0 | PASS | high |

The previously-BLOCKED emulator gate is now RUNNABLE and GREEN (firebase-tools 15.22.0 + Java 21).

## Evidence quality (verifier findings)
- **Checkpointer real:** backs `checkpoints`/`checkpoint_writes` via admin SDK; `put` serializes via `serde.dumpsTyped`→base64, `getTuple` reconstructs `channel_values`/`id` via `serde.loadsTyped`. Round-trip asserts id + channel_values; integration test compiles the real lead-agent graph WITH the saver and the persisted checkpoint contains the run's messages.
- **Boundary change = correctness fix (proven):** verifier injected `../../app/label` → boundary test FAILED naming offender; reverted byte-exact → PASS. New heuristic correctly ignores `firebase-admin/app` while still catching real `../../app` violations. Not a weakening.
- **Rules tests genuine:** load the real `firestore.rules`; assert public read catalog, deny public write, deny client reads of threads/memory/checkpoints (emulator logged PERMISSION_DENIED).
- **No-emulator safety genuine:** emulator tests `describe.skipIf(!FIRESTORE_EMULATOR_HOST)` → 11 real skips without emulator, 11 run+pass under it.
- **Honesty/scope clean:** no `any`/eslint-disable/@ts-ignore; deterministic memory stub (no LLM); HARNESS_VERSION 0.3.0; no Polar/skills-activation/admin/catalog-tools (no scope creep).

## What failed / was skipped
Nothing failed. Documented limitation: **`pending_sends: []` not persisted** — the sole MemorySaver-semantics deviation, acceptable for the single-graph loop (no Send fan-out), flagged in-code. Must be revisited if subagent fan-out is added (out of pragmatic-core scope).

## Verifier verdict (verbatim)
"**Overall Verdict: VERIFIED** … All 9 gates pass with fresh, reproduced evidence including emulator-backed persistence and rules tests … the boundary-test change was empirically proven to be a correctness fix … not a weakening. No `any`/eslint-disable … no scope creep."

## Disposition
B03 VERIFIED. Autorun advances to B04 (SKILL.md skills system). Emulator carry-forward from B01/B02 is now cleared (gate GREEN).
