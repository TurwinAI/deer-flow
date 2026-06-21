# B01 Retrospective — Scaffold + module skeleton + design system

- **Batch:** B01 · **Date:** 2026-06-20 · **Outcome:** VERIFIED-WITH-NOTES

## What was attempted
Stand up the project skeleton for a TS/React/Firebase DeerFlow-equivalent: Vite web app, TS Cloud Functions, the `harness/`↔`app/` split with the import firewall, design-token baseline + label shell, Firebase emulator-first config, and the reusable gate harness all later batches inherit.

## What was verified
All 8 in-scope gates green (web + functions: types/lint/test/build), independently re-run by a non-builder. Tests confirmed meaningful (real RTL DOM queries; non-vacuous boundary scan over 10 files). The harness↛app firewall was empirically proven to fail on a real violation and pass when clean (byte-exact revert confirmed via sha256).

## What failed / surprised
- **Vite TS template friction:** project-reference `tsconfig.node.json` with `noEmit:true` is invalid under composite (`TS6310`). Fixed by dropping the reference and typechecking via `tsc --noEmit`. Surprise: the default `tsc -b` template path is incompatible with a noEmit typecheck gate.
- **pnpm blocks postinstall scripts** (esbuild, protobufjs) by default → Vite/Vitest would fail silently without the esbuild binary. Resolved with `pnpm rebuild esbuild`.
- **Root vitest globbed the functions tests** into the jsdom run. Scoped web `test.include` to `src/**` so the two projects gate independently.
- **firebase-tools absent** → emulator gate BLOCKED (expected, disclosed). Java 21 present, so it's a single-prereq gap.

## Failure-taxonomy note
All issues were **toolchain/config**, not logic defects — the class of failure expected when establishing a new gate harness. None were papered over; the emulator gap is recorded as BLOCKED, not skipped-silently.

## Structural fixes proposed (capability, not blame)
1. Add `firebase-tools` provisioning to the build setup (or a SessionStart hook) so the emulator gate is RUNNABLE at B03 instead of BLOCKED.
2. Pin the functions toolchain to Node 20 in the runner (or align the engines field) to clear the engine warning before deploy.
3. Carry the "scoped test include" and "rebuild esbuild after install" steps forward as standing setup notes so later batches don't rediscover them.

## Advance decision
Do not auto-advance. B01 VERIFIED-WITH-NOTES → report to operator; B02 (agent runtime core) begins only on operator go-ahead.
