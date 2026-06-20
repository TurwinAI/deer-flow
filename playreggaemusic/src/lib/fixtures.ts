/**
 * Offline fixture data (B07). When `VITE_USE_FIXTURES === "1"`, the catalog,
 * checkout, auth, and admin libs serve this seeded data from memory instead of
 * touching Firestore / Functions / Polar / Anthropic. This is what lets the
 * whole app run offline for Playwright E2E and component tests — there is NO
 * live network call in fixtures mode.
 *
 * The bypass is GATED STRICTLY on the env flag (see `fixturesEnabled()` below); it
 * is impossible to enable in a production build that does not set the flag.
 */
import type { Artist, Order, Product, Release, Track } from "./catalog";

/** True only when the build/runtime explicitly opts into fixtures mode. */
export function fixturesEnabled(): boolean {
  return import.meta.env.VITE_USE_FIXTURES === "1";
}

export const FIXTURE_ARTISTS: Artist[] = [
  {
    id: "roots-untold",
    name: "Roots Untold",
    bio:
      "Roots Untold is PlayReggaeMusic.ai's flagship act — a roots-reggae project " +
      "crafting deep, conscious riddims in the foundation tradition. Every track is " +
      "AI-generated and clearly labelled as such.",
    photoPath: "previews/roots-untold/artist.jpg",
    links: {
      spotify: "https://open.spotify.com/artist/roots-untold",
      youtube: "https://youtube.com/@rootsuntold",
      instagram: "https://instagram.com/rootsuntold",
    },
  },
];

export const FIXTURE_RELEASES: Release[] = [
  {
    id: "foundation-stones",
    artistId: "roots-untold",
    title: "Foundation Stones",
    catalogNumber: "PRM-001",
    type: "ep",
    releaseDate: "2026-07-04",
    aiGenerated: true,
  },
];

export const FIXTURE_TRACKS: Track[] = [
  {
    id: "foundation-stones-01",
    releaseId: "foundation-stones",
    title: "Foundation Stones",
    durationSec: 218,
    previewClipPath: "previews/foundation-stones/01-foundation-stones.mp3",
  },
  {
    id: "foundation-stones-02",
    releaseId: "foundation-stones",
    title: "Jah Light Dub",
    durationSec: 245,
    previewClipPath: "previews/foundation-stones/02-jah-light-dub.mp3",
  },
  {
    id: "foundation-stones-03",
    releaseId: "foundation-stones",
    title: "Rivers of Zion",
    durationSec: 201,
    previewClipPath: "previews/foundation-stones/03-rivers-of-zion.mp3",
  },
];

export const FIXTURE_PRODUCTS: Product[] = [
  {
    id: "foundation-stones-download",
    type: "music_download",
    title: "Foundation Stones (Digital Download)",
    priceCents: 700,
    currency: "USD",
    releaseId: "foundation-stones",
  },
];

export const FIXTURE_ORDERS: Order[] = [
  {
    id: "order-fixture-1",
    customer: "cus_fixture",
    productId: "foundation-stones-download",
    amount: 700,
    currency: "USD",
    status: "paid",
    createdAt: "2026-06-15T12:00:00.000Z",
  },
];

/** Canned transcript returned by the agent console in fixtures mode (NO LLM). */
export const FIXTURE_AGENT_TRANSCRIPT = [
  { role: "system" as const, content: "You are PlayReggaeMusic.ai's autonomous label manager." },
  { role: "human" as const, content: "Plan the next Roots Untold release and put it on sale." },
  {
    role: "ai" as const,
    content:
      "Drafted a follow-up EP for Roots Untold, created a music_download product at 7.00 USD, " +
      "and confirmed the AI-generated badge + personal-listening license are attached. " +
      "(Fixtures mode — canned transcript, no live model call.)",
  },
];
