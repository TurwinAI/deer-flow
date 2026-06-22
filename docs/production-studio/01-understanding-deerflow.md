# Understanding DeerFlow 2.0 — What You Already Have

> **Audience:** the team turning this into a production studio.
> **Confidence:** High. Every architectural claim below is traceable to files in this repo (paths cited inline). Recommendations are clearly labelled as such.

---

## 1. TL;DR

**DeerFlow 2.0 is not a research chatbot. It is a "super agent harness" — effectively an operating system for long-running AI agents.** It gives an LLM a real computer (sandboxed filesystem + shell), a way to learn new abilities on demand (skills), a way to split work across a crew (sub-agents), durable memory, and a production-grade API/streaming layer. It is built on **LangGraph + LangChain (Python)** with a **Next.js/React 19 frontend**, and it already ships skills for **image, video, music, podcast, and slide generation**.

For your goal — *a multi-tenant AI production house that runs long agent crews to make ad campaigns and videos with external models* — **roughly 80% of the engine already exists.** What's missing is mostly *productization*: object storage for media, horizontally-scalable run state, a studio domain model, approval/billing, and a cloud deployment. Those are the subject of the companion doc, `02-firebase-react-studio-blueprint.md`.

---

## 2. The mental model: a harness, not a workflow

Most "AI workflow" tools are a fixed graph you wire by hand. DeerFlow is the opposite: a **general-purpose runtime** where a *lead agent* decides what to do, loads abilities as needed, and spawns helpers. The README puts it precisely:

> "DeerFlow 2.0 is no longer a framework you wire together. It's a super agent harness — batteries included, fully extensible … a filesystem, memory, skills, sandbox-aware execution, and the ability to plan and spawn sub-agents." (`README.md`)

Think of it as: **the LLM is the CPU; DeerFlow is the OS** (filesystem, processes, drivers, package manager, IPC).

| OS concept | DeerFlow equivalent |
|---|---|
| Process | A **run** (one agent invocation on a thread) |
| Filesystem | **Sandbox** `/mnt/user-data/{uploads,workspace,outputs}` |
| Installable packages | **Skills** (`SKILL.md` capability modules) |
| Subprocess / threads | **Sub-agents** (delegated, isolated context) |
| Device drivers | **Tools** (built-in, MCP, community) |
| Persistent disk | **Memory** + **checkpointer** + **run store** |
| Syscalls/IPC | **Gateway API** (LangGraph-compatible HTTP + SSE) |

---

## 3. Architecture at a glance

Four services (see `backend/CLAUDE.md`, `docker/docker-compose.yaml`, `docker/nginx/nginx.conf`):

```
                         ┌─────────────────────────────────────────────┐
  Browser / IM / CLI ──► │  nginx  (:2026)  — single same-origin entry  │
                         └───────────────┬─────────────────────────────┘
                            /             │                    \
            /  (non-API)    │  /api/langgraph/*  → /api/*       │  /api/*
                 ▼          ▼                                   ▼
         ┌───────────┐  ┌──────────────────────────────────────────────┐
         │ Frontend  │  │ Gateway (FastAPI, :8001)                       │
         │ Next.js   │  │  • REST routers (models, skills, threads,      │
         │ React 19  │  │    uploads, artifacts, memory, agents, auth…)  │
         │ (:3000)   │  │  • EMBEDDED LangGraph runtime:                 │
         └───────────┘  │      RunManager + run_agent() + StreamBridge   │
                        │      (the actual agent brain runs here)        │
                        └───────────────┬──────────────────────────────┘
                                        │ acquires
                                        ▼
                        ┌──────────────────────────────────────────────┐
                        │ Sandbox  (Local FS │ Docker/AIO │ K8s pods)   │
                        │  per-thread /mnt/user-data/{...}              │
                        └──────────────────────────────────────────────┘
   (optional) Provisioner (:8002) manages Kubernetes sandbox pods
```

**Critical fact:** the agent runtime is **embedded inside the Gateway process** (`backend/packages/harness/deerflow/runtime/`). There is no separate "agent server." This shapes every deployment decision later.

### The harness/app split (matters for reuse)

The backend enforces a strict dependency boundary (`backend/tests/test_harness_boundary.py`):

- **`packages/harness/deerflow/`** — the *publishable* agent framework (`deerflow-harness`). Orchestration, tools, sandbox, models, skills, MCP, memory, the embedded client. **This is the reusable IP.**
- **`app/`** — the FastAPI Gateway + IM channels. The deployment shell around the harness.
- **Rule:** `app` imports `deerflow`; `deerflow` never imports `app`.

> **Why you care:** you can keep the entire harness untouched and replace/extend only the thin `app` layer when you move to the cloud. The harness even ships an **embedded Python client** (`DeerFlowClient`, `packages/harness/deerflow/client.py`) that gives you the full agent in-process with no HTTP — useful for workers and tests.

---

## 4. The agent runtime

**Lead agent** (`packages/harness/deerflow/agents/lead_agent/agent.py`): entry point `make_lead_agent(config)`, registered in `backend/langgraph.json`. It picks a model dynamically, assembles tools, and builds a system prompt that advertises the available skills, memory, and sub-agents.

**Runtime flags** (`config.configurable`) toggle behavior per run:
- `thinking_enabled` — extended reasoning
- `model_name` — which LLM
- `is_plan_mode` — enables the TodoList middleware (task tracking)
- `subagent_enabled` — enables delegation

**The middleware chain is where the "harness" magic lives.** A chain of ~15–20+ middlewares (the exact count depends on which features are enabled; the full ordered list is in `backend/CLAUDE.md`) runs around every model call. The ones most relevant to a production studio:

- **ThreadDataMiddleware** — creates per-user, per-thread working directories.
- **SandboxMiddleware** — acquires the execution environment.
- **GuardrailMiddleware** — *pluggable pre-tool-call authorization* (allowlist or policy provider). **This is your budget/safety enforcement point.**
- **SkillActivationMiddleware** — `/skill-name` loads a skill's instructions for the current turn only.
- **SummarizationMiddleware** — compresses context on long runs (essential for hours-long jobs).
- **SubagentLimitMiddleware** — caps concurrent sub-agents.
- **TokenUsageMiddleware** — meters tokens (your cost accounting hook).
- **MemoryMiddleware** — queues durable memory updates.
- **ClarificationMiddleware** — turns `ask_clarification` into a **human-in-the-loop interrupt** (your approval gates).

**ThreadState** (`agents/thread_state.py`) carries `sandbox`, `artifacts`, `todos`, `uploaded_files`, `viewed_images`, `title` — i.e. everything a "production job" needs to track.

---

## 5. The five superpowers

### 5.1 Skills — abilities as Markdown + scripts
A skill is a directory with `SKILL.md` (YAML frontmatter: `name`, `description`, `license`, `allowed-tools`) plus optional scripts/resources. Skills are **loaded progressively** (only when relevant) to keep context lean. Users can force one with `/skill-name`. Discovery/loading: `packages/harness/deerflow/skills/`.

**Creative skills already shipped** (`skills/public/`): `image-generation`, `video-generation`, `ppt-generation`, `music-generation`, `podcast-generation`, `frontend-design`, plus research/report/data skills. **This is your starting production toolkit.**

### 5.2 Sub-agents — a crew, not a soloist
The lead agent can spawn sub-agents via the `task` tool. Each runs in **isolated context** with its own tools and termination conditions, in parallel when possible, then reports a structured result back (`subagents/executor.py`, `registry.py`). Built-ins: `general-purpose`, `bash`. Defaults: max 3 concurrent, 30-min timeout, 150 turns. **This is the mechanism for a "production crew."**

### 5.3 Sandbox & filesystem — a real computer
Every thread gets an execution environment with `/mnt/user-data/{uploads,workspace,outputs}` and `/mnt/skills`. Three providers (`sandbox/`, `community/aio_sandbox/`):
- **LocalSandboxProvider** — filesystem isolation on the host (bash off by default).
- **AioSandboxProvider** — isolated Docker containers (needs Docker socket).
- **Provisioner/Kubernetes** — sandbox pods via the provisioner service (scales, stateless to Gateway).

### 5.4 Memory — it remembers across sessions
Per-user persistent memory (`agents/memory/`): profile, preferences, facts (with confidence), context. Stored at `.deer-flow/users/{user_id}/memory.json`, injected into the system prompt. Async, debounced, deduplicated.

### 5.5 Context engineering — survives long jobs
Isolated sub-agent contexts, aggressive summarization, offloading intermediate results to the filesystem, strict tool-call recovery. This is *why* it can run "minutes to hours" without blowing the context window.

---

## 6. Creative capabilities **today**

The shipped image/video/music skills work by writing a **structured JSON prompt** to the workspace, then calling a **Python script** that hits an external model API, saving the result to `/mnt/user-data/outputs/`:

- **Image / Video** (`skills/public/image-generation`, `video-generation`): auto-select **Gemini** (`GEMINI_API_KEY`) or **MiniMax** (`MINIMAX_API_KEY`) via env var; `scripts/generate.py --prompt-file … --reference-images … --output-file …`.
- **Music** (`music-generation`): MiniMax `/v1/music_generation`.
- **PPT** (`ppt-generation`): chains image-gen → composes a deck.

**Two ways to add more/better models — both already supported:**
1. **As a skill** — drop in a new `SKILL.md` + script that calls any API. No core changes.
2. **As an MCP server** — register a tool server in `extensions_config.json`; the agent calls its tools directly.

> **Highly relevant to you:** this very environment is already connected to creative-production MCP servers — **Higgsfield** (`generate_image/video/audio/3d`, `dubbing`, `upscale`, `outpaint`, `reframe`, `remove_background`, `motion_control`, `virality_predictor`, marketing studio, personal clipper) and **Canva** (design generation, brand templates, export), plus **Gmail/Drive/Slack** for delivery. These are exactly the "external models, end-to-end" you described — and they slot into DeerFlow as MCP tools or skill backends without touching the core. (They are *pluggable*, not yet wired into `extensions_config.json`.)

---

## 7. How work flows (request → deliverable)

1. Client creates a **thread**, sends a message (the brief). Files can be uploaded to the thread first (`POST /api/threads/{id}/uploads`, auto-converts PDF/PPT/Excel/Word).
2. A **run** starts (`POST /api/threads/{id}/runs/stream`). `RunManager` registers an in-memory `RunRecord` with an `asyncio.Task`; `run_agent()` drives `graph.astream()`.
3. Events stream out over **SSE** via the `StreamBridge` (LangGraph protocol: `values`, `messages-tuple`, `custom`, `end`). The frontend consumes them with `@langchain/langgraph-sdk`.
4. The agent plans, loads skills, spawns sub-agents, runs tools in the sandbox, and writes deliverables to `/mnt/user-data/outputs/`.
5. It calls `present_files` to surface outputs; the UI renders artifacts (`GET /api/threads/{id}/artifacts/{path}`).
6. Runs can be **backgrounded, joined, cancelled, and waited on** (`thread_runs.py` router). Memory updates queue asynchronously.

---

## 8. Persistence & state (read this twice)

| Layer | Engines | Default | Durable? | File |
|---|---|---|---|---|
| **Checkpointer** (LangGraph thread state, enables resume) | memory / sqlite / **postgres** | memory | if sqlite/pg | `config/checkpointer_config.py` |
| **App database** (run metadata, channel connections) | sqlite / **postgres** | sqlite | yes | `config/database_config.py` |
| **Run events** (messages + traces) | memory / db / jsonl | memory | if db/jsonl | `config/run_events_config.py` |
| **Run registry** (`RunRecord`, abort, task) | **in-process memory** | — | **no** | `runtime/runs/manager.py` |
| **StreamBridge** (live SSE event log) | **in-process memory only** | — | **no** | `runtime/stream_bridge/memory.py` |
| **Memory** (per-user facts) | JSON files | — | yes | `agents/memory/storage.py` |
| **Artifacts/uploads** (incl. media) | **local filesystem** | — | host disk | `routers/artifacts.py`, `uploads.py` |

**The two facts that drive the whole cloud design:**
1. **`StreamBridge` and the run registry are in-process memory.** That's why production pins `GATEWAY_WORKERS=1` — with >1 worker, cancel/reconnect/dedup break (a Redis-backed bridge is the documented-but-unbuilt fix). *This is the scaling wall.*
2. **Generated media lives on the local filesystem.** Fine for one host; **not viable for a multi-tenant media studio.** You need object storage.

---

## 9. Multi-tenancy & auth — already present

- **Auth exists today** (`backend/app/gateway/auth_middleware.py`, `routers/auth.py`): local email/password → **JWT in an HttpOnly cookie**, CSRF double-submit, login rate-limiting, a `/login` + `/setup` UI on the frontend, and **OAuth placeholders for Google/GitHub (return 501 — not yet implemented)**. A `DEER_FLOW_AUTH_DISABLED=1` no-auth mode exists for dev.
- **Per-user isolation exists** (`runtime/user_context.py`): `get_effective_user_id()`, data partitioned under `.deer-flow/users/{user_id}/…`, `RunRow.user_id` indexed.

> **Implication:** you are *not* starting multi-tenancy from zero. Moving to Firebase Auth is largely **swapping the token-validation step**, not building accounts/isolation from scratch.

---

## 10. Extensibility surfaces (where you plug in)

| You want to… | Plug in at… | Core change? |
|---|---|---|
| Add a generation model | New **skill** or **MCP server** | No |
| Add a "Producer" persona | **Custom agent** (`SOUL.md` + `config.yaml`; `setup_agent`/`update_agent` tools, `routers/agents.py`) | No |
| Enforce budgets / safety | **GuardrailMiddleware** provider | No (config) |
| Add a tool | Python function + `config.yaml`, or MCP | No |
| Change LLMs | `models[]` in `config.yaml` (OpenAI-compatible, vLLM, Codex/Claude CLI…) | No |
| Receive jobs from chat apps | **IM channels** (Slack/Telegram/Feishu/Discord/DingTalk) | No (config) |
| Observe runs | LangSmith / Langfuse (env vars) | No |

This extensibility is the reason a production studio is an *adaptation*, not a rewrite.

---

## 11. What DeerFlow is **not** (honest limits)

- **Not horizontally scalable as-is** — single Gateway worker; in-memory run/stream state (§8).
- **No object storage** — media on local disk (§8).
- **Not a turnkey SaaS** — no billing, no org/team model, no quotas, no asset library/DAM, no project/campaign domain model.
- **Sandbox needs containers** for safe shell execution (Docker socket or K8s) — a real cloud infra dependency.
- **Background runs don't auto-resume after a crash** — the checkpointer restores *thread state* for a new invocation, but the live `asyncio.Task` is lost; something must re-drive long jobs.
- **No content moderation / IP / brand-safety layer** for generated media (you must add it).
- **OAuth login is stubbed** (Google/GitHub return 501).

None of these are blockers. They are precisely the scope of the production-studio build — see `02-firebase-react-studio-blueprint.md`.

---

## 12. One-paragraph summary

DeerFlow gives you a **model-agnostic, skill-extensible, sub-agent-capable, sandboxed, memory-equipped agent runtime** with a **LangGraph-compatible streaming API**, a **React 19 frontend that's effectively an SPA**, **existing auth and per-user isolation**, **Postgres-ready persistence**, and **working image/video/music skills** — all under an MIT license. The path to a production studio is to (a) make state and storage cloud-durable, (b) wrap it in a studio domain model + the right external models, and (c) deploy the Python brain on a long-running container platform with Firebase as the product layer around it.
