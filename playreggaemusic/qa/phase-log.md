# QA Loop — Phase Log (per-batch attestation)

## Phase 1 — Author user stories (COMPLETE)

- **Attempted:** Inventory every user-facing and agent-facing feature in the
  app and write a grounded user story + expected behaviour for each, into a
  single canonical CSV (`feature-tracker.csv`).
- **Method:** Fanned out four read-only Explore agents over disjoint module
  groups (label/dist/pub; finance/analytics/legal; marketing/polar/gateway/agent;
  ui). Each returned pipe-delimited rows with `file:line` refs. Output staged in
  `raw/*.psv`, assembled via `build_tracker.py` (idempotent — preserves later
  phase columns on re-run).
- **Verified (external evidence):** `build_tracker.py` parsed all 4 blocks with
  a strict 6-field check (would `SystemExit` on a malformed row); a separate
  `csv.DictReader` pass asserted 140 rows, unique IDs, and non-empty
  story/behaviour/refs on every row. Output: "CSV OK: 140 rows...".
- **Result:** 140 features, all `P1_StoryStatus = STORY_DONE`. Breakdown —
  gateway 41, ui 36, label 14, distribution 9, publishing 9, finance 8,
  marketing 6, analytics 4, legal 4, agent 3, polar 3, exports 3.
- **Failed / skipped:** None.
- **Surprised by:** The gateway exposes 41 admin callables, but only 3 functions
  (`health`, `createCheckout`, `polarWebhook`) are exported in
  `functions/src/index.ts` per the agents' reads — yet the agent C report claims
  each `admin*` callable is "EXPORTED (index.ts:NN)". This is a contradiction to
  resolve in Phase 2 (it is exactly the deploy-gap risk flagged earlier). Marked
  for first-priority verification.
- **Taxonomy note:** Separation of powers held — the agents that authored the
  inventory are read-only and did not verify their own claims; Phase 2 verifies
  against the actual code and test runs.

## Phase 2 — Test every user story (COMPLETE)

- **Attempted:** Exercise every feature's user story and record a status backed
  by external evidence; document all errors.
- **Method / evidence (runnable output, not assertion):**
  - Web: `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), `pnpm test` -> **22 passed**.
  - Functions: `pnpm typecheck` (0), `pnpm lint` (0), `pnpm test:emulator`
    (Firestore+Storage emulator) -> **407 passed, 0 skipped** (the 164
    emulator-gated tests covering distribution/compliance/persistence/statements/
    license/publishing/revenue/autonomy/contracts/marketing all executed).
  - E2E: installed chromium (already at /opt/pw-browsers), `pnpm test:e2e` ->
    **2 passed** (offline fixtures: catalog+buy+admin CRUD+agent run; and gated
    approvals+royalties+distribution+agent run).
- **Result:** 131 TEST_PASS, 5 BLOCKED_OWNER, 3 TEST_PASS_INDIRECT, 1 TEST_FAIL.
- **Contradiction resolved (anti-rationalization win):** prior sessions flagged a
  "deploy gap" (only 3 functions exported). Reading `functions/src/index.ts`
  directly shows all 41 admin callables ARE exported via `export { ... } from
  "./app/gateway/adminApi"` (lines 36-82) — the earlier `export const` grep was
  faulty. `tsc --noEmit` passing proves every re-exported name exists. No gap.
- **Defect found (UI-14):** `src/components/Nav.tsx` links to `/releases` and
  `/shop`; `src/App.tsx` has no route for either (only `/releases/:releaseId`),
  so both hit the catch-all and silently render Home. Confirmed those paths are
  referenced ONLY in Nav.tsx (no test/other code depends on them).
- **BLOCKED_OWNER (5):** DST-09, PUB-09, FIN-02, FIN-03, ANL-02 — real
  external-integration paths intentionally not exercised; their fakes/stubs are
  tested. Marked, not failed (live-secret boundary per manifest).
- **TEST_PASS_INDIRECT (3):** EXP-01/02/03 — the thin `index.ts` onCall/onRequest
  wrappers; underlying logic IS tested, wrappers themselves are not invoked.
  Coverage note, not an app defect.
- **Surprised by:** how clean the gates were — one genuine UX defect across 140
  features. The separation-of-powers setup (authoring agents read-only; verifier
  re-runs the suites) caught the stale deploy-gap claim that internal confidence
  had carried forward.
- **Decision (traceable):** UI-14 fix scoped for Phase 3 as a logistical/UX fix —
  make the nav honest. Owner: QA loop; date 2026-06-21; rationale: dead nav links
  are an unambiguous UX defect within fix scope.

## Phase 3 — Fix logistical/UX errors (COMPLETE)

- **Attempted:** Fix the single defect found in Phase 2 (UI-14).
- **Change:** Added `src/pages/Releases.tsx` (releases index, mirrors the
  Artists page, uses `listReleases()`), registered `/releases` in `src/App.tsx`,
  and removed the dead `/shop` nav link from `src/components/Nav.tsx` — the
  releases catalog IS the public storefront, so no separate Shop concept is
  invented (scope discipline). Added a regression guard in
  `src/__tests__/App.test.tsx`.
- **Verified:** `pnpm typecheck` (0), `pnpm lint` (0), `pnpm test` -> 23 passed
  (the new guard test asserts every nav link resolves to a real route, /releases
  renders the index not Home, and no `/shop` anchor exists).
- **Decision owner:** QA loop; 2026-06-21. Rationale recorded in Phase 2 entry.
- **Out of scope (not errors):** 5 BLOCKED_OWNER live integrations and 3 thin
  index.ts wrappers — left as-is; routed to the owner handoff, not patched.

## Phase 4 — Re-test every user behaviour post-fix (COMPLETE)

- **Attempted:** Re-exercise every behaviour after the fix.
- **Evidence (full re-run, post-fix):**
  - Web: typecheck 0, lint 0, `pnpm test` -> **23 passed**.
  - Functions: `pnpm test:emulator` -> **407 passed** (unchanged code, re-run as
    insurance — green).
  - E2E: `pnpm test:e2e` -> **2 passed**.
- **Tracker result:** P4 — 132 VERIFIED, 5 BLOCKED_OWNER, 3 VERIFIED_INDIRECT;
  0 rows unresolved. UI-14: TEST_FAIL -> FIXED -> VERIFIED.
- **Surprised by:** nothing regressed; the one fix was self-contained.
- **Taxonomy / capability fix:** the recurring "deploy gap" miscount traced to a
  grep that only matched `export const`, missing `export { } from`. Structural
  fix already in place: `tsc --noEmit` is the real guard (it fails if any
  re-exported callable is missing), and the new App nav guard prevents dangling
  routes. Loop terminal state reached — all four phases attested.
