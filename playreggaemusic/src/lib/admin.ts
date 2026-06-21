/**
 * Admin data layer (B07).
 *
 * The owner-only `/admin` console calls this thin layer to create/update catalog
 * items and list orders, and `/admin/agent` calls it to run the autonomous
 * agent and read back the transcript.
 *
 * In FIXTURES mode (`VITE_USE_FIXTURES === "1"`) every operation is served from
 * an in-memory store (seeded from `fixtures.ts`) and the agent run returns a
 * CANNED transcript — NO Firestore, NO Functions, NO live LLM. In production it
 * calls the admin-guarded callables (`adminCreateArtist/Release/Product`,
 * `adminListOrders`, `runAgent`), which reject anyone without the admin claim.
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp } from "./firebase";
import {
  listArtists as listCatalogArtists,
  listProducts as listCatalogProducts,
  listReleases as listCatalogReleases,
  type Artist,
  type Order,
  type Product,
  type Release,
} from "./catalog";
import {
  FIXTURE_AGENT_TRANSCRIPT,
  FIXTURE_ARTISTS,
  FIXTURE_DISTRIBUTIONS,
  FIXTURE_ORDERS,
  FIXTURE_PENDING_APPROVALS,
  FIXTURE_PRODUCTS,
  FIXTURE_RELEASES,
  FIXTURE_ROYALTY_STATEMENTS,
  fixturesEnabled,
  type DistributionRow,
  type PendingApproval,
  type RoyaltyStatementRow,
} from "./fixtures";

export interface TranscriptEntry {
  role: "system" | "human" | "ai" | "tool";
  content: string;
}

/** Input for creating/updating an artist (links flattened for the form). */
export interface ArtistInput {
  id: string;
  name: string;
  bio: string;
}

export interface ReleaseInput {
  id: string;
  artistId: string;
  title: string;
  catalogNumber: string;
  type: Release["type"];
  releaseDate: string;
}

export interface ProductInput {
  id: string;
  type: Product["type"];
  title: string;
  priceCents: number;
  currency: string;
  releaseId?: string;
}

// Re-export the human-in-the-loop view shapes so pages import them from the data
// layer (which they mock) rather than the fixtures module directly.
export type { PendingApproval, DistributionRow, RoyaltyStatementRow };

// -- In-memory fixture store (mutable copies; reset per page load) -----------

const memArtists: Artist[] = FIXTURE_ARTISTS.map((a) => ({ ...a }));
const memReleases: Release[] = FIXTURE_RELEASES.map((r) => ({ ...r }));
const memProducts: Product[] = FIXTURE_PRODUCTS.map((p) => ({ ...p }));
const memOrders: Order[] = FIXTURE_ORDERS.map((o) => ({ ...o }));
// Pending approvals are mutated in place so "Approve" removes one offline.
const memPendingApprovals: PendingApproval[] = FIXTURE_PENDING_APPROVALS.map((p) => ({ ...p }));

function upsert<T extends { id: string }>(list: T[], item: T): void {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

function call<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
  const fns = getFunctions(getFirebaseApp());
  return httpsCallable<TReq, TRes>(fns, name)(data).then((r) => r.data);
}

// -- Catalog CRUD ------------------------------------------------------------

export async function listAdminArtists(): Promise<Artist[]> {
  if (fixturesEnabled()) return memArtists.map((a) => ({ ...a }));
  // Catalog reads are public; the admin console reuses them for listing.
  return listCatalogArtists();
}

export async function createArtist(input: ArtistInput): Promise<Artist> {
  const artist: Artist = { id: input.id, name: input.name, bio: input.bio, links: {} };
  if (fixturesEnabled()) {
    upsert(memArtists, artist);
    return artist;
  }
  return call("adminCreateArtist", artist);
}

export async function listAdminReleases(): Promise<Release[]> {
  if (fixturesEnabled()) return memReleases.map((r) => ({ ...r }));
  return listCatalogReleases();
}

export async function createRelease(input: ReleaseInput): Promise<Release> {
  const release: Release = { ...input, aiGenerated: true };
  if (fixturesEnabled()) {
    upsert(memReleases, release);
    return release;
  }
  return call("adminCreateRelease", input);
}

export async function listAdminProducts(): Promise<Product[]> {
  if (fixturesEnabled()) return memProducts.map((p) => ({ ...p }));
  return listCatalogProducts();
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const product: Product = { ...input };
  if (fixturesEnabled()) {
    upsert(memProducts, product);
    return product;
  }
  return call("adminCreateProduct", input);
}

// -- Orders ------------------------------------------------------------------

export async function listOrders(): Promise<Order[]> {
  if (fixturesEnabled()) return memOrders.map((o) => ({ ...o }));
  return call("adminListOrders", {});
}

// -- Human-in-the-loop: pending approvals (P2B10) ----------------------------

/**
 * List the consequential agent actions BLOCKED pending the owner's approval.
 * Fixtures mode reads the in-memory store; production calls the admin-guarded
 * `adminListPendingApprovals` callable.
 */
export async function listPendingApprovals(): Promise<PendingApproval[]> {
  if (fixturesEnabled()) return memPendingApprovals.map((p) => ({ ...p }));
  return call("adminListPendingApprovals", {});
}

/**
 * Approve one pending consequential action (the human-in-the-loop decision).
 * Fixtures mode removes it from the in-memory list so the UI reflects approval
 * offline; production calls the admin-guarded `adminApprove` callable.
 */
export async function approvePending(approvalId: string): Promise<void> {
  if (fixturesEnabled()) {
    const i = memPendingApprovals.findIndex((p) => p.approvalId === approvalId);
    if (i >= 0) memPendingApprovals.splice(i, 1);
    return;
  }
  await call("adminApprove", { approvalId });
}

// -- Distribution status (P2B10) ---------------------------------------------

/**
 * List releases with their DSP distribution status. Fixtures mode reads the
 * in-memory store; production calls the admin-guarded `adminListDistributions`
 * callable.
 */
export async function listDistributions(): Promise<DistributionRow[]> {
  if (fixturesEnabled()) return FIXTURE_DISTRIBUTIONS.map((d) => ({ ...d }));
  return call("adminListDistributions", {});
}

// -- Royalty statements (P2B10) ----------------------------------------------

/**
 * List per-artist royalty statements (gross/deductions/recoupment/net). Fixtures
 * mode reads the in-memory store; production calls the admin-guarded
 * `adminListStatements` callable.
 */
export async function listRoyaltyStatements(): Promise<RoyaltyStatementRow[]> {
  if (fixturesEnabled()) return FIXTURE_ROYALTY_STATEMENTS.map((s) => ({ ...s }));
  return call("adminListStatements", {});
}

// -- Agent run ---------------------------------------------------------------

/** Trigger an autonomous agent run and return its transcript. */
export async function runAgent(prompt: string): Promise<TranscriptEntry[]> {
  if (fixturesEnabled()) {
    return FIXTURE_AGENT_TRANSCRIPT.map((e) => ({ ...e }));
  }
  const result = await call<{ prompt: string }, { transcript: TranscriptEntry[] }>("runAgent", {
    prompt,
  });
  return result.transcript;
}
