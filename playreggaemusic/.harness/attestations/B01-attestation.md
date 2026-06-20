# B01 Attestation — Scaffold + module skeleton + design system

- **Batch:** B01
- **Status:** VERIFIED-WITH-NOTES
- **Date:** 2026-06-20
- **Branch:** `claude/prm-build-2026-trigger-r91u1m`
- **Builder:** build role (authored the scaffold)
- **Verifier:** independent agent (did NOT build B01) — separation of powers per manifest §8
- **Approver:** operator (owner) — final advance pending; system does not self-certify
- **Artifact hashes:** see `B01-sha256.txt` (46 files). Aggregate SHA256 of that manifest: `3b1dd36d5d9784b8e8bb9935cb24b664ac4b342e604ea22b58bafd2027179ff8`

## Scope delivered (per manifest §6, B01)
Vite/React/TS web app; TS Cloud Functions project; emulator-first Firebase config; `harness/`+`app/` module skeleton mirroring DeerFlow's split; design tokens + label mark + nav + AI-disclosure badge + home shell; `harness↛app` boundary test; smoke tests; toolchain probe.

## Gate evidence (fresh, independently re-run; exit codes ground-truthed)

| # | Gate | Command | Exit | Result | Confidence |
|---|------|---------|------|--------|-----------|
| 1 | web types | `pnpm typecheck` | 0 | PASS | high |
| 2 | web lint | `pnpm lint` | 0 | PASS | high |
| 3 | web test | `pnpm test` (2 tests) | 0 | PASS | high |
| 4 | web build | `pnpm build` (38 modules, `dist/`) | 0 | PASS | high |
| 5 | fn types | `pnpm typecheck` | 0 | PASS | high |
| 6 | fn lint | `pnpm lint` | 0 | PASS | high |
| 7 | fn test | `pnpm test` (boundary+smoke, 4 tests) | 0 | PASS | high |
| 8 | fn build | `pnpm build` (`lib/index.js`) | 0 | PASS | high |
| — | rules/persistence (emulator) | `firebase emulators:exec …` | 127 | **BLOCKED** | high |

## What passed
All 8 in-scope gates, with reproduced exit-code evidence from a verifier that did not build the code.

## Boundary firewall — empirical proof (verifier)
Verifier sha256'd `functions/src/harness/index.ts`, injected `import { gatewayInfo } from "../app";`, ran only the boundary test → **FAILED (exit 1)** naming the offender `harness/index.ts -> ../app`; restored the file byte-exact (sha256 re-matched) → **PASS (exit 0)**. The firewall is genuinely enforced, not a no-op.

## What failed / was skipped (honest)
- **Emulator-backed rules/persistence gate: BLOCKED**, not run. Cause: `firebase-tools` not installed (`firebase` → exit 127). Java 21 is present, so the only missing prerequisite is `firebase-tools`. **BLOCKED ≠ PASS.** Not required for B01; becomes load-bearing at B03/B05. Recovery: `npm i -g firebase-tools` (or `npx firebase-tools`) before B03, network permitting.

## Notes (non-blocking)
- Functions package declares Node 20 while runner is Node 22 → benign `Unsupported engine` warning. Reconcile before deploy.

## Verifier verdict (verbatim summary)
"VERIFIED-WITH-NOTES … All eight B01 gates pass with fresh, reproduced exit-code evidence; the tests are meaningful and the harness↛app boundary firewall is empirically proven … No fabrication, RED-as-GREEN, or scope creep … final advance is the approver's call."

## Disposition
B01 VERIFIED-WITH-NOTES. Does NOT auto-advance. Awaiting operator go-ahead to B02. The one BLOCKED gate is out of B01 scope and recorded as a B03/B05 prerequisite.
