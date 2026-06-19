# Production Studio — planning drafts

Working drafts for evolving DeerFlow into a multi-tenant, Firebase + React **AI production studio**
(long-running agent crews producing ad campaigns/videos with external generative models).

These are **planning documents**, not code changes.

## Read in this order
1. **[01-understanding-deerflow.md](./01-understanding-deerflow.md)** — what DeerFlow 2.0 is and what it can do *today*. Architecture, the five superpowers, persistence/state, multi-tenancy, honest limits. Every claim cited to repo files.
2. **[02-firebase-react-studio-blueprint.md](./02-firebase-react-studio-blueprint.md)** — the conversion plan: the two-plane architecture (Firebase product plane + Python agent plane on Cloud Run), GCP service mapping, how the agent harness maps to a production crew, the end-to-end workflow, input (brief) and output (asset manifest + **Production Report**) contracts, Python/TS/React reconciliation, a phased roadmap, risks/counterfactuals, and a reuse-vs-build ledger.

## The 60-second version
- DeerFlow is a **super agent harness** (LangGraph/Python brain + React 19 SPA). ~**80% of a production studio already exists**: sub-agents, sandbox, skills, memory, streaming API, auth, per-user isolation, and **working image/video/music skills**.
- **Don't rewrite Python in TypeScript for Firebase.** The agent brain runs on **Cloud Run**; **Firebase is the product layer** (Auth, Firestore, Storage, Hosting) and **TS Cloud Functions are glue**. Language boundary = process boundary.
- The **two genuinely new infra pieces** are a **Redis-backed stream bridge** (unblocks scaling past 1 worker) and a **Cloud Storage backend** for media (today artifacts live on local disk). Everything else is reuse + adapt + a new studio domain layer in Firestore.
- External models (**Higgsfield, Canva**, Gemini, MiniMax) plug in as **skills or MCP servers** — no core changes, no lock-in.

## Status / provenance
- Authored: 2026-06-19. Mode: research + proposal (no production code modified).
- Verification: architectural claims traced to repo files; see citations inline and the verification note appended to doc 01/02 during review.
- Open decisions awaiting the team are listed in §13 of the blueprint.
