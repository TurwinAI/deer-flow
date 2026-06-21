# P2B01 Retrospective — Metadata & Rights core

- **Batch:** P2B01 · **Date:** 2026-06-21 · **Outcome:** VERIFIED

## What was attempted
Give the catalog the identifiers + rights a real label needs: ISRC/UPC/ISWC validation, credits, and ownership splits — with splits kept private.

## What was verified
9 gates green (129 emulator tests). Independent verifier re-derived the UPC mod-10 and ISWC weighted check digits, confirmed splits are unreadable by any client, and re-proved the firewall byte-exact. No scope creep.

## What failed / surprised
- No real failures. Key design call: ownership splits are financially sensitive, so they went into an admin-only `rights/{releaseId}` collection (mirroring the B05 `track_masters` pattern) rather than onto the world-readable release doc — keeping the "public identifiers vs private rights" split clean.
- ISWC check-digit has registry variants; implemented the canonical ISO-15707 weighted mod-10 with a structural fallback, documented as a limitation.

## Failure-taxonomy note
No defects. The private-by-construction choice for splits is the same hardening lesson from the Codex P2 fix (don't put sensitive fields on public docs) — now applied proactively rather than caught in review.

## Structural fixes proposed (capability, not blame)
1. Reuse the "public doc + admin-only sensitive sibling collection" pattern for every future sensitive field (royalties, contracts) — codify it as a convention in ARCHITECTURE docs at P2B10.
2. P2B03 (DDEX) consumes these identifiers — its ERN builder must reject releases missing UPC or tracks missing ISRC (carry the validators forward).

## Advance decision
Autorun proceeds to P2B02 (asset pipeline + AI provenance), which produces the deliverable masters/previews that P2B03 distribution will package.
