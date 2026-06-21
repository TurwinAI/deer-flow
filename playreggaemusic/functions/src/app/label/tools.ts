/**
 * Agent catalog tools (B05). DynamicStructuredTool wrappers around the label
 * store so the lead agent can operate the catalog (create artists/releases/
 * tracks/products, query orders).
 *
 * Application layer: imports the harness tool types + zod (allowed direction).
 * These are NOT wired into the agent graph here — that happens in B06. This
 * module only builds and exports them so they can be tested in isolation.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import {
  createArtist,
  createProduct,
  createRelease,
  createTrack,
  listOrders,
  setTrackMaster,
} from "./store";
import type { Artist, Product, Release, Track } from "./index";

const releaseTypeSchema = z.enum(["album", "ep", "single"]);
const productTypeSchema = z.enum(["music_download", "merch"]);

const createArtistSchema = z.object({
  id: z.string().describe("deterministic document id, e.g. a slug like 'roots-untold'"),
  name: z.string().describe("artist display name"),
  bio: z.string().describe("short artist biography"),
  photoPath: z.string().optional().describe("Storage path to the artist photo (optional)"),
  spotify: z.string().optional().describe("Spotify profile URL (optional)"),
  appleMusic: z.string().optional().describe("Apple Music profile URL (optional)"),
  youtube: z.string().optional().describe("YouTube channel URL (optional)"),
  instagram: z.string().optional().describe("Instagram profile URL (optional)"),
});

const createReleaseSchema = z.object({
  id: z.string().describe("deterministic document id for the release"),
  artistId: z.string().describe("id of the artist this release belongs to"),
  title: z.string().describe("release title"),
  catalogNumber: z.string().describe("label catalog number, e.g. 'PRM-001'"),
  type: releaseTypeSchema.describe("release type"),
  releaseDate: z.string().describe("release date (ISO 8601 date, e.g. '2026-07-01')"),
});

const createTrackSchema = z.object({
  id: z.string().describe("deterministic document id for the track"),
  releaseId: z.string().describe("id of the release this track belongs to"),
  title: z.string().describe("track title"),
  durationSec: z.number().int().positive().describe("track duration in whole seconds"),
  previewClipPath: z.string().describe("public Storage path under previews/"),
  masterPath: z
    .string()
    .describe(
      "private Storage path under masters/. Stored PRIVATELY in track_masters/ " +
        "(admin-only) — never written to the world-readable public track doc.",
    ),
});

const createProductSchema = z.object({
  id: z.string().describe("deterministic document id for the product"),
  type: productTypeSchema.describe("product type; v1 sells music_download only"),
  title: z.string().describe("product title"),
  priceCents: z.number().int().nonnegative().describe("price in minor currency units (cents)"),
  currency: z.string().describe("ISO 4217 currency code, e.g. 'USD'"),
  releaseId: z.string().optional().describe("id of the release this product unlocks (optional)"),
  polarProductId: z.string().optional().describe("Polar product id once created (optional)"),
  polarPriceId: z.string().optional().describe("Polar price id once created (optional)"),
});

const listOrdersSchema = z.object({});

export const createArtistTool = new DynamicStructuredTool({
  name: "create_artist",
  description: "Create or overwrite an artist in the label catalog.",
  schema: createArtistSchema,
  func: async (input: z.infer<typeof createArtistSchema>): Promise<string> => {
    const artist: Artist = {
      id: input.id,
      name: input.name,
      bio: input.bio,
      photoPath: input.photoPath,
      links: {
        spotify: input.spotify,
        appleMusic: input.appleMusic,
        youtube: input.youtube,
        instagram: input.instagram,
      },
    };
    await createArtist(artist);
    return `Created artist ${artist.id} (${artist.name}).`;
  },
});

export const createReleaseTool = new DynamicStructuredTool({
  name: "create_release",
  description: "Create or overwrite a release linked to an artist. Always AI-generated.",
  schema: createReleaseSchema,
  func: async (input: z.infer<typeof createReleaseSchema>): Promise<string> => {
    const release: Release = {
      id: input.id,
      artistId: input.artistId,
      title: input.title,
      catalogNumber: input.catalogNumber,
      type: input.type,
      releaseDate: input.releaseDate,
      aiGenerated: true,
    };
    await createRelease(release);
    return `Created release ${release.id} (${release.catalogNumber} — ${release.title}) for artist ${release.artistId}.`;
  },
});

export const createTrackTool = new DynamicStructuredTool({
  name: "create_track",
  description:
    "Create or overwrite a track on a release. Writes a PUBLIC, world-readable " +
    "track doc (no master path) and stores the private master path separately " +
    "in the admin-only track_masters collection.",
  schema: createTrackSchema,
  func: async (input: z.infer<typeof createTrackSchema>): Promise<string> => {
    const track: Track = {
      id: input.id,
      releaseId: input.releaseId,
      title: input.title,
      durationSec: input.durationSec,
      previewClipPath: input.previewClipPath,
    };
    await createTrack(track);
    await setTrackMaster(input.id, input.masterPath);
    return `Created track ${track.id} (${track.title}) on release ${track.releaseId}.`;
  },
});

export const createProductTool = new DynamicStructuredTool({
  name: "create_product",
  description: "Create or overwrite a sellable product (v1: music_download).",
  schema: createProductSchema,
  func: async (input: z.infer<typeof createProductSchema>): Promise<string> => {
    const product: Product = {
      id: input.id,
      type: input.type,
      title: input.title,
      priceCents: input.priceCents,
      currency: input.currency,
      releaseId: input.releaseId,
      polarProductId: input.polarProductId,
      polarPriceId: input.polarPriceId,
    };
    await createProduct(product);
    return `Created product ${product.id} (${product.title}, ${product.priceCents} ${product.currency}).`;
  },
});

export const listOrdersTool = new DynamicStructuredTool({
  name: "list_orders",
  description: "List all mirrored Polar orders as JSON.",
  schema: listOrdersSchema,
  func: async (): Promise<string> => {
    const orders = await listOrders();
    return JSON.stringify(orders);
  },
});

/** All catalog-operation tools the lead agent uses to run the label. */
export function getLabelTools(): StructuredToolInterface[] {
  return [
    createArtistTool,
    createReleaseTool,
    createTrackTool,
    createProductTool,
    listOrdersTool,
  ];
}
