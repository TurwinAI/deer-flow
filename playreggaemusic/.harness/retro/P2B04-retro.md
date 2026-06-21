# P2B04 Retrospective — Autonomy orchestration

- **Batch:** P2B04 · **Date:** 2026-06-21 · **Outcome:** VERIFIED

## What was attempted
Build the safety backbone for unattended operation: an agent audit log, a generic ApprovalGate that blocks consequential tool calls until a human approves, a bounded planner, and a scheduler adapter — all generic in the harness, with the app deciding which tools are consequential.

## What was verified
9 gates green (227 emulator tests). Independent verifier confirmed (offline + emulator) that a consequential tool's side effect cannot occur without an approved, hash-scoped record; every call is audited; the loop is bounded; no live scheduler runs; and — critically — the harness imports no app code (firewall adversarially re-proven and reverted byte-exact).

## What failed / surprised
- The hardest design constraint was keeping the gate GENERIC in the harness while the *policy* (which tools are consequential) lives in the app — solved by passing consequential tool NAMES as plain strings into the gate, never importing app into harness. The boundary test caught this class of mistake and the verifier re-proved it.
- Made the gate strictly opt-in on the graph builder so the existing ungated runtime + all prior suites behave identically — avoided a broad regression.

## Failure-taxonomy note
No defects. This batch turns constitution §13 (bounded autonomy) into an enforced runtime invariant rather than a per-feature inline check — generalizing P2B03's one-off approval. The remaining one-off (P2B03 inline deliver approval) is kept as defense-in-depth, not removed.

## Structural fixes proposed (capability, not blame)
1. P2B05 payouts and P2B07 marketing-spend must register as consequential tools so they inherit the gate + audit automatically (names already reserved: `initiate_payout`, `marketing_spend`).
2. Optional later: an admin-console "pending approvals" queue (web) so the human approver acts in-app; deferred to keep P2B04 backend-focused.
3. Wire the assembled `buildLabelAgent` to pass the live ApprovalGate stores in P2B05+ so end-to-end agent runs are gated (generic layer already proven).

## Advance decision
Autorun proceeds to P2B05 (royalty & finance: splits, recoupment, statements, payout proposals) — payouts route through this ApprovalGate.
