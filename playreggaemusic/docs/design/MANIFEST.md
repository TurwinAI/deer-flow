# Design Build Manifest — premium UI system + marketing pages

> From `SPEC.md`. Per-batch loop: build → verify → attest. Verification is a
> runnable gate (typecheck/lint/test/build + render screenshot), never "looks
> right." Attestations recorded in `docs/design/BUILD-LOG.md`.

## Objective
Replace the ad-hoc styling with ONE centralized UI system (tokens + component
library) and ship a premium editorial marketing surface: landing + release/
artist pages + About, Licensing, Terms, Privacy, Press.

## Inputs / constraints
- Stack: React + Vite + TS (existing). Fonts self-hosted via `@fontsource*`
  (Fraunces, Inter, Space Mono) — no CDN.
- Keep existing data wiring (`src/lib/*`) and admin/agent pages untouched in
  behaviour. Existing test copy hooks preserved or tests updated + re-run.
- One accent (brass). Heritage by restraint. Reduced-motion safe. WCAG AA.

## Batches

**D1 — Token + type foundation.** `tokens.css` (committed palette, type scale,
space, radii, motion vars) + base/reset in `global.css`; font `@font-face`
imports (variable Fraunces/Inter + Space Mono); body/heading defaults.
*Verify:* typecheck + build; dev server renders with new fonts (screenshot).

**D2 — Component library (`src/components/ui/`).** Container, Page, Eyebrow,
Button, Tag, Badge/AiBadge, Hairline, Prose, Seal, Marquee, Reveal; composites
SiteHeader, SiteFooter, Hero, ArtworkTile, ReleaseCard, ArtistCard,
SectionHeading, MetaRow, TrackRow, CTASection, LicenseNote. One `ui.css`.
*Verify:* typecheck + lint + build; a component smoke render.

**D3 — Landing page.** Rebuild `Home.tsx` as catalog-as-hero (thesis release,
dub ticker, artwork grid, artist spotlight, AI-native disclosure, licensing CTA)
using only the library.
*Verify:* build + screenshot; unit test for hero/landmarks.

**D4 — Catalog + artifact pages.** Re-skin `Releases`, `ReleasePage`, `Artists`,
`ArtistPage` on the system (artwork grid, mono metadata, inline players).
*Verify:* build + screenshots; existing ReleasePage/ArtistPage tests green.

**D5 — Editorial pages.** New `About`, `Licensing`, `Terms`, `Privacy`, `Press`
(real copy, `Prose`, bone paper) + routes + footer/nav links.
*Verify:* build + screenshots; nav-route guard test (no dangling links).

**D6 — Header/footer + motion + a11y polish.** Sticky slim `SiteHeader`,
`SiteFooter`; Reveal/Marquee wired with `prefers-reduced-motion`; focus rings;
contrast check.
*Verify:* full suite (web typecheck/lint/test incl. axe) + E2E + build; multi-
page screenshots; reduced-motion screenshot.

## Verification criteria (definition of done)
- `pnpm typecheck` 0, `pnpm lint` 0, `pnpm test` green (tests updated as needed),
  `pnpm build` succeeds, `pnpm test:e2e` green.
- Every public route renders with the system; no page-bespoke CSS beyond layout;
  nav/footer links all resolve (guard test).
- Screenshots captured for landing + each page (desktop + mobile width) and a
  reduced-motion variant.
- No admin/agent behavioural change; functions suite untouched (spot re-run).

## Failure modes / circuit breakers
- Scope drift into admin redesign → stop (out of scope per SPEC §8).
- Font CDN dependency → forbidden; self-host only.
- A test fails on changed copy → update the test to the new intended copy and
  re-run; never delete coverage to go green.
- Contrast below AA on the one accent → darken brass or move it off the failing
  ground; do not ship failing contrast.
