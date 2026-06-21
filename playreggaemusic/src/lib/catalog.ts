/**
 * Public catalog data access (B06). Reads artists/releases/tracks/products from
 * Firestore via the web SDK. Every exported function is a thin async wrapper so
 * component tests can `vi.mock("../lib/catalog", ...)` and supply fixtures with
 * NO live Firestore. The shapes mirror the Firestore schema (manifest §5).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getDb } from "./firebase";
import {
  FIXTURE_ARTISTS,
  FIXTURE_PRODUCTS,
  FIXTURE_RELEASES,
  FIXTURE_TRACKS,
  fixturesEnabled,
} from "./fixtures";

export type ReleaseType = "album" | "ep" | "single";
export type ProductType = "music_download" | "merch";
export type OrderStatus = "pending" | "paid" | "refunded";

export interface Artist {
  id: string;
  name: string;
  bio: string;
  photoPath?: string;
  links: { spotify?: string; appleMusic?: string; youtube?: string; instagram?: string };
}

export interface Release {
  id: string;
  artistId: string;
  title: string;
  catalogNumber: string;
  type: ReleaseType;
  releaseDate: string;
  aiGenerated: true;
}

export interface Track {
  id: string;
  releaseId: string;
  title: string;
  durationSec: number;
  previewClipPath: string;
  /** masterPath is NOT exposed publicly; it is omitted from public reads. */
}

export interface Product {
  id: string;
  type: ProductType;
  title: string;
  priceCents: number;
  currency: string;
  releaseId?: string;
  polarProductId?: string;
  polarPriceId?: string;
}

/** A Polar order mirrored into Firestore (admin-only; surfaced in the console). */
export interface Order {
  id: string;
  customer: string;
  productId: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  createdAt: string;
}

export async function listArtists(): Promise<Artist[]> {
  if (fixturesEnabled()) return [...FIXTURE_ARTISTS];
  const snap = await getDocs(collection(getDb(), "artists"));
  return snap.docs.map((d) => d.data() as Artist);
}

export async function getArtist(id: string): Promise<Artist | undefined> {
  if (fixturesEnabled()) return FIXTURE_ARTISTS.find((a) => a.id === id);
  const snap = await getDoc(doc(getDb(), "artists", id));
  return snap.exists() ? (snap.data() as Artist) : undefined;
}

export async function listReleases(): Promise<Release[]> {
  if (fixturesEnabled()) return [...FIXTURE_RELEASES];
  const snap = await getDocs(collection(getDb(), "releases"));
  return snap.docs.map((d) => d.data() as Release);
}

export async function getRelease(id: string): Promise<Release | undefined> {
  if (fixturesEnabled()) return FIXTURE_RELEASES.find((r) => r.id === id);
  const snap = await getDoc(doc(getDb(), "releases", id));
  return snap.exists() ? (snap.data() as Release) : undefined;
}

export async function listReleasesByArtist(artistId: string): Promise<Release[]> {
  if (fixturesEnabled()) return FIXTURE_RELEASES.filter((r) => r.artistId === artistId);
  const q = query(collection(getDb(), "releases"), where("artistId", "==", artistId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Release);
}

export async function listTracksByRelease(releaseId: string): Promise<Track[]> {
  if (fixturesEnabled()) return FIXTURE_TRACKS.filter((t) => t.releaseId === releaseId);
  const q = query(collection(getDb(), "tracks"), where("releaseId", "==", releaseId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Track);
}

export async function listProducts(): Promise<Product[]> {
  if (fixturesEnabled()) return [...FIXTURE_PRODUCTS];
  const snap = await getDocs(collection(getDb(), "products"));
  return snap.docs.map((d) => d.data() as Product);
}

export async function getProductForRelease(releaseId: string): Promise<Product | undefined> {
  if (fixturesEnabled()) return FIXTURE_PRODUCTS.find((p) => p.releaseId === releaseId);
  const q = query(collection(getDb(), "products"), where("releaseId", "==", releaseId));
  const snap = await getDocs(q);
  const products = snap.docs.map((d) => d.data() as Product);
  return products[0];
}

/** Public URL for a preview clip stored in the public previews/ Storage path. */
export function previewUrl(previewClipPath: string): string {
  const bucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "";
  const encoded = encodeURIComponent(previewClipPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media`;
}
