# Design Build Log — attestations (build → verify → attest)

Per `MANIFEST.md`. One entry per batch. Verification is runnable output.

## D1 — Token + type foundation — DONE
- Rewrote `src/styles/tokens.css` (committed palette §1, type scale, space,
  radii, motion) + ground-aware vars (`.ground-paper`). Reset/base in
  `global.css` (focus rings, reduced-motion, skip link). Self-hosted fonts
  (`@fontsource-variable/fraunces`, `/inter`, `@fontsource/space-mono`) imported
  in `main.tsx` — no CDN.
- **Verified:** `pnpm build` emits the woff2 set locally (fraunces/inter/space
  mono) → fonts self-hosted, CSP-safe.

## D2 — Component library — DONE
- `src/components/ui/`: primitives (Container, Page, Eyebrow, Prose, Hairline,
  Button, LinkButton, Tag, AiBadge, Seal), Reveal, Marquee, SiteHeader,
  SiteFooter, cards (ReleaseArt generative roundel, ArtworkTile, ArtistCard),
  sections (SectionHeading, LicenseNote) + barrel `index.ts` + one `ui.css`.
  Removed superseded `Nav/LabelMark/AiBadge/LicenseNote` from `src/components/`.
- **Verified:** `pnpm typecheck` 0, `pnpm lint` 0.

## D3 — Landing — DONE
- `Home.tsx` rebuilt as catalog-as-hero (dub-echo title, ticker, latest grid,
  artist spotlight, method, licensing CTA) on the library only.
- **Verified:** build + screenshot (`rd-home.png`); App unit test green.
- **Bug found & fixed (render-verified):** below-fold `Reveal` tiles stayed at
  `opacity:0` in capture (IO never fired) → added a 1200ms fallback so content
  can never stay hidden; re-shot, grid renders.

## D4 — Catalog + artifact pages — DONE
- Re-skinned `Releases`, `ReleasePage`, `Artists`, `ArtistPage` (artwork grid,
  mono metadata, numbered tracklist + inline players).
- **Verified:** ReleasePage + ArtistPage unit/axe tests green; screenshots.

## D5 — Editorial pages — DONE
- New `About`, `Licensing`, `Press`, `Terms`, `Privacy` (paper ground, Prose,
  real copy; Terms/Privacy clearly PLACEHOLDER pending owner wording) + routes +
  header/footer links.
- **Verified:** build + screenshots; App nav-route guard test green (no dangling
  links; every nav href resolves).

## D6 — Header/footer + motion + a11y — DONE
- Sticky `SiteHeader`, `SiteFooter`; Reveal/Marquee honor
  `prefers-reduced-motion`; brass focus rings; AA accent (brass-700 on paper,
  brass-500 on ink).
- **Bug found & fixed (render-verified):** dub-echo via CSS `::after` injected a
  duplicate "reggae" into the hero `h1` accessible name — invisible to jsdom but
  caught by Playwright (E2E failed). Reimplemented the echo with `text-shadow`
  (purely visual, no accessible-name pollution). E2E green after.

## Final gate (post-redesign)
- `pnpm typecheck` **0** · `pnpm lint` **0** · `pnpm test` **23 passed** (incl.
  axe a11y on ReleasePage/ArtistPage) · `pnpm build` **OK** (fonts self-hosted)
  · `pnpm test:e2e` **2/2 passed** (offline fixtures full flows).
- Functions package untouched by this batch (web-only changes under `src/`);
  not re-run.
- Screenshots: `rd-home`, `rd-home-mobile`, `rd-releases`, `rd-release-detail`,
  `rd-artists`, `rd-about`, `rd-licensing`, `rd-terms` (+ reduced-motion home).

## Notes / surprises
- The two bugs both came from the **render boundary** (jsdom vs real browser):
  IO not firing and `::after` accessible-name pollution. Only the
  Playwright/screenshot gate caught them — vindicates render-verification over
  "tests pass."
- Departed deliberately from the previous tokens (cream + serif + system font =
  the AI-template cluster) → warm-black archival ground + brass + Fraunces/Inter/
  Space Mono + generative 7" roundel art.
