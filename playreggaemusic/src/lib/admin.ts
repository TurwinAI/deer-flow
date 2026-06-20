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
  FIXTURE_ORDERS,
  FIXTURE_PRODUCTS,
  FIXTURE_RELEASES,
  fixturesEnabled,
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

// -- In-memory fixture store (mutable copies; reset per page load) -----------

const memArtists: Artist[] = FIXTURE_ARTISTS.map((a) => ({ ...a }));
const memReleases: Release[] = FIXTURE_RELEASES.map((r) => ({ ...r }));
const memProducts: Product[] = FIXTURE_PRODUCTS.map((p) => ({ ...p }));
const memOrders: Order[] = FIXTURE_ORDERS.map((o) => ({ ...o }));

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
