# Phase 2 — Record-Label Gap Analysis (research → autonomous-AI equivalent → what we built → gaps)

> Research-backed planning artifact. Pairs with `MANIFEST-PHASE2.md` (the runnable loop).
> Sources are live web research (June 2026); music-business structure is well-established, so confidence is high where sources corroborate. Integration specifics (distributor/PRO APIs) are confirmed at implementation time.

## 1. How a record label is actually set up (research)

A label is a set of **functions/departments** that take music from idea to monetized, accounted-for release:

| # | Function (department) | What it does |
|---|----------------------|--------------|
| F1 | **A&R** (Artists & Repertoire) | Discover/sign talent; develop the artist + repertoire; decide what to release. |
| F2 | **Recording / Production** | Produce masters; mix/master; create deliverable audio + artwork. |
| F3 | **Metadata & Rights** | Assign identifiers — **ISRC** (recording), **UPC/GTIN** (release), **ISWC** (composition); credits, ownership **splits**. Mandatory for distribution. |
| F4 | **Distribution / DSP delivery** | Deliver releases to Spotify/Apple/etc. via distributor/aggregator using **DDEX ERN** (XML); schedule releases; handle rejections/takedowns. |
| F5 | **Marketing & Promotion** | Publicity, digital/social, **playlist pitching**, email, paid ads, release campaigns. |
| F6 | **Sales / D2C commerce** | Sell downloads/merch direct to fans. |
| F7 | **Royalty accounting & finance** | Track revenue by source/release; **recoupment**; artist **royalty statements**; payouts; tax. |
| F8 | **Publishing admin** | Register compositions (ISWC); affiliate **PRO**(ASCAP/BMI)/**MLC**; collect mechanical/performance royalties; splits. |
| F9 | **Sync / Licensing** | License master + composition for film/TV/games; clearances; issue licenses. |
| F10 | **Legal / Contracts** | Artist agreements; ownership %, consent; **AI-content disclosure/compliance**. |
| F11 | **Analytics / Insights** | Streaming/sales/audience data → feeds A&R + marketing decisions. |

Sources: [Orphiq — Record Label Operations](https://orphiq.com/resources/record-label-operations-guide), [Soundcharts — How the Recording Industry Works](https://soundcharts.com/en/blog/mechanics-of-the-recording-industry), [Ditto — What is A&R](https://dittomusic.com/en/blog/what-is-a-and-r-and-how-does-it-work), [BeatsToRapOn — ISRC/ISWC/UPC/DDEX](https://beatstorapon.com/blog/music-metadata-isrc-iswc-upc-ddex/), [fwdmusic — ISRC vs UPC 2026](https://fwdmusic.com/en/news/isrc-vs-upc-codes-music-distribution), [Soundcharts — Performance vs Mechanical](https://soundcharts.com/en/blog/performance-royalties-vs-mechanical), [Royalty Exchange — Sync](https://royaltyexchange.com/blog/the-complete-guide-to-synchronization-royalties), [Musicians Institute — Publishing vs Masters](https://www.mi.edu/in-the-know/music-copyright-law-publishing-rights-masters-rights-royalties/).

## 2. The autonomous-AI-era equivalent

An **autonomous AI label** replaces each department with an agent capability + tools + (where external) a pluggable adapter, under human-in-the-loop approval for consequential actions:

| Function | Autonomous-AI equivalent |
|---|---|
| F1 A&R | Agent generates/curates artists + repertoire; data-driven "what to release next." |
| F2 Production | AI music generation upstream; agent ingests masters + auto-makes preview clips; AI-provenance metadata (C2PA-style). |
| F3 Metadata/Rights | Auto-assign/validate ISRC/UPC/ISWC; structured credits + ownership splits; AI-disclosure fields. |
| F4 Distribution | Agent builds a **DDEX-valid** delivery package; distributor-adapter delivers (test-mode); schedule + live-status. |
| F5 Marketing | Agent plans campaigns, writes copy/assets, schedules social/email, pitches playlists. |
| F6 Sales | Polar D2C storefront (already built). |
| F7 Royalties | Agent ingests multi-source revenue, computes splits/recoupment, issues statements, proposes payouts. |
| F8 Publishing | Agent registers works, tracks PRO/MLC affiliation + splits + collection. |
| F9 Sync | Agent runs a sync catalog, handles requests + clearances + license issuance. |
| F10 Legal | Agent manages contracts, ownership records, consent, AI-disclosure compliance. |
| F11 Analytics | Agent ingests stats, produces insights, closes the loop into A&R/marketing. |
| F12 **Autonomy orchestration** (new, AI-specific) | Scheduler for autonomous runs; planner; **approval gates** for spend/publish/payout; full **agent audit log** + guardrails. |

## 3. What we built (Phase 1: B01–B07 + P1/P2) vs. gaps

| Function | Built? | Evidence | Gap |
|---|---|---|---|
| F1 A&R | **Partial** | catalog data model; agent `create_artist/release/track/product` tools; `release-curator` skill | No generation/persona pipeline; no data-driven release decisioning |
| F2 Production | **Partial** | `Track` has `previewClipPath` + private `masterPath` (track_masters); Storage rules | No asset ingestion/transcoding; no preview-clip generation; masters assumed pre-existing; no AI-provenance metadata |
| F3 Metadata/Rights | **Minimal** | label-internal `catalogNumber`; `aiGenerated` flag | **No ISRC/UPC/ISWC; no credits; no ownership splits; no validation** |
| F4 Distribution | **None** | artist pages link *out* to Spotify/Apple | **No DDEX delivery to DSPs; no distributor adapter; no scheduling** — the biggest "what a label does" gap |
| F5 Marketing | **Minimal** | `catalog-copywriter` skill (copy only) | No campaign engine; no social/email/playlist-pitch; no scheduling |
| F6 Sales/D2C | **Yes** ✅ | B06 Polar checkout + entitlement + catalog UI | (Healthy) |
| F7 Royalties | **Minimal** | order mirror; basic admin revenue view | No split/recoupment engine; no artist statements; no payouts; only D2C revenue source |
| F8 Publishing | **None** | — | Entire publishing side absent |
| F9 Sync/Licensing | **None** | personal-listening license only | No sync catalog / license issuance |
| F10 Legal/Contracts | **Minimal** | placeholder personal-license; AI badge | No artist contracts/ownership records; no consent/compliance store |
| F11 Analytics | **Minimal** | orders/revenue view | No DSP/sales analytics ingestion; no insights; no decision loop |
| F12 Autonomy orchestration | **Partial** | on-trigger agent runs via console; memory; checkpointer | **No scheduler; no autonomous planner; no approval guardrails for consequential actions; no agent audit log** |

**Headline:** Phase 1 built a solid **agent engine + D2C storefront + catalog back-office**. To be a label that *does what a label does, autonomously*, the load-bearing gaps are: **distribution (F4) + metadata/rights (F3) + royalties (F7) + autonomy orchestration with approvals/audit (F12)**, then publishing/sync/marketing/analytics (F8/F9/F5/F11).

## 4. Constraints carried into Phase 2 (from the constitution + §9 boundary)
- Every external integration (distributor, PRO/MLC, social, email, payouts) is built **test-mode/mock behind a pluggable adapter**; live = owner-side at handoff (as we did for Polar). No live secrets without operator approval.
- Consequential autonomous actions (publish to DSP, spend on ads, initiate payout) **must pass a human-in-the-loop approval gate** — this is both good label practice and constitution §13 (bounded autonomy).
- Same loop per batch: build → gate → independent verify (≠builder) → attest (SHA256, append-only) → retro. Same gate set (types/lint/test/emulator/build/e2e). harness↛app firewall preserved.
