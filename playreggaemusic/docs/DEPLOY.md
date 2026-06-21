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
