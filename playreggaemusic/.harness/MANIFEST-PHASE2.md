# PlayReggaeMusic.ai — Harness Manifest, PHASE 2 (full-label completeness)

> Status: **PROPOSED — awaiting operator OK.** No Phase-2 batch is built until approved.
> Builds on Phase 1 (B01–B07 VERIFIED + P1/P2 fixes). Derived from `PHASE2-GAP-ANALYSIS.md`.
> Same constitution + loop as Phase 1: manifest-first; per batch build→gate→independent-verify(≠builder)→attest(SHA256, append-only)→retro→advance; separation of powers; circuit breakers halt loudly; no self-release.

## 1. Objective
Close the gap between the Phase-1 agent-engine+storefront+catalog and a **label that performs the full set of label functions autonomously** — prioritizing the load-bearing gaps (distribution, metadata/rights, royalties, autonomy orchestration), then publishing/sync/marketing/analytics. Built + verified to the handoff line; all external integrations test-mode/mock behind pluggable adapters; consequential actions gated by human approval.

## 2. Scope & boundaries
- **In:** the functions F1–F12 gaps in `PHASE2-GAP-ANALYSIS.md`, as batches below.
- **Out (still):** live deploys; creating live distributor/PRO/Polar/Anthropic accounts; physical merch fulfillment; hosting streaming. AI *audio generation* itself is upstream (Phase 2 ingests + adds provenance, does not build a model).
- **Authority:** files only under `playreggaemusic/` on the designated branch. No prod, no secrets, no other repos.
- **Adapters:** every external service (distributor/DDEX, PRO/MLC, social, email, payout) is an injectable interface with a Fake/test impl used in gates; the real impl reads creds from env and is never invoked in tests (the Polar pattern from B06).

## 3. Gate definitions (unchanged from Phase 1)
`pnpm tsc --noEmit` · `pnpm eslint` · `pnpm vitest run` · `pnpm build` · Firestore/Storage emulator suites (`pnpm test:emulator`) · `harness↛app` boundary test · Playwright `pnpm test:e2e` (chromium build pinned to the provisioned 1194). BLOCKED ≠ PASS; no fabricated coverage; no `any`/eslint-disable/@ts-ignore; zod pinned.

## 4. Batch plan (dependency-ordered)

| Batch | Function | Objective | Key deliverables | Gates / proof | Approval / failure modes |
|-------|----------|-----------|------------------|---------------|--------------------------|
| **P2B01** | F3 Metadata & Rights | Identifier + rights core | `ISRC`/`UPC`/`ISWC` fields + validators; `credits[]`; `ownershipSplits[]` (must sum to 100%); attach to Release/Track; admin tools to set them | unit: identifier format + split-sum validation; emulator: rights persisted + rules; types/lint/build | Foundation for F4/F7/F8. Failure: invalid/duplicate codes → reject |
| **P2B02** | F2 Production assets | Master/preview asset pipeline + AI provenance | asset ingestion (admin upload to private `masters/`), **preview-clip generation** (deterministic/ffmpeg-or-stub), asset validation, AI-provenance metadata (C2PA-style disclosure record) | emulator: ingest→master private + preview public; provenance record written; entitlement still mints | masters stay private (reuse track_masters); no live transcode in tests (inject encoder) |
| **P2B03** | F4 Distribution | DSP delivery via DDEX | **DDEX ERN package builder** (Work/Recording/Release → ISWC/ISRC/UPC), schema validation, pluggable `DistributorClient` (FakeDistributor in tests), release **scheduling** + live-status mirror | unit: ERN builder emits valid XML, rejects missing ISRC/UPC; emulator: scheduled release + status; FakeDistributor only | **APPROVAL GATE: publish-to-DSP is consequential** → human approval before deliver; live distributor = owner-side |
| **P2B04** | F12 Autonomy orchestration | Scheduler + planner + approval gates + audit | scheduled autonomous runs (Cloud Scheduler/PubSub adapter, test-mode); agent **planner** (todo/plan loop); **ApprovalGate** for consequential tool calls (publish/spend/payout) with pending-approval store; **agent audit log** (every tool call recorded) | unit: approval-gate blocks consequential calls until approved; audit entries written; planner loop bounded by maxTurns; emulator: approvals store | Bounded autonomy (constitution §13). Failure: any consequential action without approval → blocked + audited |
| **P2B05** | F7 Royalties & finance | Royalty + recoupment + statements | multi-source revenue ingestion (Polar + FakeDistributor + FakePRO); **split + recoupment engine**; per-artist **royalty statements**; **payout proposals** (no live payout) | unit: split math, recoupment, statement totals; emulator: statement generation across sources | **APPROVAL GATE: payouts** → proposal only; live payout owner-side |
| **P2B06** | F8 + F9 Publishing & sync | Works + collection + sync licensing | works registry (ISWC) + PRO/MLC affiliation records (FakePRO adapter); publishing splits; **sync catalog** + license request → clearance → issued-license record (master+composition) | unit: works/splits; emulator: sync license issuance + entitlement-style record | Live PRO/MLC = owner-side; sync contract wording owner-supplied (like license placeholder) |
| **P2B07** | F5 Marketing & promotion | Campaign engine | campaign planner; copy/asset generation (reuse copywriter skill); **adapters** for social + email + playlist-pitch (Fake in tests); campaign scheduling; release-campaign templates | unit: campaign plan; emulator: scheduled campaign records; adapters mocked | **APPROVAL GATE: spend/publish** (ads, public posts) → human approval; live channels owner-side |
| **P2B08** | F11 + F1 Analytics & A&R | Insights + decisioning | analytics ingestion (FakeDSPStats + Polar sales); insights/reporting; **A&R recommendation** ("what to release next") feeding the planner | unit: metrics aggregation; insight generation deterministic on fixtures; emulator: stored reports | Recommendations are proposals; releasing acts through P2B03's approval gate |
| **P2B09** | F10 Legal/Contracts/Compliance | Contracts + AI-disclosure compliance | artist agreement records (ownership %, term, consent); **AI-disclosure compliance** check on every release (badge + terms + provenance present); replace the B06 placeholder license with structured, owner-approved terms | unit: compliance gate rejects a release missing disclosure/ownership; emulator: contract records | Binding legal wording owner-approved before go-live |
| **P2B10** | Docs + E2E + handoff | Phase-2 closeout | update ARCHITECTURE/DEPLOY/HANDOFF docs; full Phase-2 Playwright E2E (catalog→approval→distribute(mock)→royalty statement→agent autonomous run); finalize attestations | all prior gates re-run; E2E green; docs build | — |
| **P2-HANDOFF-GATE** | — | Sentinel + operator | Sentinel (≠builder) clean-room re-verify Phase 1+2 first-commit→HEAD; evidence pack; READY proposal | all gates GREEN w/ fresh evidence | **Operator release** — no self-release |

## 5. Separation of powers, attestation, circuit breakers
Identical to Phase 1 (§8/§10/§11 of `MANIFEST.md`): builder ≠ verifier ≠ approver; per-batch `P2B0X-attestation.md` (+ SHA256) and `P2B0X-retro.md`, append-only; success=all VERIFIED+handoff→Sentinel→operator; stop on blocked(env/creds)/stuck(3 fails)/approval-required/stagnated; halt loud on scope-drift / fabricated evidence / RED-as-GREEN.

## 6. Sequencing notes
- Critical path for "real label": **P2B01 → P2B03 (distribution) → P2B05 (royalties)**, with **P2B04 (autonomy + approvals)** enabling safe autonomous operation across all.
- P2B02 (assets) precedes P2B03 (needs deliverable masters + provenance). P2B06/07/08/09 are parallelizable after P2B01/04.
- Every consequential capability (publish, spend, payout) ships behind the P2B04 ApprovalGate — autonomy is bounded by design.
