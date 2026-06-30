# PlayReggaeMusic.ai — Design Specification

> Premium visual identity + centralized UI system for the public/marketing
> surface. Grounded in research (`docs/design/RESEARCH.md`). Editorial treatment.

## 0. Positioning & concept

**Subject:** an AI-native reggae **label + archive**. Audience: listeners,
licensees, press, and prospective artists who need to believe this is a serious
imprint, not a gimmick. The page's single job: **make the catalog feel like a
credible, collectible archive** — and make buying/licensing obvious.

**Concept — "The Archive & The Desk."** Two ideas from the research fused:
1. *The archive* — Blood & Fire / Studio One reissue discipline: catalog rigor,
   cat-numbers, archival metadata, serious typography, restraint.
2. *The desk* — the dub mixing desk as the label's method: echo, repetition,
   versions. An AI label "re-mixes" tradition into something new.

Heritage is carried by **restraint and one metallic accent**, never tricolor
cliché. The catalog — not a marketing banner — is the hero.

## 1. Color (committed palette)

Dark, warm, archival. **Off-black ground** for the marketing surface; **bone
paper** for long-form reading; **one signature accent: brass gold** (the
heritage carrier). Neutrals are warm-biased (never pure grey/black/white). The
red/green of the tricolor appear ONLY as deep, desaturated "heritage" tones used
sparingly (seals, dividers on dark) — never as flat tricolor fields.

| Token | Hex | Role |
|---|---|---|
| `--ink-950` | `#14110D` | primary dark ground (warm near-black) |
| `--ink-900` | `#1C1813` | raised dark surface / cards on dark |
| `--ink-800` | `#2A241C` | hairlines & borders on dark |
| `--bone-50` | `#F4EFE4` | paper ground (long-form), text on dark |
| `--bone-100`| `#E9E1D1` | secondary paper / muted light |
| `--sand-400`| `#A89C84` | muted text (warm grey, hue-biased) |
| `--brass-500` (accent) | `#C79A3A` | THE accent — links, CTAs, emphasis, seal |
| `--brass-600` | `#A87F28` | accent hover/active |
| `--roots-700` | `#1E4D38` | deep heritage green — rare, dividers/seal on dark |
| `--oxblood-700` | `#7E2B22` | deep heritage red — rare, never a field |

Semantic (admin/UI state only, NOT the accent): success `#2E7D52`, warn
`#B5851F`, danger `#B23A2E`. These never appear on marketing pages.

Discipline: **one accent (brass).** Boldness is spent on type + dub-echo motion,
not on a second hue. Roots-green/oxblood are heritage seasoning at <2% surface.

## 2. Typography (committed)

Self-hosted OSS variable fonts (no CDN; bundled via `@fontsource*`).

- **Display — Fraunces (variable).** The heritage/editorial voice. High optical
  size, raised contrast + slight SOFT for warmth. Hero, headings, pull quotes.
  `text-wrap: balance`, tight leading (1.02–1.08) at large sizes.
- **Body / UI — Inter (variable).** Calm, neutral system face. Paragraphs, nav,
  buttons, forms, captions. Running text ~62–68ch.
- **Metadata — Space Mono.** Catalog numbers (`PRM-001`), track times, eyebrows,
  dates, format tags. `tabular-nums`. This is the archival "dub-plate stamp"
  texture and the system's connective tissue.

Type scale (fluid where it earns it):
`--fs-display` clamp(2.75rem, 7vw, 6rem) · `--fs-h1` clamp(2rem,4vw,3.25rem) ·
`--fs-h2` clamp(1.5rem,2.5vw,2.25rem) · `--fs-h3` 1.25rem · `--fs-body` 1.0625rem
· `--fs-sm` 0.9375rem · `--fs-mono` 0.8125rem (eyebrows: 0.75rem, letter-spacing
0.14em, uppercase).

## 3. Layout & spacing

- Container max 1200px; reading max 68ch; gutters via grid `gap`, never ad-hoc
  margins. 8px spacing base (`--s-1`=4 … `--s-8`=64, plus `--s-10`=96).
- **Asymmetric editorial hero** — newest release as the thesis: oversized title
  (Fraunces), mono cat-number eyebrow, large artwork off to one side.
- **Catalog = artwork-forward square grid**, 2/3/4 up responsive; minimal meta on
  the tile (mono cat-no + title), more on hover.
- Long-form pages switch to **bone paper** ground with a single reading column.
- Radii: small and deliberate — `--r-sm` 4px, `--r-md` 8px, art tiles square
  (radius 2px). No uniform 16px-rounded-everything.
- Hairlines: 1px `--ink-800` on dark / `--bone-100` on paper — used to separate
  index rows and metadata, not to box everything.

## 4. Motion (sub-300ms, functional, reduced-motion safe)

- **Dub-echo wordmark:** the hero wordmark casts 1–2 offset ghost copies in
  brass at low opacity (the "version"/echo) — static, CSS only.
- **Marquee ticker:** a slow edge-faded mono ticker of catalog numbers + phrases
  ("DUB AS SYSTEM, NOT SYMBOL · PRM-001 · ROOTS UNTOLD …"), pause-on-hover.
- **Staggered reveal** on scroll (opacity 0→1, y 10px→0, ~240ms, 40ms stagger).
- **Artwork hover:** scale 1.0→1.03, caption fade — sub-200ms.
- All wrapped in `@media (prefers-reduced-motion: reduce)` → no transforms, no
  marquee animation (ticker becomes a static line), instant opacity.

## 5. Centralized component system (`src/components/ui/`)

One library; every page composes from it. No bespoke page CSS beyond layout.

Primitives: `Container`, `Page` (ground=dark|paper), `Eyebrow`, `Button`
(primary|ghost|link), `Tag`, `Badge`/`AiBadge`, `Hairline`, `Prose`, `Seal`
(brand mark), `Marquee`, `Reveal` (reduced-motion-safe wrapper).
Composites: `SiteHeader` (sticky slim nav), `SiteFooter`, `Hero`, `ArtworkTile`,
`ReleaseCard`, `ArtistCard`, `SectionHeading`, `MetaRow`, `TrackRow`/player,
`CTASection`, `LicenseNote`.

All styling via one tokens file + one components stylesheet (CSS, class-based,
specificity-flat). Components are presentational; data wiring stays in pages.

## 6. Pages (public/marketing surface)

1. **Landing (`/`)** — catalog-as-hero: newest release thesis + dub ticker +
   artwork grid + artist spotlight + "what this is" (AI-native, disclosed) +
   licensing CTA + footer. The marketing centerpiece.
2. **Releases (`/releases`)** — archival catalog grid; mono cat-numbers; hover.
3. **Release detail (`/releases/:id`)** — artifact page: big artwork, mono
   tracklist with inline players, buy, provenance + license note.
4. **Artists (`/artists`)** + **Artist (`/artists/:id`)** — roster + profile.
5. **About (`/about`)** — the imprint story, the "archive & desk" thesis, how an
   AI label works, disclosure ethos. Bone paper, editorial.
6. **Licensing (`/licensing`)** — sync/licensing pitch + how to request.
7. **Terms (`/terms`)**, **Privacy (`/privacy`)** — legal, bone paper, `Prose`.
8. **Press / Contact (`/press`)** — boilerplate, assets, contact.

Copy is real and on-brand (no lorem). AI provenance is disclosed everywhere a
release appears (legal + ethical requirement already in the app).

## 7. Accessibility & quality gates

- WCAG AA contrast for text on both grounds (brass-on-ink and ink-on-bone
  verified). Visible keyboard focus (brass ring). Semantic landmarks/headings.
- `prefers-reduced-motion` honored. No layout shift from fonts (font-display
  swap + sized fallbacks). Body never scrolls sideways.
- Existing automated suites stay green (web unit + a11y + E2E); test copy hooks
  preserved or tests updated and re-run.

## 8. Non-goals

Admin/agent console pages keep their utilitarian treatment (they're tools, not
marketing) — they inherit tokens/typography but are out of scope for the
editorial redesign. No live external integrations touched.
