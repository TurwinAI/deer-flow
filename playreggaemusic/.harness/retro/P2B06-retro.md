# P2B06 Retrospective — Publishing + sync/licensing

- **Batch:** P2B06 · **Date:** 2026-06-21 · **Outcome:** VERIFIED

## What was attempted
Add the publishing side a real label needs: a works registry (ISWC) with private writer splits, PRO/MLC affiliation, and a sync-licensing flow (request → clear → issue) for the master+composition.

## What was verified
9 gates green (288 emulator tests). Independent verifier confirmed writer splits never appear on the public works doc, sync licenses can't be issued without approval (gated on both agent and admin paths), clearance refuses on missing master/work, and no live PRO call is reachable. Firewall re-proven byte-exact.

## What failed / surprised
- Reused three established patterns cleanly: P2B01's "public doc + admin-only sensitive sibling" for writer splits; the Polar/distribution Fake-adapter pattern for the PRO registrar; and P2B04's ApprovalGate for the binding `issue_sync_license` commitment. The conventions are compounding — each batch gets cheaper and safer.
- Sync is the first capability spanning both rights sides (master = label, composition = publishing); clearance checks both before issuance.

## Failure-taxonomy note
No defects. Treating license issuance as a consequential, human-approved, placeholder-until-owner-wording action keeps legal commitments from being made autonomously — the right governance posture.

## Structural fixes proposed (capability, not blame)
1. Handoff: owner supplies binding sync license wording (replace SYNC_LICENSE_PLACEHOLDER) and real PRO/MLC registration creds — add to P2B10 HANDOFF_CHECKLIST alongside the personal-listening license.
2. P2B05 royalty statements could later fold in publishing income per writer splits (cross-batch enhancement) — noted for a future pass, out of current scope.

## Advance decision
Autorun proceeds to P2B07 (marketing & promotion engine: campaign planner, copy/asset generation, social/email/playlist adapters, scheduling) — marketing spend gated via the ApprovalGate.
