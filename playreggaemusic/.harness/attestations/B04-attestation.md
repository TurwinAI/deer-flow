# B04 Attestation — SKILL.md skills system

- **Batch:** B04
- **Status:** VERIFIED-WITH-NOTES
- **Date:** 2026-06-20
- **Branch:** `claude/prm-build-2026-trigger-r91u1m`
- **Builder:** build-role subagent + orchestrator gate re-run
- **Verifier:** independent agent (did NOT build B04) — separation of powers per manifest §8
- **Approver:** operator (owner) — release withheld for final acceptance gate; no self-release
- **Artifact hashes:** `B04-sha256.txt` (66 files). Aggregate SHA256: `17013838a5b56ce0ee0e0e971c1236a06f2ed65575ad652ed47e7b9ce14b8638`

## Scope delivered (manifest §6, B04)
SKILL.md parser (gray-matter YAML frontmatter, `allowed-tools`→`allowedTools`, body preserved, throws on missing name/description/malformed tools); recursive loader over `skills/{public,custom}` (tolerates missing custom/, `[]` for nonexistent root); `buildSkillsPromptSection` injection; strict `/skill-name task` slash-activation (leading-whitespace/reserved/unknown/disabled rejection); two on-brand seed skills (release-curator, catalog-copywriter). HARNESS_VERSION 0.4.0.

## Gate evidence (fresh, independently re-run; exit codes ground-truthed)

| # | Gate | Command | Exit | Result | Confidence |
|---|------|---------|------|--------|-----------|
| 1 | fn types | `pnpm typecheck` | 0 | PASS | high |
| 2 | fn lint | `pnpm lint` | 0 | PASS | high |
| 3 | fn test | `pnpm test` (28 pass, 11 emu-skip) | 0 | PASS | high |
| 4 | fn build | `pnpm build` (lib/harness/skills/index.js) | 0 | PASS | high |
| 5 | web types | `pnpm typecheck` | 0 | PASS | high |
| 6 | web lint | `pnpm lint` | 0 | PASS | high |
| 7 | web test | `pnpm test` (2) | 0 | PASS | high |
| 8 | web build | `pnpm build` | 0 | PASS | high |

## Evidence quality (verifier findings)
- **Parser real:** `matter(markdown)` (gray-matter), kebab→camel map, body via `parsed.content`; throws on missing name/description/malformed allowed-tools — all asserted in tests.
- **Loader real:** reads the actual `playreggaemusic/skills` dir, returns both seed skills (public, enabled), tolerates missing custom/, `[]` for nonexistent root. Seed SKILL.md bodies are real on-brand content (not placeholder).
- **Slash-activation correct:** anchored kebab regex + reserved set + unknown/disabled rejection + task extraction; each case tested.
- **Type-safe:** no `any`/eslint-disable/@ts-ignore; gray-matter output validated via type guards over `Record<string, unknown>`.
- **No scope creep:** only skills + version-bump + gray-matter dep touched; no Polar/catalog-tools/admin/memory changes.

## Notes (non-blocking, honest deviations from DeerFlow)
1. Prompt section uses `- /<name>: <description>` lines rather than DeerFlow's XML `<skill>` block — cosmetic, in scope.
2. Loader defaults `enabled: true`; real enable-state from an extensions config is deferred. **Forward-looking gap to track** (wire enable-state when an extensions-config layer is added).

## What failed / was skipped
Nothing failed. Emulator tests (11) skipped without emulator as designed (re-confirmed runnable in B03).

## Verifier verdict (verbatim)
"**Verdict: VERIFIED-WITH-NOTES** … All 8 gates pass with fresh reproduced evidence … Parser, loader, slash-activation, and seed skills are genuine and well-tested; no unsafe type escapes; no scope creep … The `enabled` default is the only forward-looking gap worth tracking."

## Disposition
B04 VERIFIED-WITH-NOTES. Autorun advances to B05 (label data model + catalog tools + seed Roots Untold; emulator-backed rules + tool tests).
