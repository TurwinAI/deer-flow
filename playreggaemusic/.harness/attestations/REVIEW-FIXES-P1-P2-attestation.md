# Review-Fix Attestation — Codex P1 + P2 (post-handoff hardening)

- **Status:** VERIFIED (both fixes) — append-only addendum to the PROD_HANDOFF_GATE record
- **Date:** 2026-06-21
- **Branch / HEAD:** `claude/prm-build-2026-trigger-r91u1m` @ `857a90e`
- **Trigger:** automated Codex review on PR #2 (two actionable findings)
- **Builder:** build-role (orchestrator P1; build-role subagent P2) + orchestrator gate re-run
- **Verifier:** independent agents (did NOT build the fixes) — separation of powers preserved
- **Approver:** operator (owner) — both fixes were operator-directed; release remains the operator's

## P1 — Bind Functions v2 secrets (commit `3de1bd7`)
**Issue:** v2 triggers read `process.env.<SECRET>` but didn't bind the secret, so Secret Manager values would be `undefined` at deploy → checkout/webhook/agent fail.
**Fix:** `defineSecret` + `secrets:[...]` bound — `createCheckout`→`POLAR_ACCESS_TOKEN`, `polarWebhook`→`POLAR_WEBHOOK_SECRET`, `runAgent`→`ANTHROPIC_API_KEY`.
**Verification:** functions typecheck/lint/test/build green (wrappers remain untested by design — pure handlers carry the logic + auth-guard tests).

## P2 — Master paths out of public reads (commit `857a90e`) — VERIFIED
**Issue:** public, world-readable `tracks` docs included the private `masterPath`; Firestore can't project fields, so the master object path leaked (files themselves stayed Storage-protected).
**Fix:** removed `masterPath` from the public `Track`; moved it to admin-only `track_masters/{trackId}` (`createTrack` writes public fields only; `setTrackMaster`/`getTrackMaster` via admin SDK). `firestore.rules`: `track_masters` denies all client access; `tracks` stays public-read. Entitlement `mintDownloadUrl` resolves the master via `getTrackMaster`.

**Independent verification (non-builder) — gate matrix, all GREEN:**

| Gate | Exit | Result |
|------|------|--------|
| fn typecheck / lint / test (54+40skip) / build | 0 | PASS |
| fn test:emulator (94 pass) | 0 | PASS |
| web typecheck / lint / test (14) / build | 0 | PASS |
| **web E2E** (chromium 1194, full spec) | 0 | PASS |

**Evidence quality:**
- Public tracks lack masterPath: type, write path, and `not.toHaveProperty("masterPath")` tests (incl. seed).
- `track_masters` client-unreadable: rule `if false`; anon + non-admin read/write denied; `tracks` still public-read. **Firewall re-proven by inverting the rule → exactly 3 expected failures, then reverted byte-exact (checksum match).**
- Entitlement intact: mints signed URL from `getTrackMaster` + AI disclosure + personal-license; throws on unpaid/missing.
- No `any`/eslint-disable/@ts-ignore introduced; zod pinned 3.23.8; harness↛app boundary green; tree clean, HEAD unchanged.

**Leak status: CLOSED.**

## Disposition
Both Codex findings resolved and independently verified. The handoff posture remains **READY** (all gates green); the owner-side handoff items (license wording, live credentials, domain, real-browser contrast a11y) are unchanged. Release remains the operator's decision.
