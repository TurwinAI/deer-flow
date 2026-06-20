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

## Status — B01 (scaffold)

Scaffold + module skeleton + design-system baseline + the harness↛app boundary
gate. Agent runtime, persistence, skills, catalog, Polar, and admin arrive in
B02–B07 per the manifest.

## Develop

```bash
# Web
cd playreggaemusic
pnpm install
pnpm dev            # vite dev server
pnpm typecheck && pnpm lint && pnpm test && pnpm build

# Functions
cd functions
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Firebase emulators (Firestore/Auth/Storage/Functions) are configured in
`firebase.json` (emulator-first). Running them requires `firebase-tools`
(`npm i -g firebase-tools`) and Java (for the Firestore emulator).

## Boundaries

This codebase is built and verified up to the production-handoff line. It does
not create the live Firebase project, deploy, or configure the live Polar /
Anthropic accounts — the owner supplies credentials and runs the deploy.
Releases are AI-generated; purchases grant a personal-listening license.
