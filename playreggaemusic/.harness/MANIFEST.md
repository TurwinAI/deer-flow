# PlayReggaeMusic.ai — Harness Manifest (rev. 2)

> Status: **PROPOSED — awaiting operator OK.** No batch is built until this manifest is approved.
> Supersedes rev.1 (standalone storefront). Revised per operator decision: build a DeerFlow-equivalent agent runtime in TS/React/Firebase that autonomously operates the label.
> Constitution: manifest-first; per batch read→build→gate→attest→retro→advance; separation of powers (builder ≠ verifier ≠ approver); no self-certification; circuit breakers halt loudly.

---

## 1. Objective

Build a **TypeScript + React + Firebase agent runtime** — a pragmatic-core re-implementation of the DeerFlow super-agent harness (no Python) — whose **first and only v1 application is autonomously operating the PlayReggaeMusic.ai label and digital storefront**. Deliver the complete, verified codebase up to the production-handoff line. The system does **not** create live cloud resources or deploy (see §9).

## 2. Locked decisions (inputs)

| # | Decision | Locked value |
|---|----------|--------------|
| Deliverable | Primary goal | **Autonomous agent engine that RUNS the label.** Harness scoped to "enough to operate the label." |
| Parity | v1 scope | **Pragmatic core:** agent loop (LangGraph.js) + tool-calling + SKILL.md skills + memory + Firestore checkpoint/thread persistence + React UI. Mirror DeerFlow module layout where it maps. |
| Deferred | Out of v1 (anti-creep) | Code-execution sandbox, MCP stdio servers, IM channels, subagent delegation pools. |
| Stack | Platform | **TS + React (Vite) + Firebase** (Firestore/Auth/Storage/Cloud Functions) + **LangGraph.js/LangChain.js** + **Polar.sh** (test mode). No Python. |
| Model | LLM provider | **Claude (latest)** via `@langchain/anthropic`; exact model id pinned in config at B02 (verified against the claude-api reference). Key via secret/env; mocked in unit gates; live calls are owner-side at handoff. |
| §8.1 | Merch | **Phased** — digital-only via Polar at launch; physical deferred. |
| §8.2 | License | **Personal listening only.** |
| §8.3 | Customer accounts | **Polar customer portal only.** |
| §8.4 | AI disclosure | **"AI-generated" badge** on releases + terms line. |
| Brand | Working title/domain | "PlayReggaeMusic.ai" — owner to confirm final before B07 docs lock. |

## 3. Scope

**In scope (v1):** TS agent runtime (graph state, tool-calling loop, system-prompt assembly); model factory (Claude default); SKILL.md skills system (discovery/parse/inject/slash-activation); memory (fact extraction + injection, Firestore-stored); Firestore-backed LangGraph checkpointer + thread store; a bounded built-in tool set that lets the agent **operate the label** (catalog CRUD, order queries, Polar checkout/product in test mode, publish/present); public catalog UI (home, artist, release, preview playback); owner-only admin + agent console; digital-download purchase via Polar; order mirror in Firestore; responsive + WCAG AA.

**Out of scope (v1):** everything in the Deferred row above; physical fulfillment; streaming/playback hosting; native mobile; artist self-service; user uploads; in-app fan accounts beyond Polar; playlists.

**Authority boundary:** create/modify files only within `playreggaemusic/` on branch `claude/prm-build-2026-trigger-r91u1m`. No production, no secrets, no other repos, no edits to the rest of the deer-flow tree. Off-limits: live Firebase/Polar/Anthropic credentials and resources.

## 4. Architecture & module layout (mirrors DeerFlow harness/app split)

```
playreggaemusic/
├── .harness/                 # manifest, attestations (AFS), retro — append-only
├── src/                      # React + Vite frontend (public catalog + admin/agent console)
├── functions/                # Cloud Functions (TS): agent runtime host + HTTP/callable APIs
│   └── src/
│       ├── harness/          # DeerFlow-equivalent core (import: harness/*); MUST NOT import app/*
│       │   ├── agents/       # lead-agent graph factory, system prompt, thread state
│       │   ├── middlewares/  # pragmatic subset (uploads/title/memory-queue/error-handling)
│       │   ├── memory/       # extraction, injection, Firestore storage
│       │   ├── skills/       # SKILL.md discovery/parse/inject/activation
│       │   ├── tools/        # built-in tools + label-operation tools
│       │   ├── models/       # model factory (LangChain.js chat models; Claude default)
│       │   ├── config/       # config system
│       │   ├── persistence/  # Firestore checkpointer (BaseCheckpointSaver) + thread store
│       │   └── runtime/      # run manager + streaming bridge (SSE)
│       └── app/              # application layer (import: app/*); may import harness/*
│           ├── gateway/      # HTTP/callable endpoints (runs, threads, models, skills, memory)
│           ├── label/        # catalog/orders domain (Artist/Release/Track/Product/Order)
│           └── polar/        # Polar checkout + webhook handlers (test mode)
├── skills/                   # SKILL.md skill definitions (public/custom)
├── firestore.rules           # public-read catalog, admin-only writes, private masters
├── firebase.json             # emulator-first config
└── package/tsconfig/eslint/vitest/playwright configs
```

**Dependency rule (ported from DeerFlow):** `harness/*` never imports `app/*`. Enforced by a boundary test in CI gates.

## 5. Data model (Firestore)

Engine: `threads/{id}`, `checkpoints/{threadId}/...`, `memory/{userId}`. Label: `labels/{id}` · `artists/{id}` · `releases/{id}` (incl. `catalogNumber`, `aiGenerated:true`) · `tracks/{id}` (`previewClipPath` public, `masterPath` private) · `products/{id}` (`type: music_download|merch`, `polarProductId/PriceId`) · `orders/{id}` (Polar mirror). Seed: launch artist **Roots Untold**.

## 6. Batch plan

Each batch: **read → build → gate → attest → retro → advance.** Build only the current batch; no creep. RED gate → fix ≤3 → else HALT (STUCK). All-GREEN → independent verification (≠builder) → attest → advance.

| Batch | Objective | Key deliverables | Verification gates (pass criteria) | Primary failure modes / recovery |
|-------|-----------|------------------|------------------------------------|----------------------------------|
| **B01** | Scaffold + skeleton + design system | Vite/React/TS app; Functions TS project; emulator-first Firebase config; harness/app module skeleton; design tokens + label UI shell + nav + label mark; toolchain probe; harness↛app boundary test | `tsc --noEmit` (web+functions) · `eslint` · `vite build` · functions `tsc` build · `vitest run` smoke · boundary test green | Toolchain gap (firebase-tools/emulator) → record BLOCKED w/ evidence. B01 establishes the reusable gate harness. |
| **B02** | Agent runtime core | LangGraph.js lead-agent graph; model factory (Claude via `@langchain/anthropic`, id verified vs claude-api ref); tool-calling loop; thread-state schema; config system; 1–2 built-in tools | Graph + tool-loop unit tests (mocked LLM) green · types/lint/build green | LangGraph.js API drift; pin versions. Mock LLM — no live key in gates. |
| **B03** | Persistence + memory | Firestore `BaseCheckpointSaver` + thread store; memory extraction/injection/storage; rules for engine collections | Checkpointer round-trip tests vs **Firestore emulator** · memory tests · rules tests green | Emulator needs firebase-tools+Java(✓); uninstallable → rules/persistence gate BLOCKED (honest), types still gated. |
| **B04** | Skills system (SKILL.md parity) | Skills discovery/parse (frontmatter: name/description/allowed-tools); prompt injection; `/skill task` slash-activation; seed skills | Skills loader + parser + activation unit tests green · types/lint/build green | Frontmatter edge cases; test malformed SKILL.md. |
| **B05** | Label data model + catalog tools | Firestore label schema + rules (public-read catalog, admin writes, private masters); seed Roots Untold; agent **label-operation tools** (create/update artist/release/track/product, query orders) | Schema/types · rules tests (public read / deny anon write / masters unreadable) · tool tests vs emulator green | Scope guard: digital-only, no second rail. |
| **B06** | Polar (test) + public catalog UI + autonomy wiring | `createCheckout` + `polarWebhook` Functions (test mode), order recording, personal-license + AI-badge download entitlement; public catalog React UI (home/artist/release/preview); wire tools so the lead agent can operate label end-to-end | Functions tests (mocked Polar SDK + webhook sig verify) · UI component tests (+axe a11y) · **autonomy integration test** (agent drives create-release→test-product→publish with mocked LLM+Polar) green | **APPROVAL GATE: no live Polar keys/products/webhooks.** License copy placeholder until owner supplies binding wording. |
| **B07** | Admin/agent console + docs + E2E + attestations | Owner-only admin (Auth custom claim) for catalog/products/orders + agent console to observe/trigger autonomous runs; full docs; Playwright E2E; finalize manifest + attestations | All prior gates re-run green · **Playwright E2E** (browse→checkout(mocked)→admin→agent run) green · docs build · working-title/domain confirmed | E2E flakiness; pin selectors, headless. |
| **PROD_HANDOFF_GATE** | Read-only walkthrough + evidence pack | Verify every gate first-commit→HEAD; assemble evidence pack; route to independent verification + owner sign-off | All gates GREEN w/ fresh evidence; verifier (≠builder) confirms; **system proposes READY, does not self-certify** | Any RED/BLOCKED blocks READY. Owner supplies Firebase+Polar+Anthropic creds and deploys. |

## 7. Gate definitions (concrete)

From `playreggaemusic/` (web) and `playreggaemusic/functions/` (runtime):

- **types:** `pnpm tsc --noEmit`
- **lint:** `pnpm eslint . --ext .ts,.tsx`
- **unit/component tests:** `pnpm vitest run`
- **build:** `pnpm vite build` (web) / `pnpm tsc` (functions)
- **boundary:** test asserting `harness/*` never imports `app/*`
- **rules/persistence:** `pnpm vitest run` against `firebase emulators:exec` (Firestore emulator; Java 21 ✓; requires `firebase-tools`)
- **e2e (B07):** `pnpm playwright test`

A gate that cannot run here (e.g., missing `firebase-tools`, no network to install) is recorded **BLOCKED** with the exact command + error as evidence. **BLOCKED ≠ PASS.** No fabricated coverage. LLM calls are mocked in all unit gates; live LLM/Polar are owner-side at handoff.

## 8. Separation of powers & evidence

- **Builder:** implementing role for the batch (writes code + tests).
- **Verifier:** a **separate** role/agent that did not build the batch; runs gates fresh, inspects artifacts, captures raw output. Internal confidence ≠ verification.
- **Approver:** the **operator (owner)** — approves this manifest and the final READY proposal. The system never self-approves.
- **Confidence policy:** each gate reported with confidence + evidence quality. High confidence + fresh reproduced evidence → auto-advance. Low/weak/conflicting → halt for human review.

## 9. Execution boundary (honest)

Can produce + verify: all source, runtime, rules, tests, docs, manifest, attestations in-repo. Cannot from here: create the live Firebase project, `firebase deploy`, configure live Polar/Anthropic accounts, or push outside `turwinai/deer-flow`. "End to end" = built + verified to the handoff line; owner supplies live credentials and deploys.

## 10. Attestation & retrospective (append-only AFS)

- Per batch: `.harness/attestations/B0X-attestation.md` — artifact SHA256s, each gate's command+result+confidence+evidence quality, pass/fail/skipped, verifier identity (≠builder), timestamp, decision owner.
- Per batch: `.harness/retro/B0X-retro.md` — attempted/verified/failed/surprised; failure-taxonomy note; structural fix proposal (capability, not blame).
- Append-only; corrections are new entries, never edits.

## 11. Circuit breakers / stop conditions

- **Success:** all batches VERIFIED + final-acceptance gate → READY-PROPOSED → independent verifier + operator sign-off.
- **Blocked:** missing creds/env (e.g., emulator uninstallable) → halt, record, escalate.
- **Stuck:** 3 failed fix attempts on one gate → halt, escalate.
- **Approval-required:** live Polar/secrets/LLM, prod, destructive, handoff → halt + ask owner.
- **Stagnated:** no new progress → halt.
- Scope drift, fabricated evidence, RED-as-GREEN, skipped attestation → halt loudly, never route around.
