# Design Research — Premium Artist-Label UI (synthesis)

Three parallel research passes (premium label sites; type/color/motion; reggae
heritage done tastefully). Condensed; sources at end.

## Convergent findings (what "premium" means here)

1. **One grotesque + one accent, ruthlessly.** Warp (HelloMe rebrand → Stink
   Studios build): a single neo-grotesque (custom *Favorit*) on neutral ground,
   one ownable hue (purple). Ghostly / Stones Throw keep chrome black/white/grey
   so **sleeve artwork carries all color**. Lesson: neutral chrome, artwork
   supplies saturation, a lone signature accent.
2. **Catalog is the homepage.** Warp = "content-first, no marketing hero — the
   newest release IS the hero." Release pages are designed *artifacts* (big art,
   tracklist, inline player, credits), not database rows.
3. **Hue-biased neutrals, never pure.** Premium palettes avoid `#000/#fff/#888`;
   neutrals lean toward the accent's temperature. Off-black + off-white reduce
   glare and read "chosen."
4. **Archival metadata as texture.** Uppercase micro-eyebrows + catalog numbers
   (mono) — "DUB-001", dates, formats — give the dub/sound-system world's
   catalog rigor. Mono numerals (`tabular-nums`).
5. **Motion sub-300ms, functional.** Tasteful: staggered scroll reveal, slow
   edge-faded marquee, hover artwork scale ~1.03, one page-load reveal, inline
   audio. Gimmicky: heavy WebGL/parallax, intro loaders, autoplay, scroll-jack,
   blob cursors. Always `prefers-reduced-motion`.

## Type (OSS-friendly, verified OFL)

Premium commercial pairings (PP Editorial New + Neue Montreal; GT Sectra +
Söhne) → OSS equivalents. **Chosen: Fraunces (display) + Inter (body/UI) +
Space Mono (metadata).** "Fraunces + Inter" is an explicitly-listed OSS premium
pairing (warm, editorial, human); Inter as the calm body under a strong Fraunces
display voice is correct (the anti-pattern is Inter *alone* with no display
voice). Space Mono supplies the archival/dub-plate texture.

## Heritage by restraint (reggae without kitsch)

- Best template: **Blood & Fire** (1993) borrowed Blue Note jazz-imprint
  minimalism — clean grids, disciplined type, cultural seriousness over
  decoration. Studio One / Treasure Isle 7" label roundels, sound-system scale,
  dub echo (King Tubby / Lee Perry) as *method*.
- **Color:** treat red/gold/green as a **single restrained accent — gold the
  carrier** — never a tricolor stripe. Committed palette uses warm off-black +
  bone + brass gold, with deep roots-green/oxblood only as rare seals/dividers.
- **Dub as system, not symbol:** express echo/repetition/versions through motion
  and layout rhythm, not literal icons.
- **Clichés avoided:** cannabis leaves, tricolor stripes, "rasta" wavy fonts,
  Marley silhouettes/dreadlocks/lions-rampant, tropical stock imagery, rainbow
  gradients.

## Anti-patterns (AI-template cluster) to avoid

Cream `#F4F1EA` + serif + terracotta; near-black + lone acid pop; purple→blue
gradient hero; Inter/Space Grotesk as the *only* face; emoji section markers;
everything centered; uniform 16px-rounded cards with accent rail; bento grids;
"Build the future" hero copy; uniform scroll-fade + spring-bounce hovers.
(Note: the app's *previous* tokens were squarely in the cream+serif+system-font
cluster — this redesign deliberately departs.)

## Sources
HelloMe — Warp; It's Nice That — Warp redesign; Stink Studios — warp.net; Dinamo
— Favorit; Fonts In Use — Netto; FELD — Erased Tapes; Stones Throw / Jeff Jank;
Ghostly; Defected rebrand; Another Kind — Domino. Pangram (font pairings 2025);
Typewolf (GT Sectra/Söhne); Google Fonts / GitHub OFL (Fraunces, Inter, Space
Mono, Bricolage, Newsreader, Geist); Brandlic / Steph Corrigan (luxury palettes);
Motion.dev (scroll animation); 925 Studios / Aquent (AI-slop avoidance). Soul
Jazz (*Reggae 45 Soundsystem*, *Cover Art of Studio One*); It's Nice That on Tony
McDermott/Greensleeves; VP Records on Blood & Fire; Rizzoli / LargeUp (*Art of
Dancehall*); Wikipedia (Flag of Ethiopia, Dub, Rastafari color meaning).
