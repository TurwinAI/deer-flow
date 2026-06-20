# B05 Retrospective — Label data model + catalog tools + seed

- **Batch:** B05 · **Date:** 2026-06-20 · **Outcome:** VERIFIED

## What was attempted
Give the label a real catalog: typed data model, an admin-SDK Firestore store, five agent-facing catalog tools (so the agent can later operate the label), the idempotent Roots Untold seed, and catalog/storage security rules — all gated against firestore + storage emulators.

## What was verified
10 gates green, including 57 emulator tests. Catalog tools round-trip through the real emulator; the seed is idempotent; the firewall was re-proven on a real violation; and "masters unreadable" was confirmed dynamically (not just by reading the rules file). No scope creep, no type escapes.

## What failed / surprised
- **Storage emulator upload friction:** the client SDK `uploadString` returned bare HTTP 400 against the storage emulator, and the admin resumable upload failed under vitest with `RequestInit: duplex option is required`. Both diagnosed and fixed within the 3-attempt budget — switched seeding to admin SDK with `{ resumable: false }` and targeted the bare-project-id bucket (the `.appspot.com` form caused `object-not-found` on the allowed preview read).
- **Architecture discipline held:** the catalog tools are application tools, so they went in `app/label/` — keeping the harness↛app firewall green without exceptions.

## Failure-taxonomy note
The storage-upload issues were **emulator/SDK environment friction**, not logic defects, and were resolved at the right layer (upload mechanism + bucket naming) rather than by skipping the test. The dynamic masters test was preserved (with a static fallback) rather than downgraded to static-only — the honest, stronger choice.

## Structural fixes proposed (capability, not blame)
1. Factor the bucket-name + `{resumable:false}` upload pattern into a tiny shared storage-test helper so B06 (download entitlement / signed URLs) reuses it instead of rediscovering the 400/duplex issues.
2. B06 must wire `getLabelTools()` + the skills resolver into the lead-agent system prompt/graph so the agent can actually operate the catalog autonomously — with an autonomy integration test (agent drives create-release → test-product → publish with mocked LLM + mocked Polar).

## Advance decision
Autorun proceeds to B06 (Polar TEST-MODE checkout + webhook + personal-license/AI-badge download entitlement, public catalog UI, autonomy wiring). APPROVAL-GATED: no live Polar keys/products/webhooks — test mode only; the build halts and asks before anything live.
