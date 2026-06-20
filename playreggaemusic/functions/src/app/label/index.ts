/**
 * Label domain — catalog + orders. Firestore schema and the agent-facing
 * catalog tools land in B05. Types mirror the manifest data model (§5).
 */
export type ReleaseType = "album" | "ep" | "single";
export type ProductType = "music_download" | "merch";

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
