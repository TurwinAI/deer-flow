/**
 * Idempotent seed for the launch artist "Roots Untold" (manifest §5).
 *
 * Uses fixed document ids and set-with-id writes, so calling it twice produces
 * no duplicates — the second call overwrites identical data. Creates the
 * artist, a debut release (PRM catalog number, aiGenerated), three tracks with
 * public preview paths plus their PRIVATE master paths (stored separately in
 * the admin-only track_masters collection), and a music_download product for
 * the release.
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  createArtist,
  createProduct,
  createRelease,
  createTrack,
  setProvenance,
  setRights,
  setTrackMaster,
} from "./store";
import { contentSha256 } from "./assets";
import type { Artist, Product, ProvenanceRecord, Release, RightsRecord, Split, Track } from "./index";

export const ROOTS_UNTOLD_ARTIST_ID = "roots-untold";
export const FOUNDATION_RELEASE_ID = "foundation-stones";
export const FOUNDATION_PRODUCT_ID = "foundation-stones-download";
export const FOUNDATION_TRACK_IDS = [
  "foundation-stones-01",
  "foundation-stones-02",
  "foundation-stones-03",
] as const;

const ARTIST: Artist = {
  id: ROOTS_UNTOLD_ARTIST_ID,
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
};

const RELEASE: Release = {
  id: FOUNDATION_RELEASE_ID,
  artistId: ROOTS_UNTOLD_ARTIST_ID,
  title: "Foundation Stones",
  catalogNumber: "PRM-001",
  type: "ep",
  releaseDate: "2026-07-04",
  aiGenerated: true,
  // Valid UPC-A (GS1 mod-10 check digit verified). PUBLIC — on the release page.
  upc: "196633982100",
  // PUBLIC production credits.
  credits: [
    { role: "Produced by", name: "PlayReggaeMusic.ai" },
    { role: "Performed by", name: "Roots Untold (AI)" },
  ],
};

/**
 * SENSITIVE ownership splits for the debut release — written ONLY to the
 * admin-only `rights/{releaseId}` collection, never the public release doc.
 * Sums to 100.
 */
const OWNERSHIP_SPLITS: Split[] = [
  { payee: "PlayReggaeMusic.ai", percent: 70 },
  { payee: "Roots Untold", percent: 30 },
];

/** The generator recorded on every seeded AI-provenance disclosure. */
export const SEED_GENERATOR = "PlayReggaeMusic.ai";

/** The disclosure statement recorded on every seeded provenance record. */
export const SEED_DISCLOSURE =
  "AI-generated: this recording was produced with artificial intelligence by " +
  "PlayReggaeMusic.ai and is clearly labelled as such.";

/**
 * Public track docs (no master path) paired with their private master path and
 * the deterministic master bytes used to compute the provenance content hash.
 * (The seed does not upload audio; these stand in for the master bytes so the
 * provenance SHA-256 is stable and reproducible.)
 */
interface SeedTrack {
  track: Track;
  masterPath: string;
  /** Deterministic stand-in master bytes for the provenance content hash. */
  masterBytes: Buffer;
}

const TRACKS: SeedTrack[] = [
  {
    track: {
      id: FOUNDATION_TRACK_IDS[0],
      releaseId: FOUNDATION_RELEASE_ID,
      title: "Foundation Stones",
      durationSec: 218,
      previewClipPath: "previews/foundation-stones/01-foundation-stones.mp3",
      isrc: "USRUM2600001",
    },
    masterPath: "masters/foundation-stones/01-foundation-stones.wav",
    masterBytes: Buffer.from("foundation-stones-01-master"),
  },
  {
    track: {
      id: FOUNDATION_TRACK_IDS[1],
      releaseId: FOUNDATION_RELEASE_ID,
      title: "Jah Light Dub",
      durationSec: 245,
      previewClipPath: "previews/foundation-stones/02-jah-light-dub.mp3",
      isrc: "USRUM2600002",
    },
    masterPath: "masters/foundation-stones/02-jah-light-dub.wav",
    masterBytes: Buffer.from("foundation-stones-02-master"),
  },
  {
    track: {
      id: FOUNDATION_TRACK_IDS[2],
      releaseId: FOUNDATION_RELEASE_ID,
      title: "Rivers of Zion",
      durationSec: 201,
      previewClipPath: "previews/foundation-stones/03-rivers-of-zion.mp3",
      isrc: "USRUM2600003",
    },
    masterPath: "masters/foundation-stones/03-rivers-of-zion.wav",
    masterBytes: Buffer.from("foundation-stones-03-master"),
  },
];

const PRODUCT: Product = {
  id: FOUNDATION_PRODUCT_ID,
  type: "music_download",
  title: "Foundation Stones (Digital Download)",
  priceCents: 700,
  currency: "USD",
  releaseId: FOUNDATION_RELEASE_ID,
};

export interface SeedResult {
  artist: Artist;
  release: Release;
  tracks: Track[];
  product: Product;
  rights: RightsRecord;
  provenance: ProvenanceRecord[];
}

/**
 * Fixed timestamp for seeded provenance records so the seed stays idempotent
 * (a wall-clock `createdAt` would change the doc on every run).
 */
const SEED_PROVENANCE_CREATED_AT = "2026-07-04T00:00:00.000Z";

/** Idempotently seed the Roots Untold catalog. Safe to call repeatedly. */
export async function seedRootsUntold(store?: Firestore): Promise<SeedResult> {
  await createArtist(ARTIST, store);
  await createRelease(RELEASE, store);
  const tracks: Track[] = [];
  const provenance: ProvenanceRecord[] = [];
  for (const { track, masterPath, masterBytes } of TRACKS) {
    tracks.push(await createTrack(track, store));
    await setTrackMaster(track.id, masterPath, store);
    // PUBLIC AI-provenance disclosure per track, bound to the master bytes.
    const record: ProvenanceRecord = {
      trackId: track.id,
      generator: SEED_GENERATOR,
      createdAt: SEED_PROVENANCE_CREATED_AT,
      disclosure: SEED_DISCLOSURE,
      contentSha256: contentSha256(masterBytes),
    };
    provenance.push(await setProvenance(record, store));
  }
  await createProduct(PRODUCT, store);
  // SENSITIVE ownership splits -> admin-only rights collection (never public).
  const rights = await setRights(FOUNDATION_RELEASE_ID, OWNERSHIP_SPLITS, store);
  return { artist: ARTIST, release: RELEASE, tracks, product: PRODUCT, rights, provenance };
}
