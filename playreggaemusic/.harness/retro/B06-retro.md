# B06 Retrospective — Polar (test-mode) + catalog UI + autonomy wiring

- **Batch:** B06 · **Date:** 2026-06-20 · **Outcome:** VERIFIED-WITH-NOTES

## What was attempted
The integrating batch: Polar test-mode checkout + Standard-Webhooks verification + entitlement/download minting; the public catalog UI (home/artists/artist/release with preview playback, buy, AI badge, license note); and the autonomy wiring that finally lets the lead agent operate the catalog via tools — proven end-to-end with a mock LLM and mock Polar.

## What was verified
9 gates green; 76 emulator tests (incl. the headline autonomy integration that reads agent-created docs back from Firestore, webhook signature, entitlement) and 7 web tests (catalog pages + axe a11y). The independent verifier confirmed definitively that no test path can reach live Polar/GCS/network, and re-proved the firewall on a real violation.

## What failed / surprised
- **Shared-emulator test interleaving:** adding more emulator-backed test files exposed cross-file contention (each suite cleans shared collections in `afterEach`; default vitest cross-file parallelism interleaved them). Fixed with `fileParallelism:false`/single fork — correct isolation for shared mutable external state, verified not to mask a logic bug.
- **jsdom a11y limits:** axe's `color-contrast` rule can't run without canvas in jsdom. Disabled only that rule (documented), keeping landmarks/roles/names/alt/labels — and deferred true contrast checking to B07's real-browser Playwright. The axe run also caught a real defect (nested complementary landmark in `LicenseNote`) → fixed to `role="note"`.
- **Storage/admin upload quirks** (from B05) stayed relevant; entitlement minting uses an injectable signer so no GCS in tests.

## Failure-taxonomy note
The parallelism issue was **test-harness configuration** (shared external resource), fixed at the config layer without weakening assertions. The a11y exclusion is an **environment limitation**, handled by deferring (not dropping) the check. The placeholder license is a **deliberate, owner-pending decision** (manifest §6/§8.2), flagged for handoff — not an omission.

## Structural fixes proposed (capability, not blame)
1. **Handoff blocker:** replace the placeholder personal-license string with the owner's binding wording before go-live (B07 docs + handoff checklist must surface this).
2. B07 Playwright E2E should run real-browser a11y (incl. color-contrast) on the catalog + admin pages, closing the deferred check.
3. Consider a shared emulator test bootstrap (project id, collection cleanup, single-fork note) so future emulator suites inherit the correct isolation.

## Advance decision
Autorun proceeds to B07 (admin/agent console + full docs + Playwright E2E + finalized manifest/attestations), then the PROD_HANDOFF_GATE (Sentinel verification + operator release). License-placeholder and contrast-a11y are carried as explicit handoff items.
