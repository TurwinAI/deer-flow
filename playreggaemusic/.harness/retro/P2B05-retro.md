# P2B05 Retrospective — Royalty & finance engine

- **Batch:** P2B05 · **Date:** 2026-06-21 · **Outcome:** VERIFIED

## What was attempted
Give the label real money mechanics: ingest revenue from multiple sources, split it cent-exactly per ownership, recoup advances, produce reconciling artist statements, and propose payouts — without ever moving real money.

## What was verified
9 gates green (263 emulator tests). Independent verifier re-derived the rounding allocation, confirmed statements reconcile, proved no test can hit a payment/revenue API or move money, and that `initiate_payout` is blocked-until-approved through the P2B04 gate. Firewall re-proven byte-exact.

## What failed / surprised
- The subtle correctness risk in royalties is rounding — naive percentage division loses/creates cents. Used largest-remainder (Hamilton) allocation so Σ shares === total exactly; covered by a property test over many totals.
- This is the first batch to consume two prior batches at once: P2B01 ownership splits (rights) + P2B04 ApprovalGate (payout gating) — the dependency-ordered manifest paid off.
- Found + fixed cross-suite emulator pollution (a rules suite seeded recoupment without cleanup); added post-suite `clearFirestore()` — additive, weakened no assertion.

## Failure-taxonomy note
No defects. The "propose, never execute; gate the execute; no payment SDK in the module" posture keeps the money rail safe by construction — the same adapter+approval discipline used for Polar and distribution, now applied to payouts.

## Structural fixes proposed (capability, not blame)
1. At handoff, wire a real payout rail (e.g. Stripe Connect/Wise) behind the existing stub + ApprovalGate; add to P2B10 HANDOFF_CHECKLIST. Live payment creds owner-side.
2. P2B06 publishing introduces composition splits (writer/publisher) — keep them in the same private-collection + validateSplits pattern so royalty statements can later include publishing income cleanly.

## Advance decision
Autorun proceeds to P2B06 (publishing admin + sync/licensing): works registry (ISWC), PRO/MLC affiliation, publishing splits, and a sync catalog with license issuance.
