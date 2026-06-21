# P2B07 Retrospective — Marketing & promotion engine

- **Batch:** P2B07 · **Date:** 2026-06-21 · **Outcome:** VERIFIED

## What was attempted
Give the label a marketing department: a campaign planner, on-brand copy, channel adapters (social/email/playlist/ads), and scheduling — with every outward/spending action gated.

## What was verified
9 gates green (327 emulator tests). Independent verifier confirmed all three consequential actions (publish/email/spend) are blocked-until-approved with zero live channel calls, planning/copy/scheduling are non-consequential and deterministic, campaigns are private, and the firewall holds (re-proven byte-exact).

## What failed / surprised
- The clean line between "draft/plan" (non-consequential) and "publish/spend" (consequential, gated) fell straight out of the P2B04 gate design — adding three tool names to CONSEQUENTIAL_TOOLS was the whole governance wiring. The autonomy backbone is paying compounding dividends across F4/F5/F7/F8/F9.
- The verifier scrutinized the Real* negative tests (dummy tokens) and confirmed they strengthen, not weaken, the no-live-call guarantee.

## Failure-taxonomy note
No defects. Every outward marketing action is, by construction, a Fake-in-tests + Real-stub-throws + ApprovalGate triple — the same safety lattice now spans distribution, payouts, sync, and marketing.

## Structural fixes proposed (capability, not blame)
1. Handoff: wire real social/email/ads providers + a real scheduler behind the existing stubs + ApprovalGate (owner creds) — add to P2B10 HANDOFF_CHECKLIST.
2. P2B08 analytics should feed campaign effectiveness back into the planner (close the marketing↔analytics loop) — and into A&R "what to release next."

## Advance decision
Autorun proceeds to P2B08 (analytics & A&R insights: ingest DSP/sales stats, produce insights, A&R recommendations feeding the planner).
