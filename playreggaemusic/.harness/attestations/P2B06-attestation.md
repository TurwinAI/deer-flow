# P2B06 Attestation — Publishing + sync/licensing

- **Batch:** P2B06 (Phase 2) · **Status:** VERIFIED · **Date:** 2026-06-21
- **Branch/HEAD:** `claude/prm-build-2026-trigger-r91u1m` @ `f92d86d`
- **Builder:** build-role subagent + orchestrator gate re-run
- **Verifier:** independent agent (did NOT build P2B06) — separation of powers
- **Approver:** operator (release withheld for Phase-2 handoff; no self-release)
- **Artifact hashes:** `P2B06-sha256.txt`. Aggregate SHA256: `8b60f599a43779415e23a60901d97b689a3d6f34de0b6924ac901b702c97fd7e`

## Scope delivered
Works registry (public `works/{id}`: id/title/iswc/linkedIsrcs, validated via isValidISWC/isValidISRC) + private writer splits (admin-only `work_splits`, sum-to-100); PRO/MLC affiliation (admin-only `pro_affiliations`) via `FakeProRegistrar` (RealProRegistrar throws without `PRO_API_TOKEN`, never constructed in tests); sync — public `sync_catalog` + admin-only `sync_licenses` with request→clear→issue; `issue_sync_license` consequential, gated end-to-end via P2B04 ApprovalGate, placeholder `SYNC_LICENSE_PLACEHOLDER` text (owner-supplied at handoff).

## Gate evidence (fresh, independently re-run)
| Gate | Exit | Result |
|------|------|--------|
| fn typecheck / lint / test (172 pass, 116 skip) / build | 0 | PASS |
| fn test:emulator (288 pass) | 0 | PASS |
| web typecheck / lint / test (14) / build | 0 | PASS |
| harness↛app boundary | 0 | PASS (re-proven on injected violation, reverted byte-exact) |

## Evidence quality (verifier)
- **Writer splits cannot leak to public reads** — public works doc keys are exactly id/iswc/linkedIsrcs/title; splits in `work_splits` (`if false`); anon + non-admin denied. ISWC/ISRC validation rejects invalid; splits must sum to 100.
- **A sync license cannot be issued without approval** — `issue_sync_license` blocked by the gate (no issue, pending+blocked audit) until approve; admin path requires assertAdmin + `approved: z.literal(true)` + prior "cleared". Clearance refuses on missing master/work.
- No live PRO call reachable (FakeProRegistrar only).
- Public works + sync_catalog readable; work_splits/pro_affiliations/sync_licenses private. No `any`/eslint-disable; zod 3.23.8; no scope creep (no marketing/analytics); all 288 prior+new emulator tests pass.

## Verifier verdict (verbatim)
"**Verdict: VERIFIED** … All gates exit 0; all P2B06 scope claims confirmed by external evidence … writer splits cannot leak … a sync license cannot be issued without approval."

## Disposition
P2B06 VERIFIED. Autorun advances to P2B07 (marketing & promotion engine) — marketing spend will route through the ApprovalGate (`marketing_spend` reserved consequential name).
