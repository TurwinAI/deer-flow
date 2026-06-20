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

export interface Release {
  id: string;
  artistId: string;
  title: string;
  catalogNumber: string;
  type: ReleaseType;
  releaseDate: string;
  aiGenerated: true;
}

/**
 * A track on a release. `previewClipPath` points at the public Storage
 * `previews/...` clip; `masterPath` points at the private `masters/...` file
 * (never world-readable — see storage.rules / firestore.rules).
 */
export interface Track {
  id: string;
  releaseId: string;
  title: string;
  durationSec: number;
  previewClipPath: string;
  masterPath: string;
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

export * from "./store";
export * from "./tools";
export * from "./seed";
