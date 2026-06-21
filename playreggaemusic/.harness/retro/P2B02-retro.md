# P2B02 Retrospective — Asset pipeline + AI provenance

- **Batch:** P2B02 · **Date:** 2026-06-21 · **Outcome:** VERIFIED

## What was attempted
Turn "masters assumed pre-existing" into a real pipeline: ingest masters to private Storage, generate public preview clips, validate assets, and attach C2PA-style AI-provenance records.

## What was verified
9 gates green (159 emulator tests). Independent verifier confirmed no test can invoke ffmpeg/network/live-GCS (encoder + bucket injected; default stub throws), master-private/preview-public, provenance public-read/admin-write with a real SHA-256, and the entitlement path still works. Firewall re-proven byte-exact.

## What failed / surprised
- No real failures. The recurring decision: keep heavy/external operations (audio transcoding, GCS) behind injectable interfaces so gates stay offline and deterministic — the same pattern as Polar's FakeClient and the signer. This is now a clear house style.
- Preview encoding genuinely needs ffmpeg at deploy; honestly shipped as an `UnconfiguredPreviewEncoder` stub rather than a fake that pretends to encode.

## Failure-taxonomy note
No defects. The cosmetic rules-fixture hash (literal vs computed) is a test-data nicety, not a code-path gap — flagged by the verifier, production path proven correct.

## Structural fixes proposed (capability, not blame)
1. At deploy/handoff, configure a real `PreviewEncoder` (ffmpeg) — add to HANDOFF_CHECKLIST at P2B10.
2. P2B03 (DDEX) should require provenance + valid identifiers before packaging a release for distribution (AI-disclosure must travel with the delivery).

## Advance decision
Autorun proceeds to P2B03 (DDEX distribution). NOTE: P2B03 builds the publish capability + a FakeDistributor in test-mode — no live publish occurs, so building it needs no operator approval; the human-approval-before-publish gate is a runtime feature (composed with P2B04's ApprovalGate), and live distributor delivery stays owner-side.
