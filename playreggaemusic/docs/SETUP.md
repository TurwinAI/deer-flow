# Local development setup

## Prerequisites

- **Node 20** (the Functions runtime target; the repo also runs under newer Node
  for local dev).
- **pnpm** (`npm i -g pnpm`).
- **Java 21+** — required by the Firestore/Storage emulators.
- **firebase-tools** (`npm i -g firebase-tools`) — for the local emulators.

## Install

```bash
cd playreggaemusic
pnpm install
pnpm rebuild esbuild        # ensure the native esbuild binary matches this platform

cd functions
pnpm install
```

## Run the web app

```bash
cd playreggaemusic
pnpm dev                    # vite dev server (live mode — needs Firebase config)
```

### Offline / fixtures mode

To run the whole app with seeded in-memory data and NO live backend (used by the
E2E suite):

```bash
VITE_USE_FIXTURES=1 pnpm dev
# or a static preview:
VITE_USE_FIXTURES=1 pnpm build && pnpm preview
```

## Run the emulators

The project is emulator-first (`firebase.json`):

```bash
cd playreggaemusic
firebase emulators:start    # auth, functions, firestore, storage, hosting
```

## Gates (run before every commit)

```bash
# Web (from playreggaemusic/)
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:e2e               # Playwright (needs a chromium binary — see DEPLOY/HANDOFF)

# Functions (from playreggaemusic/functions/)
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:emulator          # vitest against the Firestore/Storage emulators
```

## Environment variables

None are committed. Supply them via your shell, a local `.env`, or Firebase
secrets at deploy time.

### Web (Vite — must be prefixed `VITE_`)

| Var | Purpose |
|-----|---------|
| `VITE_FIREBASE_API_KEY` | Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase web config |
| `VITE_FIREBASE_PROJECT_ID` | Firebase web config |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase web config (also used for preview URLs) |
| `VITE_FIREBASE_APP_ID` | Firebase web config |
| `VITE_USE_FIXTURES` | `"1"` enables offline fixtures mode (dev/E2E only) |

### Functions (server-side — set as Firebase secrets in prod)

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Claude model key (only needed to *invoke* the agent) |
| `POLAR_ACCESS_TOKEN` | Polar API token (sandbox, then production) |
| `POLAR_WEBHOOK_SECRET` | Standard Webhooks signing secret for `polarWebhook` |
| `POLAR_BASE_URL` | Optional; defaults to the Polar **sandbox** host |
| `PRM_DEFAULT_MODEL` | Optional override for the default Claude model id |

> The unit/emulator gates mock the LLM and Polar, so none of the server-side
> secrets are required to build or test. They are operator-supplied at handoff.
