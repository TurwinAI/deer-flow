# Operator handoff checklist (before go-live)

The system is built and verified to the handoff line. The following are explicit
operator to-dos that require live credentials, legal/brand decisions, or a real
browser — they CANNOT be completed inside the build environment.

## Legal / content

- [ ] **Replace the placeholder personal-license wording.** The personal-listening
      license text is a clearly-marked PLACEHOLDER in both
      `src/lib/license.ts` (web) and the functions-side entitlement copy
      (`app/polar/entitlement.ts`). Supply the final, legally reviewed
      personal-listening license wording before selling anything.
- [ ] Confirm the AI-disclosure copy (the AI-generated badge + terms line) meets
      your jurisdiction's disclosure requirements.

## Brand

- [ ] **Confirm the final domain / working title "PlayReggaeMusic.ai".** The name
      is used throughout the UI, docs, and success/redirect URLs
      (`app/polar/checkout.ts` `DEFAULT_SUCCESS_URL`). Update if the final brand
      differs.

## Credentials & secrets (see DEPLOY.md)

- [ ] Create the Firebase project; enable Firestore, Auth, Storage, Functions
      (Blaze).
- [ ] Set the owner's `admin` custom claim.
- [ ] Supply **`ANTHROPIC_API_KEY`** as a Functions secret (required to invoke the
      agent — no live LLM is ever called in tests).
- [ ] Supply **`POLAR_ACCESS_TOKEN`** and **`POLAR_WEBHOOK_SECRET`**; create the
      Polar products/prices and record their ids on the matching Firestore
      `products` docs.
- [ ] Validate the purchase flow in the Polar **sandbox**, then switch
      `POLAR_BASE_URL` + keys to production.

## Accessibility

- [ ] **Run real-browser color-contrast a11y.** The component a11y tests disable
      the `color-contrast` axe rule because jsdom has no layout/canvas. Run an
      axe audit in a real browser (or the Playwright + axe integration) against
      the live styles to confirm WCAG AA contrast, then fix any token violations
      in `src/styles/tokens.css`.

## E2E in CI

- [ ] Install a chromium binary in CI
      (`pnpm exec playwright install --with-deps chromium`, falling back to
      `pnpm exec playwright install chromium`) and confirm `pnpm test:e2e` is
      green. The spec + config are committed and validated; only the browser
      binary is environment-provided.

## Final sign-off

- [ ] Re-run every gate (web 5 incl. E2E; functions 5 + boundary) with fresh
      evidence.
- [ ] Independent verifier (≠ builder) confirms; operator approves the READY
      proposal. The system proposes READY — it does not self-certify.
