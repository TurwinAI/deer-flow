# Phase-2 Summary — convenience index (NOT an attestation)

> Read-only index of the Phase-2 batches + the full operator handoff item list.
> This file is a convenience map only. The authoritative records are the
> per-batch `attestations/P2B0X-attestation.md` (+ SHA256) and
> `retro/P2B0X-retro.md` — this summary does NOT modify or replace any of them.

## Batches (P2B01–P2B10)

| Batch | Function | One-liner |
|-------|----------|-----------|
| **P2B01** | F3 Metadata & Rights | ISRC/UPC/ISWC fields + validators, credits, ownership splits (sum to 100) on Release/Track; admin tools to set them. |
| **P2B02** | F2 Production assets | Master/preview asset pipeline (admin upload to private `masters/`, preview-clip generation behind an injectable encoder) + C2PA-style AI-provenance records. |
| **P2B03** | F4 Distribution | DDEX **ERN** package builder + structural validation, pluggable `DistributorClient` (Fake in tests), release scheduling + live-status mirror; deliver is approval-gated. |
| **P2B04** | F12 Autonomy orchestration | Scheduler adapter + bounded planner + the generic **ApprovalGate** (blocks consequential tool calls pending human approval) + full agent **audit log**. |
| **P2B05** | F7 Royalties & finance | Multi-source revenue ingestion (Polar + Fake DSP/PRO) + cent-exact split/recoupment engine + per-artist royalty **statements** (reconcile) + payout **proposals** (no live rail). |
| **P2B06** | F8 + F9 Publishing & sync | Works registry (ISWC) + writer splits + PRO/MLC affiliation (Fake registrar) + sync catalog with request → clearance → issued-license (issuing approval-gated). |
| **P2B07** | F5 Marketing & promotion | Campaign planner + copy generation + injectable social/email/playlist/ad **channels** (Fake in tests); public posting, email, and spend are approval-gated. |
| **P2B08** | F11 + F1 Analytics & A&R | Analytics ingestion (Polar sales + Fake DSP-stats) + deterministic insight reports + A&R recommendations (propose-only). |
| **P2B09** | F10 Legal/Compliance | Artist agreement records (ownership %, term, AI consent) + owner-supplied structured license terms + a hard pre-distribution **compliance gate** wired into `deliverRelease`. |
| **P2B10** | Docs + E2E + handoff | Web human-in-the-loop admin pages (approvals/distribution/royalties), the `phase2Flow` full-chain emulator proof, the Phase-2 Playwright E2E, and the finalized handoff docs. |

## Full operator handoff item list (see docs/HANDOFF_CHECKLIST.md)

Legal/content:
- Binding personal-download license + sync wording via `setLicenseTerms`.
- Active artist agreements (ownership %, term, AI-generation consent).
- AI-disclosure copy review (badge + terms + per-track provenance).

Credentials & secrets (each real adapter throws without its token):
- `ANTHROPIC_API_KEY` — agent model.
- `POLAR_ACCESS_TOKEN` + `POLAR_WEBHOOK_SECRET` — D2C checkout/webhook.
- `DISTRIBUTOR_API_TOKEN` — DSP delivery (DDEX) + DSP revenue.
- `PRO_API_TOKEN` — PRO/MLC affiliation + publishing income.
- `SOCIAL_API_TOKEN` / `EMAIL_API_TOKEN` / `ADS_API_TOKEN` / `PLAYLIST_API_TOKEN`
  — marketing channels.
- `DSP_STATS_API_TOKEN` — analytics ingestion.
- Firebase project + `VITE_FIREBASE_*` web config + owner `admin` claim.

Live wiring (beyond a single token):
- Payout rail (no live rail; execution stops at a no-money stub, gated).
- Real PreviewEncoder (ffmpeg) — build ships an unconfigured stub.
- Real Scheduler (Cloud Scheduler / PubSub) — tests use FakeScheduler.
- ERN XSD validation against the distributor's required DDEX schema version.

Quality / CI:
- chromium-for-E2E (binary or `PLAYWRIGHT_BROWSERS_PATH`); `pnpm test:e2e` green.
- Real-browser color-contrast a11y audit (jsdom disables the rule).

Sign-off:
- Re-run all gates (web 5 incl. E2E; functions 5 + boundary) with fresh evidence;
  independent verifier (≠ builder) confirms; operator approves READY (no
  self-release).
