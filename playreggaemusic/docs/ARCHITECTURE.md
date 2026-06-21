# Architecture — PlayReggaeMusic.ai

PlayReggaeMusic.ai is a TypeScript + React + Firebase re-implementation of the
DeerFlow super-agent harness (pragmatic core, no Python). Its first and only v1
application is **autonomously operating the PlayReggaeMusic.ai reggae label and
digital storefront**.

```
playreggaemusic/
├── src/            # React + Vite frontend (public catalog + owner-only admin/agent console)
├── functions/      # Cloud Functions (TS): agent runtime host + HTTP/callable APIs
│   └── src/
│       ├── harness/   # DeerFlow-equivalent agent framework — MUST NOT import app/*
│       └── app/       # application layer (gateway + label + polar + agent) — MAY import harness/*
├── skills/         # SKILL.md skill definitions
├── firestore.rules # public-read catalog, admin-only writes, private masters
└── e2e/            # Playwright end-to-end spec
```

## harness/app split (the firewall)

The codebase mirrors DeerFlow's `harness/` vs `app/` split. `harness/*` is the
publishable, application-agnostic agent framework; `app/*` is the label-specific
wiring. **The dependency rule is one-directional: `app/*` may import `harness/*`,
but `harness/*` must never import `app/*`.** This is enforced by a CI boundary
test (`functions/src/__tests__/boundary.test.ts`) that scans every harness file
for forbidden relative/bare `app` imports.

## Agent runtime

- **Graph** (`harness/runtime`): a LangGraph.js tool-calling loop — an `agent`
  node calls the model; if the response carries tool calls they run in a
  `ToolNode` and feed back; otherwise the run ends.
- **Model factory** (`harness/models`): instantiates Claude via
  `@langchain/anthropic`. The default model id lives in `harness/config`. The
  API key is read from the environment and is only needed to *invoke* the model
  — every unit/emulator gate mocks invocation, so no key is required to build or
  test.
- **System prompt** (`harness/agents`): the base label-manager persona, joined
  with the enabled-skills section and the memory block.
- **Lead-agent assembly** (`app/agent/leadAgent`): the application wiring that
  ties harness builtins + label tools + an optional `create_checkout` tool into
  one agent. It lives in `app/` precisely because it imports both layers.

## Persistence

- **Checkpointer + thread store** (`harness/persistence`): a Firestore-backed
  `BaseCheckpointSaver` plus a thread store, so agent runs are durable and
  resumable by thread id.
- **Label store** (`app/label/store`): admin-SDK CRUD for the catalog
  (`artists/releases/tracks/products`) and the `orders` mirror, using
  deterministic set-with-id writes (idempotent).

## Memory

`harness/memory` extracts facts from runs, injects a `<memory>` block into the
system prompt, and stores facts in Firestore (`memory/{userId}`).

## Skills

`harness/skills` discovers and parses `SKILL.md` files (frontmatter:
name/description/allowed-tools), injects an enabled-skills section into the
prompt, and supports `/skill task` slash-activation.

## Polar (Merchant of Record, test mode)

`app/polar` integrates Polar.sh for digital-download checkout. The capability is
an **injectable interface** (`PolarClient`): production uses `PolarSdkClient`
(a thin fetch client reading token/host from the environment, defaulting to the
*sandbox* host); every test injects `FakePolarClient`, so no live key or network
is ever required. `createCheckout` (callable) creates a checkout; `polarWebhook`
(onRequest) verifies the Standard Webhooks signature, records paid orders, and
grants the personal-listening download entitlement.

## Catalog (public UI)

`src/lib/catalog` reads the public catalog via the Firebase web SDK; `src/pages`
renders home / artists / artist / release with preview playback, the
AI-generated badge, and the personal-license note. In fixtures mode the catalog
lib serves seeded in-memory data (see *Fixtures mode* below).

## Admin + agent console (owner-only)

- `src/lib/auth` wraps Firebase Auth and exposes an `isAdmin` check via the
  `admin` custom claim.
- `src/lib/admin` is the admin data layer: catalog CRUD, order listing, and the
  agent run. In production it calls admin-guarded callables; in fixtures mode it
  is fully in-memory.
- `app/gateway/adminApi` (Functions) exposes the admin-guarded callables —
  `adminCreateArtist/Release/Product`, `adminListOrders`, and `runAgent`. **Every
  handler runs `assertAdmin` first**, rejecting any caller whose
  `request.auth.token.admin !== true` with an `HttpsError` (`permission-denied`
  / `unauthenticated`). `runAgent` assembles the lead agent and requires a model
  at runtime (operator key at handoff); its auth guard is unit-tested with the
  agent execution injected, so no live LLM is ever called in a test.
- `/admin` (CRUD forms + orders/revenue view) and `/admin/agent` (trigger a run
  + view the transcript) are the React routes. Phase-2 adds the human-in-the-loop
  routes: `/admin/approvals` (list + approve consequential actions the
  ApprovalGate blocked), `/admin/distribution` (per-release DSP status), and
  `/admin/royalties` (per-artist statements). In production these call
  `adminListPendingApprovals`/`adminApprove`, `adminListDistributions`, and
  `adminListStatements`; in fixtures mode they are fully in-memory.

## Phase-2 label modules (the full set of label functions)

Phase 2 closes the gap from "agent engine + storefront + catalog" to "a label
that performs the full set of label functions autonomously". Every external
service is an **injectable adapter** with a Fake/test impl used in gates and a
real impl that reads creds from the environment and is never invoked in tests
(the Polar pattern). All consequential actions are gated by the ApprovalGate.

- **Distribution / DDEX** (`app/distribution`): a DDEX **ERN** package builder
  (Work/Recording/Release → ISWC/ISRC/UPC) with structural validation, a
  pluggable `DistributorClient` (`FakeDistributorClient` in tests,
  `DdexDistributorClient` reading `DISTRIBUTOR_API_TOKEN` in prod), release
  scheduling, delivery (the CONSEQUENTIAL action — approval + compliance gated),
  and a live-status mirror (`distributions/{releaseId}`).
- **Finance / royalties** (`app/finance`): multi-source revenue ingestion
  (`PolarRevenueSource` over the orders mirror + Fake DSP/PRO sources; real
  sources read `DISTRIBUTOR_API_TOKEN`/`PRO_API_TOKEN`), a cent-exact split
  engine (largest-remainder), recoupment, per-artist royalty **statements**
  (gross − deductions − recoupment = net, reconciling), and payout **proposals**
  (executing a payout is gated; there is no live payment rail).
- **Publishing / sync** (`app/publishing`): a works registry (ISWC) + writer
  splits, PRO/MLC affiliation via an injectable `ProRegistrar`
  (`FakeProRegistrar` in tests; real reads `PRO_API_TOKEN`), and a sync catalog
  with a request → clearance → issued-license flow (issuing is gated).
- **Marketing** (`app/marketing`): a campaign planner, copy generation, and
  injectable social/email/ad **channels** (Fake in tests; real read
  `SOCIAL_/EMAIL_/ADS_API_TOKEN`). Public posting, email blasts, and ad spend are
  CONSEQUENTIAL and gated; planning/scheduling are not.
- **Analytics** (`app/analytics`): ingestion (`PolarSalesSource` + Fake DSP-stats;
  real reads `DSP_STATS_API_TOKEN`), deterministic insight reports, and A&R
  recommendations — all read/propose only.
- **Legal / compliance** (`app/legal`): artist agreement records (ownership %,
  term, AI-generation consent), owner-supplied structured license terms
  (`setLicenseTerms`), and a hard pre-distribution **compliance gate**
  (AI-disclosure + provenance per track + splits summing to 100 + an active
  consenting agreement) wired into `deliverRelease`.
- **Orchestration** (`harness/orchestration`): the GENERIC autonomy layer —
  the **ApprovalGate** (`wrapTools` blocks consequential tool calls pending a
  human `approve`, parameterised by a set of consequential tool NAMES + injected
  stores), an **audit log** (every tool call recorded with its decision), a
  bounded **planner**, and a **scheduler** adapter (`FakeScheduler` in tests;
  `CloudScheduler` for prod). It imports only harness persistence — it never
  imports `app/*`, so the firewall holds while the app wires which tools are
  consequential (`CONSEQUENTIAL_TOOLS` in `app/agent/leadAgent`).

The full chain is proven end-to-end against the emulator in
`functions/src/__tests__/phase2Flow.emulator.test.ts`: seed → ingest revenue
(Polar + Fake DSP + Fake PRO) → generate a reconciling royalty statement → run
the assembled agent through the ApprovalGate (schedule executes + is audited; a
consequential payout is blocked, approved, then executes the no-money stub) →
distribution refused until approved, then delivered via the FakeDistributor.

## Fixtures mode (offline)

When the app is built/run with `VITE_USE_FIXTURES=1`, the catalog, checkout,
auth, and admin libs serve seeded in-memory data (Roots Untold + Foundation
Stones) and the agent console returns a **canned transcript** — there is NO live
Firebase / Functions / Polar / Anthropic call. The bypass is gated strictly on
that env flag (there is no hardcoded production bypass), which is what lets the
Playwright E2E and component tests run entirely offline. The Phase-2 admin views
(approvals/distribution/royalties) also serve seeded in-memory fixtures, so the
owner can operate the full gated workflow offline.

## End-to-end (Playwright)

`e2e/catalog.spec.ts` covers the public catalog → buy → admin CRUD → agent run
flow; `e2e/phase2.spec.ts` covers the human-in-the-loop flow (catalog → admin →
approve a pending action → it disappears → royalty statement → distribution
status → agent run transcript). Both run in fixtures mode against the pinned
provisioned chromium (build 1194 via `PLAYWRIGHT_BROWSERS_PATH`), so the whole
flow runs offline (`pnpm test:e2e`).
