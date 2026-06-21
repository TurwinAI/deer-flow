# Deploy — owner-side handoff

This codebase is built and verified **up to the production-handoff line**. It
does NOT create the live Firebase project, deploy, or configure live Polar /
Anthropic accounts. The steps below are the operator (owner) actions to take the
verified build live. See `HANDOFF_CHECKLIST.md` for the explicit go-live to-dos.

## 1. Create the Firebase project

1. Create a Firebase project in the console (e.g. `playreggaemusic`).
2. Enable **Firestore**, **Authentication** (Email/Password), **Storage**, and
   **Cloud Functions** (Blaze plan — Functions + outbound network require it).
3. Register a **web app** and copy its config into the web `VITE_FIREBASE_*`
   environment variables (see `SETUP.md`).
4. Point `.firebaserc` at the project id.

## 2. Grant yourself the admin claim

The admin console + admin callables are gated on a custom claim. Set it once for
the owner account (the `admin` claim is what `assertAdmin` checks):

```js
// Run with the Admin SDK (e.g. a one-off Node script with a service account).
await admin.auth().setCustomUserClaims(OWNER_UID, { admin: true });
```

The user must re-authenticate (or refresh their ID token) for the claim to take
effect.

## 3. Configure Polar (sandbox → production)

1. Create a Polar organization; start in **sandbox**.
2. Create the digital-download **products/prices**; record each
   `polarProductId` / `polarPriceId` on the matching Firestore `products` doc.
3. Configure a **webhook** pointing at the deployed `polarWebhook` URL and copy
   the signing secret.
4. Set the Functions secrets:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   firebase functions:secrets:set POLAR_ACCESS_TOKEN
   firebase functions:secrets:set POLAR_WEBHOOK_SECRET
   # POLAR_BASE_URL defaults to the sandbox host; set it to the production host
   # (https://api.polar.sh) only when you flip to live.
   ```
5. Validate the full purchase flow in sandbox before switching to production
   keys/host.

## 3b. Configure the Phase-2 label adapters (test-mode → live)

Every Phase-2 external integration is an injectable adapter whose REAL impl reads
a token from the environment and throws without it (the Fake impl is used in all
gates). Supply each token as a Functions secret only when wiring that capability
live; until then the system runs fully on Fakes.

```bash
firebase functions:secrets:set DISTRIBUTOR_API_TOKEN   # DSP delivery (DDEX) + DSP revenue
firebase functions:secrets:set PRO_API_TOKEN           # PRO/MLC affiliation + publishing income
firebase functions:secrets:set SOCIAL_API_TOKEN        # social posting
firebase functions:secrets:set EMAIL_API_TOKEN         # email blasts
firebase functions:secrets:set ADS_API_TOKEN           # paid-ad spend
firebase functions:secrets:set PLAYLIST_API_TOKEN      # playlist pitching
firebase functions:secrets:set DSP_STATS_API_TOKEN     # analytics ingestion
```

Also operator-side at go-live:

- **Binding license + sync wording** — call `adminSetLicenseTerms` with the
  legally-reviewed personal-download (and sync) wording (flips the placeholder
  off; the compliance gate warns until you do).
- **Active artist agreements** — register + activate each artist's agreement
  (`adminRegisterAgreement` / `adminActivateAgreement`) with AI-generation
  consent; the pre-distribution compliance gate refuses a release without one.
- **Payout rail** — there is NO live payment rail; wire operator-supplied payout
  creds before any payout executes (it stops at a documented no-money stub).
- **Real PreviewEncoder (ffmpeg)** — production preview-clip generation needs a
  real ffmpeg-backed `PreviewEncoder` (the build ships an unconfigured stub).
- **Real Scheduler (Cloud Scheduler)** — autonomous scheduled runs use the
  `FakeScheduler` in tests; wire `CloudScheduler` (Cloud Scheduler/PubSub) live.
- **ERN XSD validation** — the ERN builder validates structurally; add full DDEX
  ERN **XSD** validation against the distributor's required schema version.

## 4. Deploy

```bash
cd playreggaemusic
pnpm install && pnpm build                 # builds dist/ for hosting
firebase deploy --only firestore:rules,storage:rules
firebase deploy --only functions
firebase deploy --only hosting
# or simply:
firebase deploy
```

> Do NOT ship the web app with `VITE_USE_FIXTURES=1` — that is dev/E2E only.

## 5. Playwright browser (CI)

The E2E suite needs a chromium binary:

```bash
pnpm exec playwright install --with-deps chromium
# if system deps are unavailable, fall back to:
pnpm exec playwright install chromium
```

Then `pnpm test:e2e` runs the offline fixtures flow.

## 6. Post-deploy verification

- Seed the launch catalog (Roots Untold / Foundation Stones) via the admin
  console or the `seedRootsUntold` path.
- Confirm public catalog reads work and admin writes are rejected for non-admins
  (Firestore rules).
- Run one sandbox purchase end-to-end and confirm the order is mirrored to
  Firestore and the entitlement is granted.
- Trigger one agent run from `/admin/agent` with a live `ANTHROPIC_API_KEY`.
