/**
 * Firestore data-access for the label catalog + orders (B05).
 *
 * Admin-SDK CRUD via `getDb()` from the harness persistence layer. Document
 * ids are supplied by the caller so writes are deterministic and idempotent
 * (set-with-id, not auto-id). The admin SDK bypasses security rules, so these
 * functions are the engine-side write path; client reads are governed by
 * firestore.rules.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";
import type { Artist, Order, Product, Release, Track, TrackMaster } from "./index";

const ARTISTS = "artists";
const RELEASES = "releases";
const TRACKS = "tracks";
const TRACK_MASTERS = "track_masters";
const PRODUCTS = "products";
const ORDERS = "orders";

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

/**
 * Firestore rejects `undefined` field values. Optional fields (e.g. a missing
 * `photoPath` or `polarProductId`) arrive as `undefined`; strip them so the
 * document only carries present keys.
 */
function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

// ---------------------------------------------------------------------------
// Artists
// ---------------------------------------------------------------------------

export async function createArtist(artist: Artist, store?: Firestore): Promise<Artist> {
  const data = pruneUndefined({ ...artist, links: pruneUndefined({ ...artist.links }) });
  await db(store).collection(ARTISTS).doc(artist.id).set(data);
  return artist;
}

export async function getArtist(id: string, store?: Firestore): Promise<Artist | undefined> {
  const snap = await db(store).collection(ARTISTS).doc(id).get();
  return snap.exists ? (snap.data() as Artist) : undefined;
}

export async function listArtists(store?: Firestore): Promise<Artist[]> {
  const snap = await db(store).collection(ARTISTS).get();
  return snap.docs.map((d) => d.data() as Artist);
}

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

export async function createRelease(release: Release, store?: Firestore): Promise<Release> {
  await db(store).collection(RELEASES).doc(release.id).set(pruneUndefined({ ...release }));
  return release;
}

export async function getRelease(id: string, store?: Firestore): Promise<Release | undefined> {
  const snap = await db(store).collection(RELEASES).doc(id).get();
  return snap.exists ? (snap.data() as Release) : undefined;
}

export async function listReleasesByArtist(
  artistId: string,
  store?: Firestore,
): Promise<Release[]> {
  const snap = await db(store).collection(RELEASES).where("artistId", "==", artistId).get();
  return snap.docs.map((d) => d.data() as Release);
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export async function createTrack(track: Track, store?: Firestore): Promise<Track> {
  await db(store).collection(TRACKS).doc(track.id).set(pruneUndefined({ ...track }));
  return track;
}

export async function listTracksByRelease(releaseId: string, store?: Firestore): Promise<Track[]> {
  const snap = await db(store).collection(TRACKS).where("releaseId", "==", releaseId).get();
  return snap.docs.map((d) => d.data() as Track);
}

/**
 * Write a track's PRIVATE master path to the admin-only `track_masters/{trackId}`
 * collection (firestore.rules denies all client access; the admin SDK bypasses
 * rules). Kept out of the world-readable `tracks` doc.
 */
export async function setTrackMaster(
  trackId: string,
  masterPath: string,
  store?: Firestore,
): Promise<TrackMaster> {
  const master: TrackMaster = { trackId, masterPath };
  await db(store).collection(TRACK_MASTERS).doc(trackId).set({ ...master });
  return master;
}

/** Read a track's private master path (admin SDK). Returns null if absent. */
export async function getTrackMaster(
  trackId: string,
  store?: Firestore,
): Promise<TrackMaster | null> {
  const snap = await db(store).collection(TRACK_MASTERS).doc(trackId).get();
  return snap.exists ? (snap.data() as TrackMaster) : null;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function createProduct(product: Product, store?: Firestore): Promise<Product> {
  await db(store).collection(PRODUCTS).doc(product.id).set(pruneUndefined({ ...product }));
  return product;
}

export async function getProduct(id: string, store?: Firestore): Promise<Product | undefined> {
  const snap = await db(store).collection(PRODUCTS).doc(id).get();
  return snap.exists ? (snap.data() as Product) : undefined;
}

export async function listProducts(store?: Firestore): Promise<Product[]> {
  const snap = await db(store).collection(PRODUCTS).get();
  return snap.docs.map((d) => d.data() as Product);
}

// ---------------------------------------------------------------------------
// Orders (Polar mirror — admin-only)
// ---------------------------------------------------------------------------

export async function recordOrder(order: Order, store?: Firestore): Promise<Order> {
  await db(store).collection(ORDERS).doc(order.id).set(pruneUndefined({ ...order }));
  return order;
}

export async function getOrder(id: string, store?: Firestore): Promise<Order | undefined> {
  const snap = await db(store).collection(ORDERS).doc(id).get();
  return snap.exists ? (snap.data() as Order) : undefined;
}

export async function listOrders(store?: Firestore): Promise<Order[]> {
  const snap = await db(store).collection(ORDERS).get();
  return snap.docs.map((d) => d.data() as Order);
}
