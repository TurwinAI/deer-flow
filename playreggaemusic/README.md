# PlayReggaeMusic.ai

The home of AI-generated reggae music — an official AI-native reggae **label**
and digital **store**, operated by an autonomous agent runtime.

> Built under the PlayReggaeMusic.ai harness manifest
> ([`.harness/MANIFEST.md`](.harness/MANIFEST.md)). Each batch runs
> build → verify → attest; attestations live in `.harness/attestations/`.

## What this is

A **TypeScript + React + Firebase** re-implementation of the DeerFlow
super-agent harness (pragmatic core, no Python), whose first application is
autonomously running this label. The agent has tools to manage the catalog,
create Polar checkouts/products (test mode), and view orders.

- **Frontend** (`src/`): React + Vite — public catalog + admin/agent console.
- **Functions** (`functions/`): Cloud Functions (TS) hosting the agent runtime
  and APIs. Split into `harness/` (the agent framework) and `app/` (gateway +
  label + Polar). **`harness/` never imports `app/`** — enforced by
  `functions/src/__tests__/boundary.test.ts`.

## Status — B01–B07 complete (built + verified to the handoff line)

All seven batches are built and verified:

- **B01** — scaffold, module skeleton, design system, harness↛app boundary gate.
- **B02** — agent runtime core (LangGraph.js graph, Claude model factory, tool loop).
- **B03** — Firestore checkpointer + thread store + memory.
- **B04** — SKILL.md skills system (discovery/parse/inject/activation).
- **B05** — label data model + catalog tools + rules + Roots Untold seed.
- **B06** — Polar (test mode) + public catalog UI + autonomy wiring.
- **B07** — owner-only admin + agent console, admin-guarded callables, fixtures
  mode, full docs, and the Playwright E2E suite.

This is built and verified up to the production-handoff line — the owner supplies
live credentials and deploys (see [`docs/DEPLOY.md`](docs/DEPLOY.md) and
[`docs/HANDOFF_CHECKLIST.md`](docs/HANDOFF_CHECKLIST.md)).

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — harness/app split, agent
  runtime, persistence, skills, Polar, catalog, admin, fixtures mode.
- [`docs/SETUP.md`](docs/SETUP.md) — local dev, emulators, environment variables.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — owner-side handoff and `firebase deploy`.
- [`docs/HANDOFF_CHECKLIST.md`](docs/HANDOFF_CHECKLIST.md) — explicit go-live to-dos.

## Develop

```bash
# Web
cd playreggaemusic
pnpm install
pnpm rebuild esbuild
pnpm dev            # vite dev server (add VITE_USE_FIXTURES=1 for offline mode)
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:e2e       # Playwright E2E (offline fixtures flow; needs a chromium binary)

# Functions
cd functions
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:emulator  # vitest against the Firestore/Storage emulators
```

Firebase emulators (Firestore/Auth/Storage/Functions) are configured in
`firebase.json` (emulator-first). Running them requires `firebase-tools`
(`npm i -g firebase-tools`) and Java (for the Firestore emulator).

### Fixtures mode (offline)

Building/running with `VITE_USE_FIXTURES=1` serves seeded in-memory data
(Roots Untold + Foundation Stones) and a canned agent transcript — NO live
Firebase / Functions / Polar / Anthropic. This powers the offline E2E suite and
is strictly dev/test only (never production).

## Boundaries

This codebase is built and verified up to the production-handoff line. It does
not create the live Firebase project, deploy, or configure the live Polar /
Anthropic accounts — the owner supplies credentials and runs the deploy.
Releases are AI-generated; purchases grant a personal-listening license.
