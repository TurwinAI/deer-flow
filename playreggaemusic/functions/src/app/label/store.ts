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
import type {
  Artist,
  Credit,
  Order,
  Product,
  ProvenanceRecord,
  Release,
  RightsRecord,
  Split,
  Track,
  TrackMaster,
} from "./index";
import {
  isValidISRC,
  isValidUPC,
  normalizeISRC,
  normalizeUPC,
  validateSplits,
} from "./identifiers";

const ARTISTS = "artists";
const RELEASES = "releases";
const TRACKS = "tracks";
const TRACK_MASTERS = "track_masters";
const PRODUCTS = "products";
const ORDERS = "orders";
const RIGHTS = "rights";
const PROVENANCE = "provenance";

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

/**
 * Validate + normalize the PUBLIC identifier fields on a release. Rejects an
 * invalid UPC/EAN check digit. Returns a copy with `upc` normalized. Throws on
 * invalid input so no bad identifier is ever persisted.
 */
function normalizeReleaseIdentifiers(release: Release): Release {
  const next: Release = { ...release };
  if (release.upc !== undefined) {
    if (!isValidUPC(release.upc)) {
      throw new Error(`Invalid UPC/EAN barcode: ${release.upc}`);
    }
    next.upc = normalizeUPC(release.upc);
  }
  return next;
}

export async function createRelease(release: Release, store?: Firestore): Promise<Release> {
  const normalized = normalizeReleaseIdentifiers(release);
  await db(store).collection(RELEASES).doc(normalized.id).set(pruneUndefined({ ...normalized }));
  return normalized;
}

/**
 * Set the PUBLIC release identifiers (UPC + credits) on an existing release
 * doc, validating the UPC check digit. Merges so other release fields are
 * untouched. Throws if the release does not exist or the UPC is invalid.
 */
export async function setReleaseIdentifiers(
  releaseId: string,
  identifiers: { upc?: string; credits?: Credit[] },
  store?: Firestore,
): Promise<Release> {
  const ref = db(store).collection(RELEASES).doc(releaseId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`Unknown release: ${releaseId}`);
  }
  const update: { upc?: string; credits?: Credit[] } = {};
  if (identifiers.upc !== undefined) {
    if (!isValidUPC(identifiers.upc)) {
      throw new Error(`Invalid UPC/EAN barcode: ${identifiers.upc}`);
    }
    update.upc = normalizeUPC(identifiers.upc);
  }
  if (identifiers.credits !== undefined) {
    update.credits = identifiers.credits;
  }
  await ref.set(pruneUndefined({ ...update }), { merge: true });
  const updated = await ref.get();
  return updated.data() as Release;
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

/**
 * Validate + normalize the PUBLIC identifier on a track. Rejects an invalid
 * ISRC. Returns a copy with `isrc` normalized. Throws on invalid input.
 */
function normalizeTrackIdentifiers(track: Track): Track {
  const next: Track = { ...track };
  if (track.isrc !== undefined) {
    if (!isValidISRC(track.isrc)) {
      throw new Error(`Invalid ISRC: ${track.isrc}`);
    }
    next.isrc = normalizeISRC(track.isrc);
  }
  return next;
}

export async function createTrack(track: Track, store?: Firestore): Promise<Track> {
  const normalized = normalizeTrackIdentifiers(track);
  await db(store).collection(TRACKS).doc(normalized.id).set(pruneUndefined({ ...normalized }));
  return normalized;
}

/**
 * Set a track's PUBLIC ISRC on an existing track doc, validating the format.
 * Merges so other track fields are untouched. Throws if the track does not
 * exist or the ISRC is invalid. Returns the updated track.
 */
export async function setTrackISRC(
  trackId: string,
  isrc: string,
  store?: Firestore,
): Promise<Track> {
  if (!isValidISRC(isrc)) {
    throw new Error(`Invalid ISRC: ${isrc}`);
  }
  const ref = db(store).collection(TRACKS).doc(trackId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`Unknown track: ${trackId}`);
  }
  await ref.set({ isrc: normalizeISRC(isrc) }, { merge: true });
  const updated = await ref.get();
  return updated.data() as Track;
}

export async function listTracksByRelease(releaseId: string, store?: Firestore): Promise<Track[]> {
  const snap = await db(store).collection(TRACKS).where("releaseId", "==", releaseId).get();
  return snap.docs.map((d) => d.data() as Track);
}

/**
 * Set a track's PUBLIC preview-clip path on an existing track doc. Merges so
 * other track fields are untouched. Throws if the track does not exist. Used by
 * the asset pipeline after a preview clip is written to public Storage.
 */
export async function setTrackPreviewClip(
  trackId: string,
  previewClipPath: string,
  store?: Firestore,
): Promise<Track> {
  const ref = db(store).collection(TRACKS).doc(trackId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`Unknown track: ${trackId}`);
  }
  await ref.set({ previewClipPath }, { merge: true });
  const updated = await ref.get();
  return updated.data() as Track;
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
// Rights — SENSITIVE ownership splits (admin-only `rights/{releaseId}`)
// ---------------------------------------------------------------------------

/**
 * Write a release's SENSITIVE ownership splits to the admin-only
 * `rights/{releaseId}` collection (firestore.rules denies all client access;
 * the admin SDK bypasses rules). Splits are validated first (a non-empty set
 * must sum to 100); invalid splits throw and nothing is persisted. NEVER write
 * splits into the world-readable release doc.
 */
export async function setRights(
  releaseId: string,
  splits: Split[],
  store?: Firestore,
): Promise<RightsRecord> {
  const { splits: validated } = validateSplits(splits);
  const record: RightsRecord = { releaseId, ownershipSplits: validated };
  await db(store)
    .collection(RIGHTS)
    .doc(releaseId)
    .set({ releaseId, ownershipSplits: validated.map((s) => ({ ...s })) });
  return record;
}

/** Read a release's ownership splits (admin SDK). Returns null if unset. */
export async function getRights(
  releaseId: string,
  store?: Firestore,
): Promise<RightsRecord | null> {
  const snap = await db(store).collection(RIGHTS).doc(releaseId).get();
  return snap.exists ? (snap.data() as RightsRecord) : null;
}

// ---------------------------------------------------------------------------
// Provenance — PUBLIC AI-disclosure record (provenance/{trackId})
// ---------------------------------------------------------------------------

/**
 * Write a track's C2PA-style AI-provenance disclosure to the PUBLIC-read,
 * admin-write `provenance/{trackId}` collection (firestore.rules). Unlike
 * masters/rights this is a transparency artifact meant to be world-readable —
 * the admin SDK writes it; clients may only read. Idempotent (set-with-id).
 */
export async function setProvenance(
  record: ProvenanceRecord,
  store?: Firestore,
): Promise<ProvenanceRecord> {
  await db(store)
    .collection(PROVENANCE)
    .doc(record.trackId)
    .set(pruneUndefined({ ...record }));
  return record;
}

/** Read a track's AI-provenance record (admin SDK). Returns null if absent. */
export async function getProvenance(
  trackId: string,
  store?: Firestore,
): Promise<ProvenanceRecord | null> {
  const snap = await db(store).collection(PROVENANCE).doc(trackId).get();
  return snap.exists ? (snap.data() as ProvenanceRecord) : null;
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
