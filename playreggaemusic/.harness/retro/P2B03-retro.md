# P2B03 Retrospective — DDEX distribution

- **Batch:** P2B03 · **Date:** 2026-06-21 · **Outcome:** VERIFIED

## What was attempted
Close the biggest "what a label does" gap: deliver releases to DSPs via DDEX. Built the ERN package builder (identifier-gated), a pluggable distributor adapter (test-mode), the schedule→deliver flow, and a consequential human-approval gate before any publish.

## What was verified
9 gates green (192 emulator tests). Independent verifier confirmed the ERN rejects missing/invalid ISRC/UPC, the approval gate fires before any client/ERN work (no delivery without approval; admin enforces `z.literal(true)`), no live distributor is reachable from tests, and distributions are admin-only. Firewall re-proven byte-exact.

## What failed / surprised
- No real failures. The P2B01 identifier validators paid off immediately — the ERN builder reuses them to refuse non-distributable releases, exactly the "carry validators forward" fix proposed in the P2B01 retro.
- DDEX is a large standard; shipped a well-formed simplified ERN profile rather than faking full XSD conformance — honestly flagged as a handoff hardening item.

## Failure-taxonomy note
No defects. The approval gate is the first concrete instance of constitution §13 (bounded autonomy) inside the product — consequential action blocked pending human approval. P2B04 generalizes it so every consequential capability shares one audited gate.

## Structural fixes proposed (capability, not blame)
1. P2B04 must replace the inline `approved===true` boolean with a real ApprovalGate (pending-approval store + audit log) and route distribution deliver, marketing spend (P2B07), and payouts (P2B05) through it.
2. Handoff: configure a real distributor adapter + validate ERN against the full DDEX ERN 4.x XSD before live delivery (add to P2B10 HANDOFF_CHECKLIST).

## Advance decision
Autorun proceeds to P2B04 (autonomy orchestration: scheduler + planner + ApprovalGate + agent audit log) — the safety backbone for unattended operation.
