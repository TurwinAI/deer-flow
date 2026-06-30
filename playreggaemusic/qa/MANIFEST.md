# QA Loop Manifest — Feature → User Story → Test → Fix → Retest

> Written under the harness constitution: manifest before motion; build → verify
> → attest per batch; the role that builds is not the role that verifies.

## Objective

Drive a single canonical feature tracker (`qa/feature-tracker.csv`) through four
phases for every user-facing and agent-facing feature in PlayReggaeMusic.ai:

- **Phase 1 — Author.** For every feature, derive a user story + expected
  behaviour grounded in the actual code (file:line refs). Status → `STORY_DONE`.
- **Phase 2 — Test.** Execute / exercise each user story; document every observed
  error in the tracker. Status → `TEST_PASS` or `TEST_FAIL` (+ error detail).
- **Phase 3 — Fix.** Fix every logistical error (broken wiring, missing export,
  contract mismatch) and UX error surfaced in Phase 2. Status → `FIXED`.
- **Phase 4 — Retest.** Re-exercise every user behaviour post-fix; update status
  to `VERIFIED` or re-open as `TEST_FAIL`.

## Inputs

- Source of truth: `functions/src/` (harness + app) and `src/` (React UI).
- Existing automated suites: `pnpm typecheck | lint | test` (vitest) and
  `pnpm test:e2e` (Playwright, fixtures mode).

## Outputs

- `qa/feature-tracker.csv` — the single canonical spreadsheet (one row/feature).
- `qa/user-stories.md` — long-form story + expected-behaviour detail, keyed by
  the tracker's `ID`.
- `qa/phase-log.md` — per-batch attestation: attempted / verified / failed /
  surprised / taxonomy.

## Verification criteria

- Phase 1 complete when every discoverable feature has a row with a non-empty
  user story, expected behaviour, and ≥1 code ref.
- Phase 2 complete when every row has a P2 result backed by external evidence
  (test run output, executed flow, or inspected artifact) — not "looks right".
- Phase 3 complete when every `TEST_FAIL` has either a `FIXED` entry or a
  documented, owner-routed reason it is out of scope (e.g. needs live secrets).
- Phase 4 complete when every formerly-failing row is `VERIFIED` or re-opened.

## Failure modes & circuit breakers

- **Scope drift** — only features that exist in code; no inventing roadmap items.
- **Self-certification** — Phase 2/4 evidence must be runnable output, not
  assertion. Fixes (Phase 3) are verified by a *re-run*, never by inspection.
- **Live-secret boundary** — anything requiring real Polar/Firebase/provider
  credentials is marked `BLOCKED_OWNER`, not failed or faked.
- Repeated failure on the same gate → halt that row, escalate in phase-log.

## Recovery references

- Architecture: `docs/ARCHITECTURE.md`; deploy/handoff: `docs/DEPLOY.md`,
  `docs/HANDOFF_CHECKLIST.md`. Boundary gate: `functions/src/__tests__/boundary.test.ts`.
