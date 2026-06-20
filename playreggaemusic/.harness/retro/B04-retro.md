# B04 Retrospective — SKILL.md skills system

- **Batch:** B04 · **Date:** 2026-06-20 · **Outcome:** VERIFIED-WITH-NOTES

## What was attempted
Port DeerFlow's skills system to TS: a SKILL.md frontmatter parser, a public/custom loader, system-prompt injection, and strict `/skill-name task` slash-activation — plus two real, on-brand seed skills for the label.

## What was verified
8 gates green; 18 new skills tests plus the existing suite (28 pass / 11 emulator-skip). Independent verifier confirmed the parser uses gray-matter (not a regex fake), the loader reads the real skills dir and returns both seeds, slash-activation enforces every rejection rule, and there are no type-safety escapes or scope creep.

## What failed / surprised
- **gray-matter's loose typing** (`data` as a permissive record) tempts an `any`. Avoided by casting once to `Record<string, unknown>` and validating every field through type guards (`asNonEmptyString`, `parseAllowedTools`). Clean lint, no escapes.
- No real failures — the batch is file/string processing with no external deps, so it was low-risk relative to B03.

## Failure-taxonomy note
No defects. Two **deliberate scope simplifications** were recorded honestly rather than silently: (1) prompt-section format is `- /name: desc` not DeerFlow's XML block (cosmetic); (2) loader defaults `enabled: true` because no extensions-config layer exists yet. The second is a genuine forward-looking gap, not a bug.

## Structural fixes proposed (capability, not blame)
1. When an extensions-config layer is introduced, wire skill `enabled` state (and per-agent allow-lists) into `loadSkills`, with a regression test — closes the only tracked B04 gap.
2. Wire `buildSkillsPromptSection` + `resolveSlashActivation` into the lead-agent system-prompt assembly during B06 autonomy wiring (so the agent can actually invoke skills), with an integration test.

## Advance decision
Autorun proceeds to B05 (label data model + Firestore rules + agent catalog-operation tools + seed Roots Untold). Emulator gate is in play again (rules + tool round-trips), already RUNNABLE.
