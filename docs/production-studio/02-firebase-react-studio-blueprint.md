# Blueprint: DeerFlow → a Firebase + React AI Production Studio

> **Companion to** `01-understanding-deerflow.md`. Read that first.
> **Status:** Architecture proposal (proposer mode). Recommendations carry rationale + alternatives + risks. Decisions you must make are collected in §13.
> **Framing:** You are building a **production house on the internet** — clients submit creative briefs; long-running agent *crews* produce finished ad campaigns/videos using external generative models; you (the producer/operator) oversee and approve. This doc scopes exactly what that takes.

---

## 0. The one decision that determines everything

**Question you asked:** *"How do I reconcile Python, TypeScript, and React, and make it a Firebase product?"*

**Answer:** Stop thinking "port it to Firebase." **Firebase is not where the agent brain runs.** The agent brain is Python + LangGraph, runs for minutes-to-hours, needs containers and a sandbox, and holds live run state. That does **not** fit Cloud Functions. It fits **Cloud Run / GKE**.

So the architecture is **two planes that meet at a contract**, not one language:

```
┌──────────────────────── PRODUCT / CONTROL PLANE (Firebase + GCP, TS/React) ─────────────────────────┐
│  React SPA (Firebase Hosting)   Firebase Auth   Firestore   Cloud Storage   Cloud Functions (TS)      │
│  the studio UI                  identity        domain data  the asset lake  webhooks/billing/glue     │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                                 │  HTTPS + SSE (LangGraph-compatible API, already exists)
                                                 │  Firebase ID token  →  verified by Gateway auth adapter
                                                 ▼
┌──────────────────────── COMPUTE / AGENT PLANE (GCP, Python) ─────────────────────────────────────────┐
│  Gateway + DeerFlow harness on CLOUD RUN  ──►  Cloud SQL (Postgres: checkpointer+runs+events)         │
│  the agent crews (lead + sub-agents)      ──►  Memorystore (Redis: StreamBridge + run registry)       │
│                                           ──►  Sandbox (GKE pods / provisioner / AIO) for code+render  │
│                                           ──►  External model MCPs: Higgsfield, Canva, Gemini, MiniMax │
└───────────────────────────────────────────────────────────────────────────────────────────────────-─┘
```

**The contract between planes:**
1. **The LangGraph-compatible HTTP+SSE API** that already exists (`/api/langgraph/*`, `/api/threads/*/runs/*`). The React app already speaks it via `@langchain/langgraph-sdk`.
2. **Firestore** for durable studio state (projects, jobs, asset metadata, approvals).
3. **Cloud Storage** for the actual media bytes.

**Language rule of thumb:** *language boundary = process boundary, not a rewrite.*
- **Python** = agent orchestration + generation pipelines. **Keep. Do not rewrite in TS.**
- **TypeScript (Cloud Functions/Run)** = thin product glue: Stripe billing, provider webhooks, scheduled campaigns, moderation callbacks, Firestore triggers. Never put agent loops here.
- **React/TS** = the studio UI.
- Share types via OpenAPI→TS codegen and JSON-Schema for briefs/reports/manifests.

> If you accept only one thing from this doc, accept §0. Everything else follows.

---

## 1. Target architecture — GCP/Firebase service mapping

| Concern | Today in DeerFlow | Target service | Effort | Notes |
|---|---|---|---|---|
| **UI hosting** | Next.js dev server | **Firebase Hosting** (static export of the SPA) | Low | Frontend is already "zero server-side logic" — export as SPA or port to Vite. |
| **Identity** | Local JWT + cookie | **Firebase Auth** (Google/email/SSO) | Low–Med | Replace token *validation* in `auth_middleware.py` with a Firebase ID-token verifier; keep `get_effective_user_id()` semantics. OAuth was stubbed anyway. |
| **Agent runtime** | Embedded in Gateway | **Cloud Run** (1 service, min-instances ≥1, high concurrency, 60-min request cap) | Med | Long-running container; the natural home for the Python harness. |
| **Live run state / SSE** | In-memory `StreamBridge` | **Memorystore (Redis)** + new Redis StreamBridge impl | **Med–High** | The one core gap that unlocks multi-instance. A `redis` config slot already exists but currently raises `NotImplementedError` (`runtime/stream_bridge/async_provider.py`) — you implement the bridge behind it. |
| **Agent durable state** | SQLite checkpointer | **Cloud SQL (Postgres)** checkpointer + run store + run events | Low | Already supported (`database.backend: postgres`); just point at Cloud SQL. |
| **Studio domain data** | None | **Firestore** (orgs, projects, campaigns, jobs, assets, approvals, billing) | Med | New domain layer. Real-time listeners for UI. |
| **Media / artifacts** | Local FS `/mnt/user-data/outputs` | **Cloud Storage** (Firebase Storage) + new storage backend | **Med–High** | New abstraction behind `artifacts.py`/`uploads.py` + skill output paths. The defining infra add for a *media* studio. |
| **Sandbox / render exec** | Local / Docker / K8s | **GKE Autopilot pods** (provisioner mode) or AIO Docker | Med–High | Needed for safe shell + heavy local processing (ffmpeg, compositing). |
| **Long-job orchestration** | In-process asyncio task | **Cloud Tasks / Pub/Sub** (+ Cloud Scheduler) | Med | Re-drive resumable runs, retries, scheduled campaigns, fan-out. |
| **Product glue** | — | **Cloud Functions (TS)** + **Eventarc** | Low–Med | Stripe, provider webhooks, Firestore triggers, notifications. |
| **Secrets (model keys)** | `.env` | **Secret Manager** | Low | `GEMINI_API_KEY`, `MINIMAX_API_KEY`, Higgsfield/Canva creds. |
| **Observability** | LangSmith/Langfuse (wired) | Same + **Cloud Logging/Trace** | Low | Already instrumented; just set env vars. |
| **Cost metering** | TokenUsageMiddleware | Extend → Firestore/BigQuery | Med | Add per-render/per-asset cost (model API spend), not just tokens. |

**What you keep verbatim:** the entire `packages/harness/deerflow/` package, the middleware chain, skills, sub-agents, sandbox interface, MCP, models, embedded client. **What you adapt:** the thin `app/` Gateway layer (auth adapter, storage backend, Redis bridge). **What you add:** Firestore domain layer, Cloud Storage backend, job orchestration, studio UI, billing/approvals, moderation.

---

## 2. Why **not** "just Firebase Functions"

| Constraint | Consequence |
|---|---|
| Cloud Functions are short-lived, stateless | Can't host hours-long agent runs or the in-memory StreamBridge. |
| LangGraph/LangChain is Python, heavy | Re-implementing the harness in TS = throwing away the 80% you already have. |
| Sandbox needs containers/Docker/K8s | Functions can't run ffmpeg/headless renders/shell safely. |
| Streaming run state must persist across reconnects | Needs Redis + a long-lived process, i.e. Cloud Run. |

**Use Functions for what they're great at:** event-driven glue (Firestore `onWrite` triggers, Stripe webhooks, provider callbacks, nightly schedulers). Use **Cloud Run** for the brain.

---

## 3. The agent harness, applied to creative production (your core IP)

This is the heart of "the agent harness philosophy for long-running creative production." Map DeerFlow primitives onto a film/agency crew:

### 3.1 The crew (sub-agents)
Define a **custom "Executive Producer" lead agent** (via `SOUL.md`) whose job is to run a production, with specialist **sub-agents**:

| Crew role | DeerFlow sub-agent | Primary skills/tools |
|---|---|---|
| **Executive Producer** (lead) | lead agent (`SOUL.md`) | planning, todos, delegation, approval gates |
| **Strategist / Brief analyst** | sub-agent | brief-intake, research, audience analysis |
| **Copywriter** | sub-agent | copywriting, script-writing skills |
| **Art Director** | sub-agent | moodboard, image-generation (Higgsfield/Canva/Gemini) |
| **Storyboard Artist** | sub-agent | image-generation, layout |
| **Video Producer** | sub-agent | video-generation (Higgsfield/Veo/MiniMax), motion_control |
| **Sound Designer** | sub-agent | music-generation, dubbing/voiceover (Higgsfield/ElevenLabs) |
| **Editor / Compositor** | sub-agent | ffmpeg in sandbox, reframe, upscale, assembly |
| **Brand & Compliance Reviewer** | sub-agent | brand-check, moderation, legal/IP checks |
| **QA / Performance Analyst** | sub-agent | virality_predictor, spec validation |

### 3.2 The techniques (skills)
Each production capability is a `SKILL.md` (+ scripts or MCP calls). Build a `studio/` skill family, e.g. `brief-intake`, `moodboard`, `ad-copywriting`, `storyboard`, `video-shot`, `voiceover`, `music-bed`, `assemble-cut`, `brand-check`, `virality-check`, `package-delivery`. Reuse the shipped `image-generation` / `video-generation` / `music-generation` as the low-level building blocks.

### 3.3 The render farm (external models, via MCP)
Wire external providers as **MCP servers** in `extensions_config.json` (no core change):
- **Higgsfield** — `generate_image/video/audio/3d`, `dubbing`, `upscale_image/video`, `outpaint`, `reframe`, `remove_background`, `motion_control`, `virality_predictor`, marketing studio, personal clipper.
- **Canva** — design generation, brand templates, resize, export (great for static ad sets + brand consistency).
- **Gemini / MiniMax** — already built into the shipped skills.
- **Distribution** — Gmail/Drive/Slack MCPs for delivery + review.

> The dual-provider + MCP design means **no model lock-in**: swap or A/B providers per shot without touching the graph.

### 3.4 Separation of powers (this is also your quality moat)
Mirror a sound governance model (and, conveniently, the operating constitution this project follows):
- **Builders** = generator sub-agents (art/video/sound).
- **Verifier** = Brand & Compliance Reviewer + QA Analyst (automated checks: brand kit conformance, safe-content, spec/resolution/duration, virality score threshold).
- **Approver** = **the human producer** via an interrupt gate (`ask_clarification` → `Command(goto=END)` already implemented).

"The role that builds is not the role that verifies; the role that verifies is not the role that approves." Bake it into the graph and it becomes a *selling point* (auditable, brand-safe AI production), not just hygiene.

---

## 4. The end-to-end workflow (state machine)

A **Production** is a long-running, resumable graph run. Model it as explicit stages, each a **build → verify → attest** batch, with human approval gates between phases:

```
INTAKE ──► PLAN ──► PRE-PRODUCTION ──►[APPROVAL]──► PRODUCTION ──► ASSEMBLY ──► QA/REVIEW ──►[APPROVAL]──► DELIVERY ──►(PUBLISH)
 brief    manifest  concept/script/      gate 1     generate       edit/        brand+      gate 2        package +    optional
          + budget  storyboard/moodboard            shots/audio    compose      compliance                report       distribute
```

| Stage | What happens | DeerFlow primitives | Verify / attest |
|---|---|---|---|
| **Intake** | Parse brief, fill gaps | upload + `brief-intake` skill; `ask_clarification` | brief schema valid (§5) |
| **Plan** | Production manifest: shots, assets, models, budget, timeline | TodoList (plan mode) + manifest artifact | budget within cap; manifest schema valid |
| **Pre-production** | Moodboard, copy, script, storyboard | Art Director + Copywriter sub-agents | concept matches brief; brand kit check |
| **Approval 1** | Human reviews concept | interrupt gate → Firestore `approvals` doc | producer sign-off recorded |
| **Production** | Generate images/video/audio shots | Video/Art/Sound sub-agents → MCP render farm | each asset meets spec; cost logged |
| **Assembly** | Edit, composite, add music/VO, reframe per channel | Editor sub-agent (ffmpeg in sandbox) | renders complete; durations/ratios correct |
| **QA/Review** | Brand, compliance, moderation, virality | Reviewer + QA sub-agents | automated gates pass |
| **Approval 2** | Human approves final | interrupt gate | producer sign-off |
| **Delivery** | Package assets + **Production Report** (§6) | `package-delivery` skill → Cloud Storage | manifest complete; report generated |
| **Publish** | Optional: post/schedule, email client | distribution MCPs | delivery confirmed |

**Long-running mechanics:**
- Checkpointer (Postgres) makes the run **resumable** across the Cloud Run 60-min cap and restarts.
- A **Cloud Tasks** "run-driver" re-invokes the graph after each approval/interrupt and after timeouts (since live `asyncio.Task`s don't survive restarts — see §8 of doc 01).
- Sub-agents fan out heavy generation in parallel; summarization keeps context lean.

---

## 5. Input contract — the Brief

Clients submit a structured brief (a Firestore doc + optional file uploads). Keep it strict (JSON Schema) so the agent and UI agree.

```jsonc
// brief.schema (Firestore: orgs/{org}/projects/{proj}/briefs/{briefId})
{
  "title": "Spring launch — hero video + 6 static ads",
  "client": { "name": "Acme", "brandKitId": "bk_123" },
  "objective": "Drive pre-orders for the new running shoe",
  "deliverables": [
    { "type": "video", "channel": "instagram_reel", "aspect": "9:16", "duration_s": 15, "count": 1 },
    { "type": "image", "channel": "instagram_feed", "aspect": "1:1", "count": 6 }
  ],
  "audience": { "persona": "urban runners 18-34", "tone": "energetic, premium" },
  "mandatories": { "logo": true, "tagline": "Run further.", "legal": ["#ad"] },
  "references": ["uploads/moodboard.pdf", "uploads/last_campaign.mp4"],
  "constraints": { "budget_usd": 40, "deadline": "2026-07-01", "models": { "video": "higgsfield", "image": "auto" } },
  "review_policy": { "gates": ["concept", "final"], "approver": "paul@turwin.ai" }
}
```

---

## 6. Output contract — assets + **the Production Report** (what you asked about)

Two artifacts: a machine-readable **Asset Manifest** (provenance/lineage) and a human-readable **Production Report** (the deliverable summary). Both are generated by the `package-delivery` skill and stored in Cloud Storage + Firestore.

### 6.1 Asset Manifest (provenance for every generated file)
```jsonc
// manifest.json (also Firestore: .../productions/{id}/assets/*)
{
  "production_id": "prod_8f2a",
  "status": "delivered",
  "assets": [
    {
      "id": "asset_hero_v3",
      "kind": "video", "channel": "instagram_reel", "aspect": "9:16", "duration_s": 15,
      "uri": "gs://studio-assets/orgs/acme/prod_8f2a/hero_v3.mp4",
      "preview": "gs://.../hero_v3_thumb.jpg",
      "lineage": {
        "shots": ["asset_shot1_v2", "asset_shot2_v1"],
        "music": "asset_bed_v1", "voiceover": "asset_vo_v2"
      },
      "provenance": { "model": "higgsfield:video", "prompt_ref": "shots/hero.json", "seed": 4412 },
      "checks": { "brand_kit": "pass", "moderation": "pass", "spec": "pass", "virality_score": 0.78 },
      "cost_usd": 6.20, "version": 3, "created_at": "2026-06-28T10:11:00Z"
    }
  ]
}
```

### 6.2 Production Report (the human deliverable)
A Markdown/PDF report the agent writes at delivery. Skeleton:

```markdown
# Production Report — Acme Spring Launch (prod_8f2a)
**Status:** Delivered ✔  **Date:** 2026-06-28  **Producer (approver):** paul@turwin.ai

## 1. Brief recap
Objective, audience, deliverables requested vs. delivered (table).

## 2. Deliverables
| Asset | Channel | Spec | Link | Preview | Checks | Cost |
|-------|---------|------|------|---------|--------|------|
| Hero video v3 | IG Reel | 9:16 · 15s | <gs link> | thumb | brand ✔ mod ✔ virality 0.78 | $6.20 |
| Static set (6) | IG Feed | 1:1 | <links> | grid | ✔ | $1.80 |

## 3. Creative rationale
Concept, tone, how it serves the objective; moodboard + storyboard refs.

## 4. Production log (audit trail)
Stage-by-stage: what each crew member produced, models used, approvals + timestamps,
revisions and why. (Pulled from run events + checkpoints → traceable authority.)

## 5. Quality & compliance attestation
Brand-kit conformance, content-moderation, legal mandatories (#ad, logo, tagline),
spec validation, virality prediction. What passed / what was waived + by whom.

## 6. Cost & usage
Model spend per asset, token usage, total vs. budget ($40 cap → $8.00 used).

## 7. Recommendations / next steps
A/B variants to test, channels to expand, reusable assets added to the library.
```

> This report doubles as your **attestation artifact**: it records who approved what, which model produced each asset, and which checks passed — exactly the "build → verify → attest, with traceable authority" discipline, surfaced to the client as a feature.

---

## 7. Streaming progress to the UI

You have two complementary channels; **use both**:
- **SSE (keep it)** for *live* run output (the agent "thinking," partial text, tool calls) — already implemented end-to-end with `@langchain/langgraph-sdk`. Behind Redis StreamBridge this survives reconnects across Cloud Run instances.
- **Firestore listeners (`onSnapshot`)** for *durable* job/stage/asset/approval state — perfect for a dashboard of in-flight productions, progress bars, and approval inboxes. React Query + Firestore listeners.

Rule: ephemeral token stream → SSE; persistent state transitions → Firestore.

---

## 8. Data model (Firestore + Storage)

**Firestore (product/control plane):**
```
orgs/{orgId}
  members/{uid}                 role, permissions
  brandKits/{bkId}              logo, palette, fonts, tone, do/donts
  projects/{projId}
    briefs/{briefId}            (§5)
    productions/{prodId}        status, stage, threadId(↔ DeerFlow), runId, budget, costSoFar
      stages/{stageId}          status, startedAt, finishedAt, summary
      assets/{assetId}          (§6.1) metadata only; bytes in Storage
      approvals/{apprId}        gate, approver, decision, note, ts
      reports/{reportId}        report uri + summary
billing/{orgId}                 plan, credits, usage
```

**Cloud Storage (asset lake):**
```
gs://studio-assets/orgs/{org}/projects/{proj}/productions/{prod}/
   uploads/  workspace/  shots/  audio/  renders/  deliverables/  report.pdf
```
Sandbox `/mnt/user-data/{uploads,workspace,outputs}` maps to this prefix via the new storage backend; signed URLs serve the React UI directly (offload media from the Gateway).

---

## 9. Reconciling Python / TypeScript / React — concretely

1. **Don't translate languages; isolate them by process.** Python harness on Cloud Run; TS glue in Functions; React in the browser.
2. **One canonical API contract.** The Gateway's OpenAPI is the source of truth → generate a TS client for the React app and for Functions. Brief/Manifest/Report are **JSON Schema**, shared by both sides.
3. **Auth is the seam.** Browser gets a Firebase ID token → sends it to Gateway → a small **Firebase verifier** replaces local JWT validation in `auth_middleware.py`, mapping `uid → user_id`. Functions use Firebase Admin. No duplicated auth logic.
4. **State ownership is explicit.** Agent/run state = Postgres + Redis (Python owns it). Product state = Firestore (TS/React own it). The Gateway writes a thin projection of run progress into Firestore (or a Function mirrors run events) so the UI never has to understand LangGraph internals.
5. **Media never flows through app servers.** Python writes bytes to Cloud Storage; React reads via signed URLs. TS Functions handle post-upload triggers (thumbnails, moderation).

---

## 10. Phased roadmap (crawl → walk → run)

**Phase 0 — Prove the creative pipeline (days, lowest effort).**
Run DeerFlow locally as-is. Wire Higgsfield + Canva as MCP servers in `extensions_config.json`; set Gemini/MiniMax keys. Author 2–3 `studio/` skills + a "Producer" `SOUL.md`. Produce one real ad set end-to-end on local disk. *Goal: validate quality and the crew model before any cloud spend.*

**Phase 1 — Make it cloud-durable (the core engineering).**
- Postgres checkpointer/run-store/run-events on Cloud SQL.
- **Implement the Redis StreamBridge** + move run registry to Redis (Memorystore) → unblocks >1 worker.
- **Implement a Cloud Storage artifact/upload backend** behind `artifacts.py`/`uploads.py` + skill output paths.
- Firebase Auth verifier in the Gateway.
- Deploy Gateway on Cloud Run (min-instances ≥1); React SPA on Firebase Hosting.
- Sandbox: start with AIO Docker on a single Cloud Run-adjacent VM or GKE; plan provisioner/GKE for scale.

**Phase 2 — Studio domain + product.**
Firestore domain model (§8); job orchestration with Cloud Tasks (resume after approval/timeout); approval-gate UI + inbox; Production Report generator; cost metering → Firestore/BigQuery; Stripe billing via Functions; brand-kit + moderation checks.

**Phase 3 — Scale & differentiate.**
Multi-worker Gateway behind the Redis bridge; GKE Autopilot sandbox pools; asset library/DAM with search; templates & brand presets; collaboration/roles; provider webhooks + distribution; A/B + virality optimization loops.

---

## 11. Risks & counterfactuals (what could bite)

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Cloud Run 60-min request cap** kills a long render | High if naive | Background runs + resumable checkpointer + Cloud Tasks re-drive; stream via Redis so reconnect is seamless; keep human gates as natural break points. |
| **Skip Redis bridge, scale anyway** → cancel/reconnect/dedup break | High | Redis StreamBridge is a *prerequisite* for >1 instance. Don't raise concurrency/instances until it's in. |
| **Runaway generation cost** (agent loops, regen storms) | Med–High | GuardrailMiddleware budget provider + per-production `budget_usd` cap enforced pre-tool-call; cost metering + hard stop. |
| **Brand/IP/moderation failures** in generated media | Med | Mandatory Reviewer sub-agent + automated checks + human approval gate before delivery; log attestations in the report. |
| **Sandbox security** (untrusted code in multi-tenant cloud) | Med | Containerized sandbox (GKE/provisioner), per-tenant isolation, no host bash; keep guardrails on. |
| **Model provider outage / quota** | Med | Dual-provider + MCP abstraction → failover per shot; retries via Cloud Tasks. |
| **Firestore/Postgres split drift** (two sources of truth) | Med | One writes, one mirrors: Postgres = agent truth, Firestore = product projection; never edit run state in Firestore. |
| **Media egress costs / hot serving** | Low–Med | Signed URLs + CDN; never proxy big media through Gateway. |
| **Over-engineering before product-market fit** | Med | Do Phase 0 first; don't build DAM/billing before one client loves the output. |

**Counterfactual worth simulating before committing:** *What if a production needs 3 hours and the client reconnects from a new device mid-run?* Under today's in-memory bridge + single worker that breaks. Under Phase-1 (Redis bridge + Postgres checkpointer + Firestore progress + Cloud Tasks driver) it's seamless. That single scenario justifies the Phase-1 investment ordering.

---

## 12. Build / reuse / add — the honest ledger

| Keep as-is (reuse) | Adapt (config/seam-level) | Build new |
|---|---|---|
| `deerflow` harness, middleware chain, sub-agents, sandbox interface, skills engine, MCP, model factory, embedded client, SSE protocol, memory, guardrail hook, custom-agent (`SOUL.md`) system, React SPA + LangGraph SDK client, auth/CSRF shell, Postgres support | Auth → Firebase ID-token verifier (swap the validation step); deploy shell → Cloud Run; frontend hosting → Firebase export; secrets → Secret Manager; persistence → point at Cloud SQL/Postgres | **Redis StreamBridge + Redis-backed run registry** (net-new — the `redis` slot raises `NotImplementedError` today); **Cloud Storage artifact/upload backend** (net-new — only local FS exists); Firestore domain model; studio skills + Producer `SOUL.md`; job orchestration (Cloud Tasks); approval-gate UI; Production Report generator; billing; moderation/brand checks; cost metering; DAM/templates (later) |

The ratio is the headline: **the harness, UI, and persistence *options* are reuse/adapt; the genuinely new engineering is two net-new infra backends (Redis stream bridge, Cloud Storage) plus the studio domain layer (Firestore model, orchestration, approvals, report, billing).** Be honest with yourself: the two infra backends are *real builds*, not small tweaks — Phase 1 lives or dies on them, so budget accordingly.

---

## 13. Open decisions for you

1. **Sandbox in cloud:** GKE Autopilot (scales, more ops) vs. single beefy VM with AIO Docker (simpler, caps scale) for Phase 1? *Recommendation: VM+AIO for Phase 1, GKE in Phase 3.*
2. **Checkpointer/runs DB:** Cloud SQL Postgres (recommended, already supported) vs. trying to force Firestore (not supported by LangGraph checkpointer — avoid).
3. **Frontend:** keep Next.js (static export) vs. port to Vite+React Router. *Recommendation: keep Next.js export for Phase 1; revisit only if it fights Firebase Hosting.*
4. **How "studio-specific" to make it:** a generic harness with studio skills (flexible) vs. a hard-coded production state machine (predictable). *Recommendation: studio skills + a thin orchestrator; keep the harness general.*
5. **Provider strategy:** Higgsfield-first vs. multi-provider from day 1? *Recommendation: Higgsfield + Canva for Phase 0 breadth, abstract via MCP so swapping is free.*
6. **Where the Production happens — chat vs. dashboard:** conversational producer (chat thread) vs. form-driven brief → autonomous run? *Recommendation: brief form → autonomous run with chat available for direction + approvals.*

---

## 14. Bottom line

You are not building an AI production studio from scratch — you are **wrapping a capable, already-creative agent harness in a product**. Keep the Python brain on Cloud Run, put Firebase around it (Auth, Firestore, Storage, Hosting, Functions-as-glue), implement the two missing backends (Redis stream bridge, Cloud Storage), model the studio domain in Firestore, encode the crew + workflow as custom agents/skills, and enforce build→verify→approve gates that double as your quality moat. Start with Phase 0 to validate the creative output this week; let that result decide how fast you fund Phases 1–3.
