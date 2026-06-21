/**
 * Label domain — catalog + orders. Firestore schema (manifest §5) plus the
 * agent-facing catalog tools and data-access store (B05).
 *
 * Application layer: this module MAY import harness/* (e.g. getDb). Nothing in
 * harness/* may import this layer (enforced by the boundary test).
 */
export type ReleaseType = "album" | "ep" | "single";
export type ProductType = "music_download" | "merch";

/** Polar order lifecycle, mirrored into Firestore. */
export type OrderStatus = "pending" | "paid" | "refunded";

export interface Artist {
  id: string;
  name: string;
  bio: string;
  photoPath?: string;
  links: { spotify?: string; appleMusic?: string; youtube?: string; instagram?: string };
}

/** A production credit, e.g. `{ role: "Producer", name: "Roots Untold" }`. */
export interface Credit {
  role: string;
  name: string;
}

export interface Release {
  id: string;
  artistId: string;
  title: string;
  catalogNumber: string;
  type: ReleaseType;
  releaseDate: string;
  aiGenerated: true;
  /**
   * PUBLIC release barcode — UPC-A (12 digits) or EAN/GTIN-13 (13 digits) with
   * a valid check digit. Appears on the public release page; safe to expose.
   */
  upc?: string;
  /** PUBLIC production credits — appear on the release page; safe to expose. */
  credits?: Credit[];
}

/**
 * A track on a release. `previewClipPath` points at the public Storage
 * `previews/...` clip. The PRIVATE master-audio object path is NOT stored here
 * — the `tracks` doc is world-readable, so leaking `masterPath` in it would
 * expose the private master to any reader. The master path lives in the
 * admin-only `track_masters/{trackId}` collection (see `TrackMaster`).
 */
export interface Track {
  id: string;
  releaseId: string;
  title: string;
  durationSec: number;
  previewClipPath: string;
  /**
   * PUBLIC recording identifier — ISRC (ISO 3901, `CC-XXX-YY-NNNNN`). Appears
   * on the public track/release page; safe to expose. Stored normalized.
   */
  isrc?: string;
}

/**
 * The PRIVATE master-audio object path for a track. Stored in the admin-only
 * `track_masters/{trackId}` collection (firestore.rules denies all client
 * access; the admin SDK bypasses rules). Never exposed in the public `tracks`
 * doc. `masterPath` points at the private `masters/...` Storage object.
 */
export interface TrackMaster {
  trackId: string;
  masterPath: string;
}

/** A single ownership share, e.g. `{ payee: "Roots Untold", percent: 50 }`. */
export interface Split {
  payee: string;
  percent: number;
}

/**
 * SENSITIVE ownership splits for a release. Ownership/royalty splits are
 * commercially sensitive and must NEVER appear in the world-readable release
 * doc. They live in the admin-only `rights/{releaseId}` collection
 * (firestore.rules denies all client access; the admin SDK bypasses rules),
 * exactly like `track_masters` keeps private master paths out of public reach.
 * A non-empty `ownershipSplits` must sum to 100 (see `validateSplits`).
 */
export interface RightsRecord {
  releaseId: string;
  ownershipSplits: Split[];
}

/**
 * A sellable item. v1 is digital-only (`music_download`); `merch` is reserved
 * for the phased physical rail (manifest §8.1) and not sold yet. Polar product
 * / price ids are populated once products are created in Polar (B06).
 */
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

/**
 * A Polar order mirrored into Firestore. Orders are admin-only (never publicly
 * readable). The authoritative record lives in Polar; this is a local mirror
 * for catalog operations and reporting.
 */
export interface Order {
  id: string;
  customer: string;
  productId: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  createdAt: string;
}

export * from "./identifiers";
export * from "./store";
export * from "./tools";
export * from "./seed";
