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

/**
 * A consequential agent action the autonomy ApprovalGate has BLOCKED pending the
 * owner's human approval (mirrors the backend `ApprovalRecord`). In fixtures mode
 * the Approvals page lists these and "Approve" removes them from the list — the
 * offline stand-in for `adminListPendingApprovals` / `adminApprove`.
 */
export interface PendingApproval {
  approvalId: string;
  tool: string;
  argsSummary: string;
  createdAt: string;
}

export const FIXTURE_PENDING_APPROVALS: PendingApproval[] = [
  {
    approvalId: "deliver_release__a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    tool: "deliver_release",
    argsSummary: 'releaseId: "foundation-stones"',
    createdAt: "2026-06-20T09:00:00.000Z",
  },
  {
    approvalId: "initiate_payout__0f1e2d3c4b5a69788796a5b4c3d2e1f0",
    tool: "initiate_payout",
    argsSummary: 'payoutId: "payout__roots-untold__2026-Q2"',
    createdAt: "2026-06-20T09:05:00.000Z",
  },
];

/**
 * A release's distribution status (mirrors the backend `DistributionRecord`).
 * In fixtures mode the Distribution page lists these — the offline stand-in for
 * the admin distribution-status read.
 */
export interface DistributionRow {
  releaseId: string;
  title: string;
  status: "scheduled" | "delivering" | "accepted" | "delivered";
  scheduledAt?: string;
  deliveredAt?: string;
}

export const FIXTURE_DISTRIBUTIONS: DistributionRow[] = [
  {
    releaseId: "foundation-stones",
    title: "Foundation Stones",
    status: "delivered",
    scheduledAt: "2026-07-04T00:00:00.000Z",
    deliveredAt: "2026-07-04T01:00:00.000Z",
  },
];

/**
 * A per-artist royalty statement (mirrors the backend `RoyaltyStatement`). In
 * fixtures mode the Royalties page lists these — the offline stand-in for
 * `adminListStatements`. Cent fields; totals reconcile
 * (gross - deductions - recoupment = net).
 */
export interface RoyaltyStatementRow {
  id: string;
  artistId: string;
  artistName: string;
  period: string;
  grossCents: number;
  deductionsCents: number;
  recoupmentAppliedCents: number;
  netCents: number;
}

export const FIXTURE_ROYALTY_STATEMENTS: RoyaltyStatementRow[] = [
  {
    id: "roots-untold__2026-Q2",
    artistId: "roots-untold",
    artistName: "Roots Untold",
    period: "2026-Q2",
    grossCents: 900,
    deductionsCents: 100,
    recoupmentAppliedCents: 0,
    netCents: 800,
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
