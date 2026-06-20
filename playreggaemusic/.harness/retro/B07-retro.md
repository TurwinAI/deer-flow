# B07 Retrospective — Admin/agent console + docs + E2E

- **Batch:** B07 (final build batch) · **Date:** 2026-06-20 · **Outcome:** VERIFIED-WITH-NOTES (E2E env-BLOCKED)

## What was attempted
Close out the build: owner-only admin + agent console, admin-guarded callables, offline fixtures mode, full docs + handoff checklist, and a real-browser Playwright E2E of the whole flow.

## What was verified
10/11 gates green incl. 90 emulator tests and 14 web tests (admin/agent components + axe). The admin auth guard rejects non-admins before any side effect; runAgent never constructs the model on reject. The fixtures bypass was proven by prod-bundle inspection to be dead-code-eliminated (`return false`) — it can never reach production. Firewall re-proven; attestations append-only respected.

## What failed / surprised
- **E2E BLOCKED by environment egress.** Playwright's chromium binary cannot be fetched: `cdn.playwright.dev` is not in the egress allowlist (HTTP 403) and the apt PPA path is 403 too. The spec, config, and fixtures webServer build are all sound — the only missing piece is the browser binary. Recorded as BLOCKED (≠ PASS), not faked, and added to the handoff checklist.
- **react-hooks false positive** on a `useFixtures`-named helper was resolved by renaming to `fixturesEnabled()` (a plain predicate) rather than an eslint-disable — keeping the no-suppression invariant.

## Failure-taxonomy note
The E2E block is a **pure environment/egress limitation**, not a defect or fabricated coverage. The honest move was to keep the gate RED-as-BLOCKED with exact evidence and route it to the operator (egress decision is theirs), rather than delete/skip the spec to show green. This is the constitution's "BLOCKED ≠ PASS / no RED-as-GREEN" in action.

## Structural fixes proposed (capability, not blame)
1. **Operator/env:** add `cdn.playwright.dev` to the network egress allowlist (or run E2E in a browser-capable CI), then the E2E gate runs green. On HANDOFF_CHECKLIST.
2. Real-browser color-contrast a11y in the same E2E/browser layer closes the deferred WCAG check.
3. Optional: code-split the web bundle (single ~617 kB chunk) before go-live for first-load performance.

## Advance decision
All seven batches built + verified to the handoff line. Proceed to the PROD_HANDOFF_GATE: assemble the evidence pack, Sentinel cross-check first-commit→HEAD, then propose READY-WITH-CAVEATS (E2E env-blocked) to the operator. The system does not self-release; the operator supplies live credentials, resolves the E2E env blocker, and runs the deploy.
