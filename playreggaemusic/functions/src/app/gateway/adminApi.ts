/**
 * Admin-guarded callable API (B07).
 *
 * The owner-only admin console (web `/admin` + `/admin/agent`) calls these
 * callables. Every one verifies `request.auth.token.admin === true` (a Firebase
 * Auth custom claim the operator sets on the owner account at handoff) and
 * rejects everyone else with an HttpsError `permission-denied`.
 *
 * Application layer: this module MAY import harness/* and app/* (it wires the
 * label store + the lead agent). The harness never imports it (boundary test).
 *
 * Test posture: the AUTH GUARD is unit-tested directly (admin allowed /
 * non-admin rejected) against the pure `handle*` functions below, with the
 * agent runner INJECTED so NO live LLM is ever called. The `runAgent` callable
 * requires a model at runtime; the model factory reads ANTHROPIC_API_KEY from
 * the environment and is only invoked once the operator supplies a key at
 * handoff (manifest §9 approval gate).
 */
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  createArtist,
  createProduct,
  createRelease,
  listOrders,
  setProvenance,
  setReleaseIdentifiers,
  setRights,
  setTrackISRC,
} from "../label/store";
import {
  contentSha256,
  defaultBucket,
  generatePreview,
  ingestMaster,
  UnconfiguredPreviewEncoder,
  type PreviewEncoder,
  type StorageBucketLike,
} from "../label/assets";
import type {
  Artist,
  Credit,
  Order,
  Product,
  ProvenanceRecord,
  Release,
  RightsRecord,
  Track,
} from "../label";
import { buildLabelAgent } from "../agent/leadAgent";
import { createChatModel } from "../../harness/models";
import type { ChatModelLike } from "../../harness/runtime";

/**
 * The minimal auth shape the guard needs. `CallableRequest.auth` is optional
 * (unauthenticated calls have none) and its token carries the custom claims.
 */
export interface AdminAuthContext {
  uid: string;
  token: { admin?: unknown };
}

/** Subset of `CallableRequest` the handlers consume — lets unit tests build a
 * plain object without constructing a full Functions request. */
export interface AdminRequest<T> {
  auth?: AdminAuthContext;
  data: T;
}

/**
 * Assert the caller is an authenticated admin. Throws `permission-denied`
 * otherwise — the SINGLE choke point every admin handler runs first. Kept pure
 * (no Functions runtime dependency) so it is exhaustively unit-testable.
 */
export function assertAdmin(auth: AdminAuthContext | undefined): void {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  if (auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin privileges required.");
  }
}

// ---------------------------------------------------------------------------
// Input schemas (zod 3.23.8) — reject malformed payloads before any write.
// ---------------------------------------------------------------------------

const linksSchema = z
  .object({
    spotify: z.string().optional(),
    appleMusic: z.string().optional(),
    youtube: z.string().optional(),
    instagram: z.string().optional(),
  })
  .default({});

const artistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bio: z.string(),
  photoPath: z.string().optional(),
  links: linksSchema,
});

const releaseSchema = z.object({
  id: z.string().min(1),
  artistId: z.string().min(1),
  title: z.string().min(1),
  catalogNumber: z.string().min(1),
  type: z.enum(["album", "ep", "single"]),
  releaseDate: z.string().min(1),
});

const productSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["music_download", "merch"]),
  title: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().min(1),
  releaseId: z.string().optional(),
  polarProductId: z.string().optional(),
  polarPriceId: z.string().optional(),
});

const creditSchema = z.object({
  role: z.string().min(1),
  name: z.string().min(1),
});

const setIdentifiersSchema = z
  .object({
    releaseId: z.string().min(1),
    upc: z.string().min(1).optional(),
    credits: z.array(creditSchema).optional(),
    trackIsrcs: z.array(z.object({ trackId: z.string().min(1), isrc: z.string().min(1) })).optional(),
  })
  .refine(
    (v) => v.upc !== undefined || v.credits !== undefined || (v.trackIsrcs?.length ?? 0) > 0,
    { message: "Provide at least one of upc, credits, or trackIsrcs." },
  );

const setOwnershipSplitsSchema = z.object({
  releaseId: z.string().min(1),
  splits: z.array(z.object({ payee: z.string().min(1), percent: z.number() })),
});

const ingestMasterApiSchema = z.object({
  trackId: z.string().min(1),
  masterPath: z.string().min(1),
  contentBase64: z.string().min(1),
});

const generatePreviewApiSchema = z.object({
  trackId: z.string().min(1),
  previewClipPath: z.string().min(1),
  masterContentBase64: z.string().min(1),
});

const setProvenanceApiSchema = z.object({
  trackId: z.string().min(1),
  generator: z.string().min(1),
  model: z.string().min(1).optional(),
  disclosure: z.string().min(1),
  contentBase64: z.string().min(1),
});

const runAgentSchema = z.object({
  prompt: z.string().min(1),
});

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpsError("invalid-argument", result.error.issues[0]?.message ?? "Invalid input.");
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Pure handlers — auth-guarded, runtime-agnostic. Unit-tested directly.
// ---------------------------------------------------------------------------

export async function handleCreateArtist(req: AdminRequest<unknown>): Promise<Artist> {
  assertAdmin(req.auth);
  const input = parse(artistSchema, req.data);
  const artist: Artist = {
    id: input.id,
    name: input.name,
    bio: input.bio,
    photoPath: input.photoPath,
    links: input.links ?? {},
  };
  return createArtist(artist);
}

export async function handleCreateRelease(req: AdminRequest<unknown>): Promise<Release> {
  assertAdmin(req.auth);
  const input = parse(releaseSchema, req.data);
  const release: Release = {
    id: input.id,
    artistId: input.artistId,
    title: input.title,
    catalogNumber: input.catalogNumber,
    type: input.type,
    releaseDate: input.releaseDate,
    aiGenerated: true,
  };
  return createRelease(release);
}

export async function handleCreateProduct(req: AdminRequest<unknown>): Promise<Product> {
  assertAdmin(req.auth);
  const input = parse(productSchema, req.data);
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
  return createProduct(product);
}

export async function handleListOrders(req: AdminRequest<unknown>): Promise<Order[]> {
  assertAdmin(req.auth);
  return listOrders();
}

/** Result of `adminSetIdentifiers`: the updated release + any updated tracks. */
export interface SetIdentifiersResult {
  release: Release;
  tracks: Track[];
}

/**
 * Set the PUBLIC identifiers on a release: UPC/EAN, credits, and per-track
 * ISRCs. The store validates every identifier (bad UPC check digit / bad ISRC
 * format throws), so invalid input is rejected before persisting.
 */
export async function handleSetIdentifiers(
  req: AdminRequest<unknown>,
): Promise<SetIdentifiersResult> {
  assertAdmin(req.auth);
  const input = parse(setIdentifiersSchema, req.data);
  const credits: Credit[] | undefined = input.credits?.map((c) => ({
    role: c.role,
    name: c.name,
  }));
  try {
    const release = await setReleaseIdentifiers(input.releaseId, {
      upc: input.upc,
      credits,
    });
    const tracks: Track[] = [];
    for (const { trackId, isrc } of input.trackIsrcs ?? []) {
      tracks.push(await setTrackISRC(trackId, isrc));
    }
    return { release, tracks };
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/**
 * Re-wrap a store validation `Error` (bad identifier / bad splits) as an
 * `invalid-argument` HttpsError so callers get a clean client error. Anything
 * already an HttpsError is rethrown unchanged.
 */
function asInvalidArgument(e: unknown): unknown {
  if (e instanceof HttpsError) {
    return e;
  }
  const message = e instanceof Error ? e.message : "Invalid input.";
  return new HttpsError("invalid-argument", message);
}

/**
 * Set the SENSITIVE ownership splits for a release. Writes ONLY to the
 * admin-only `rights` collection (never the public release doc). The store
 * validates the splits (a non-empty set must sum to 100), so invalid splits
 * are rejected before persisting.
 */
export async function handleSetOwnershipSplits(
  req: AdminRequest<unknown>,
): Promise<RightsRecord> {
  assertAdmin(req.auth);
  const input = parse(setOwnershipSplitsSchema, req.data);
  try {
    return await setRights(
      input.releaseId,
      input.splits.map((s) => ({ payee: s.payee, percent: s.percent })),
    );
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

// ---------------------------------------------------------------------------
// Asset pipeline (P2B02) — admin-guarded master/preview/provenance handlers.
// Storage bucket + preview encoder are INJECTED so unit tests pass fakes and
// never run real ffmpeg or touch a live bucket. Production defaults: the admin
// Storage default bucket and the deploy-time stub encoder.
// ---------------------------------------------------------------------------

/** Injected dependencies for the asset handlers. */
export interface AssetApiDeps {
  resolveBucket: () => Promise<StorageBucketLike>;
  encoder: PreviewEncoder;
}

const DEFAULT_ASSET_DEPS: AssetApiDeps = {
  resolveBucket: defaultBucket,
  encoder: new UnconfiguredPreviewEncoder(),
};

/** Result of `adminIngestMaster`: the private path + master content hash. */
export interface IngestMasterResult {
  trackId: string;
  masterPath: string;
  contentSha256: string;
}

/**
 * Ingest a track master to PRIVATE Storage and record it in the admin-only
 * track_masters collection. Validation errors (bad extension/prefix/empty
 * bytes) surface as `invalid-argument`.
 */
export async function handleIngestMaster(
  req: AdminRequest<unknown>,
  deps: AssetApiDeps = DEFAULT_ASSET_DEPS,
): Promise<IngestMasterResult> {
  assertAdmin(req.auth);
  const input = parse(ingestMasterApiSchema, req.data);
  const bytes = Buffer.from(input.contentBase64, "base64");
  try {
    const bucket = await deps.resolveBucket();
    return await ingestMaster(input.trackId, input.masterPath, bytes, { bucket });
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/** Result of `adminGeneratePreview`: the public preview-clip path. */
export interface GeneratePreviewResult {
  trackId: string;
  previewClipPath: string;
}

/**
 * Generate a PUBLIC preview clip from supplied master bytes via the injected
 * encoder and set the track's previewClipPath. Validation errors surface as
 * `invalid-argument`.
 */
export async function handleGeneratePreview(
  req: AdminRequest<unknown>,
  deps: AssetApiDeps = DEFAULT_ASSET_DEPS,
): Promise<GeneratePreviewResult> {
  assertAdmin(req.auth);
  const input = parse(generatePreviewApiSchema, req.data);
  const masterBytes = Buffer.from(input.masterContentBase64, "base64");
  try {
    const bucket = await deps.resolveBucket();
    return await generatePreview(input.trackId, input.previewClipPath, masterBytes, {
      bucket,
      encoder: deps.encoder,
    });
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/**
 * Write a track's PUBLIC C2PA-style AI-provenance disclosure record, binding it
 * to the master bytes via a SHA-256 content hash.
 */
export async function handleSetProvenance(
  req: AdminRequest<unknown>,
): Promise<ProvenanceRecord> {
  assertAdmin(req.auth);
  const input = parse(setProvenanceApiSchema, req.data);
  const record: ProvenanceRecord = {
    trackId: input.trackId,
    generator: input.generator,
    model: input.model,
    createdAt: new Date().toISOString(),
    disclosure: input.disclosure,
    contentSha256: contentSha256(Buffer.from(input.contentBase64, "base64")),
  };
  return setProvenance(record);
}

/** A transcript line surfaced in the agent console. */
export interface TranscriptEntry {
  role: "system" | "human" | "ai" | "tool";
  content: string;
}

export interface RunAgentResult {
  transcript: TranscriptEntry[];
}

/**
 * Runs the assembled label agent for the admin console. The `modelFactory` is
 * INJECTED so unit tests can supply a scripted model — production passes the
 * Claude-backed factory, which only reaches the network once an operator has
 * supplied ANTHROPIC_API_KEY. NO live LLM is ever called in a test.
 */
export async function handleRunAgent(
  req: AdminRequest<unknown>,
  modelFactory: () => ChatModelLike = createChatModel,
): Promise<RunAgentResult> {
  assertAdmin(req.auth);
  const input = parse(runAgentSchema, req.data);
  const agent = buildLabelAgent({ model: modelFactory() });
  const messages: BaseMessage[] = [
    new SystemMessage(agent.systemPrompt),
    new HumanMessage(input.prompt),
  ];
  const result = await agent.graph.invoke({ messages });
  const transcript: TranscriptEntry[] = result.messages.map((m) => ({
    role: roleOf(m),
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  }));
  return { transcript };
}

function roleOf(message: BaseMessage): TranscriptEntry["role"] {
  const type = message.getType();
  if (type === "system") return "system";
  if (type === "human") return "human";
  if (type === "tool") return "tool";
  return "ai";
}

// ---------------------------------------------------------------------------
// Callable bindings — thin adapters from CallableRequest to the pure handlers.
// ---------------------------------------------------------------------------

function toAdminRequest<T>(request: CallableRequest<T>): AdminRequest<T> {
  const auth = request.auth
    ? { uid: request.auth.uid, token: request.auth.token as { admin?: unknown } }
    : undefined;
  return { auth, data: request.data };
}

export const adminCreateArtist = onCall((request) => handleCreateArtist(toAdminRequest(request)));
export const adminCreateRelease = onCall((request) => handleCreateRelease(toAdminRequest(request)));
export const adminCreateProduct = onCall((request) => handleCreateProduct(toAdminRequest(request)));
export const adminListOrders = onCall((request) => handleListOrders(toAdminRequest(request)));
export const adminSetIdentifiers = onCall((request) =>
  handleSetIdentifiers(toAdminRequest(request)),
);
export const adminSetOwnershipSplits = onCall((request) =>
  handleSetOwnershipSplits(toAdminRequest(request)),
);
export const adminIngestMaster = onCall((request) =>
  handleIngestMaster(toAdminRequest(request)),
);
export const adminGeneratePreview = onCall((request) =>
  handleGeneratePreview(toAdminRequest(request)),
);
export const adminSetProvenance = onCall((request) =>
  handleSetProvenance(toAdminRequest(request)),
);
// `runAgent` invokes the Claude-backed model factory, which reads
// ANTHROPIC_API_KEY from the environment — bind it so the secret is present at
// runtime (Functions v2 does not auto-inject Secret Manager values).
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

export const runAgent = onCall({ secrets: [anthropicApiKey] }, (request) =>
  handleRunAgent(toAdminRequest(request)),
);
