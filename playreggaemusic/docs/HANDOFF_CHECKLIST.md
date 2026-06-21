# Operator handoff checklist (before go-live)

The system is built and verified to the handoff line (Phase 1 + Phase 2). The
following are the explicit operator to-dos that require live credentials,
legal/brand decisions, or a real browser — they CANNOT be completed inside the
build environment. Every external integration runs on a Fake adapter until the
matching credential is supplied; consequential actions stay behind the
ApprovalGate.

## Legal / content

- [ ] **Binding personal-download license + sync wording.** Supply the final,
      legally-reviewed wording via `adminSetLicenseTerms` (kind
      `personal_download`, and sync wording for sync licenses). This flips the
      clearly-marked PLACEHOLDER off; the pre-distribution compliance gate warns
      until you do. The placeholder also appears in `src/lib/license.ts` (web)
      and `app/polar/entitlement.ts` (entitlement copy).
- [ ] **Active artist agreements.** Register + activate each artist's agreement
      (`adminRegisterAgreement` / `adminActivateAgreement`) with ownership %,
      term, and **AI-generation consent** = true. The compliance gate refuses to
      deliver a release whose artist lacks an active, consenting agreement.
- [ ] Confirm the AI-disclosure copy (AI-generated badge + terms line + the
      per-track C2PA-style provenance records) meets your jurisdiction's
      disclosure requirements.

## Brand

- [ ] **Confirm the final domain / working title "PlayReggaeMusic.ai"** — used
      throughout the UI, docs, and success/redirect URLs
      (`app/polar/checkout.ts` `DEFAULT_SUCCESS_URL`).

## Credentials & secrets (see DEPLOY.md)

Core (Phase 1):

- [ ] Create the Firebase project; enable Firestore, Auth, Storage, Functions
      (Blaze).
- [ ] Set the owner's `admin` custom claim.
- [ ] **`ANTHROPIC_API_KEY`** — required to invoke the agent (no live LLM is
      called in any test).
- [ ] **`POLAR_ACCESS_TOKEN`** + **`POLAR_WEBHOOK_SECRET`** — create the Polar
      products/prices and record their ids on the matching Firestore `products`
      docs; validate in sandbox, then flip `POLAR_BASE_URL` + keys to production.
- [ ] **Firebase** web config (`VITE_FIREBASE_*`) for the deployed web app.

Phase-2 label adapters (each real adapter reads its token from the env and
throws without it; supply only when wiring that capability live):

- [ ] **`DISTRIBUTOR_API_TOKEN`** — DSP delivery via DDEX (`DdexDistributorClient`)
      AND DSP revenue ingestion (`DistributorRevenueSource`).
- [ ] **`PRO_API_TOKEN`** — PRO/MLC affiliation (`RealProRegistrar`) AND
      publishing-income ingestion (`PRORevenueSource`).
- [ ] **`SOCIAL_API_TOKEN`** — social posting (`RealSocialChannel`).
- [ ] **`EMAIL_API_TOKEN`** — email blasts (`RealEmailChannel`).
- [ ] **`ADS_API_TOKEN`** — paid-ad spend (`RealAdChannel`).
- [ ] **`PLAYLIST_API_TOKEN`** — playlist pitching channel.
- [ ] **`DSP_STATS_API_TOKEN`** — analytics ingestion (real DSP-stats source).

## Live wiring (operator-side, beyond a single token)

- [ ] **Payout rail.** There is NO live payment rail. Executing a payout stops at
      a documented no-money stub; wire operator-supplied payout creds before any
      real transfer. Payout execution is gated by the ApprovalGate
      (`initiate_payout`).
- [ ] **Real PreviewEncoder (ffmpeg).** Production preview-clip generation needs a
      real ffmpeg-backed `PreviewEncoder`; the build ships an unconfigured stub.
- [ ] **Real Scheduler (Cloud Scheduler).** Autonomous scheduled runs use the
      `FakeScheduler` in tests; wire `CloudScheduler` (Cloud Scheduler/PubSub) live.
- [ ] **ERN XSD validation.** The ERN builder validates structurally; add full
      DDEX ERN **XSD** validation against the distributor's required schema version.

## Accessibility

- [ ] **Real-browser color-contrast a11y.** Component a11y tests disable the
      `color-contrast` axe rule (jsdom has no layout/canvas). Run an axe audit in a
      real browser (or Playwright + axe) against the live styles to confirm WCAG
      AA contrast; fix any token violations in `src/styles/tokens.css`.

## E2E in CI

- [ ] **chromium-for-E2E.** Install a chromium binary in CI
      (`pnpm exec playwright install --with-deps chromium`, falling back to
      `pnpm exec playwright install chromium`; or provide one via
      `PLAYWRIGHT_BROWSERS_PATH`) and confirm `pnpm test:e2e` is green
      (`catalog.spec.ts` + `phase2.spec.ts`). The specs + config are committed and
      validated against the pinned build; only the browser binary is
      environment-provided.

## Final sign-off

- [ ] Re-run every gate with fresh evidence — WEB: typecheck, lint, test, build,
      **test:e2e**; FUNCTIONS: typecheck, lint, test, **test:emulator** (incl. the
      `phase2Flow` full-chain proof), build, and the harness↛app boundary test.
- [ ] Independent verifier (≠ builder) confirms; operator approves the READY
      proposal. The system proposes READY — it does not self-certify.
