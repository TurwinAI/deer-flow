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
import { deliverRelease, scheduleRelease } from "../distribution/release";
import type { DistributionRecord } from "../distribution/store";
import { DdexDistributorClient, type DistributorClient } from "../distribution/client";
import {
  PolarRevenueSource,
  FakeDistributorRevenueSource,
  FakePRORevenueSource,
  ingestRevenue,
  type RevenueIngestResult,
  type ProductReleaseMap,
  type RevenueEvent,
  type RevenueSource,
} from "../finance/revenue";
import { generateStatement, listStatements, type RoyaltyStatement } from "../finance/statements";
import { proposePayout, type Payout } from "../finance/payout";
import {
  registerWork,
  setWriterSplits,
  type Work,
  type WorkSplits,
} from "../publishing/works";
import {
  registerProAffiliation,
  RealProRegistrar,
  type Pro,
  type ProAffiliation,
  type ProRegistrar,
  type ProRegistrationConfirmation,
} from "../publishing/pro";
import {
  addToSyncCatalog,
  clearSyncLicense,
  issueSyncLicense,
  requestSyncLicense,
  type SyncCatalogEntry,
  type SyncLicense,
} from "../publishing/sync";
import {
  planAndSaveCampaign,
  listCampaigns,
  recordMarketingEvent,
  type Campaign,
} from "../marketing/campaign";
import { scheduleCampaign, type ScheduleCampaignResult } from "../marketing/scheduling";
import {
  RealSocialChannel,
  RealEmailChannel,
  RealAdChannel,
  type SocialChannel,
  type EmailChannel,
  type AdChannel,
  type SocialPostResult,
  type EmailBlastResult,
  type AdSpendResult,
} from "../marketing/channels";
import { FakeScheduler, type Scheduler } from "../../harness/orchestration";
import { buildLabelAgent } from "../agent/leadAgent";
import { createChatModel } from "../../harness/models";
import type { ChatModelLike } from "../../harness/runtime";
import {
  approve,
  listPendingApprovals,
  listAuditEntries,
  type ApprovalRecord,
  type AuditEntry,
} from "../../harness/orchestration";

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

const scheduleReleaseApiSchema = z.object({
  releaseId: z.string().min(1),
  scheduledAt: z.string().min(1),
});

const deliverReleaseApiSchema = z.object({
  releaseId: z.string().min(1),
  // The admin explicitly approving this consequential action. Required true.
  approved: z.literal(true),
});

const runAgentSchema = z.object({
  prompt: z.string().min(1),
});

const approveSchema = z.object({
  approvalId: z.string().min(1),
});

const listAuditSchema = z.object({
  threadId: z.string().min(1),
});

// Finance (P2B05, F7) schemas.
const revenueEventInputSchema = z.object({
  id: z.string().min(1),
  releaseId: z.string().min(1).optional(),
  trackId: z.string().min(1).optional(),
  grossCents: z.number().int(),
  currency: z.string().min(1),
  occurredAt: z.string().min(1),
});

const ingestRevenueSchema = z.object({
  period: z.string().min(1),
  /** Optional product→release map so D2C order revenue is attributed. */
  productReleaseMap: z.record(z.string(), z.string()).optional(),
  /** Optional deterministic distributor (DSP) income fixtures. */
  distributorEvents: z.array(revenueEventInputSchema).optional(),
  /** Optional deterministic PRO (publishing) income fixtures. */
  proEvents: z.array(revenueEventInputSchema).optional(),
});

const generateStatementApiSchema = z.object({
  artistId: z.string().min(1),
  period: z.string().min(1),
  deductionsCents: z.number().int().nonnegative().optional(),
  payeeName: z.string().min(1).optional(),
});

const listStatementsSchema = z.object({
  artistId: z.string().min(1).optional(),
});

const proposePayoutApiSchema = z.object({
  artistId: z.string().min(1),
  statementId: z.string().min(1),
  currency: z.string().min(1).optional(),
});

// Publishing & sync (P2B06, F8/F9) schemas.
const registerWorkApiSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  iswc: z.string().min(1).optional(),
  linkedIsrcs: z.array(z.string().min(1)).default([]),
});

const setWriterSplitsApiSchema = z.object({
  workId: z.string().min(1),
  splits: z.array(z.object({ payee: z.string().min(1), percent: z.number() })),
});

const registerProAffiliationApiSchema = z.object({
  writerId: z.string().min(1),
  pro: z.enum(["ASCAP", "BMI", "SESAC", "MLC"]),
  ipi: z.string().min(1).optional(),
  memberId: z.string().min(1).optional(),
});

const addToSyncCatalogApiSchema = z.object({
  recordingId: z.string().min(1),
  workId: z.string().min(1),
  title: z.string().min(1),
  available: z.boolean().optional(),
});

const requestSyncLicenseApiSchema = z.object({
  id: z.string().min(1),
  recordingId: z.string().min(1),
  workId: z.string().min(1),
  licensee: z.string().min(1),
  mediaType: z.string().min(1),
  territory: z.string().min(1),
  termMonths: z.number().int().positive(),
  feeCents: z.number().int().nonnegative(),
});

const clearSyncLicenseApiSchema = z.object({
  licenseId: z.string().min(1),
});

const issueSyncLicenseApiSchema = z.object({
  licenseId: z.string().min(1),
  // The admin explicitly approving this CONSEQUENTIAL, binding action. Required true.
  approved: z.literal(true),
});

// Marketing & promotion (P2B07, F5) schemas.
const planCampaignApiSchema = z.object({
  releaseId: z.string().min(1),
  budgetCents: z.number().int().nonnegative().optional(),
  campaignId: z.string().min(1).optional(),
});

const scheduleCampaignApiSchema = z.object({
  campaignId: z.string().min(1),
  baseTime: z.string().min(1),
  cadenceDays: z.number().int().positive().optional(),
});

const publishSocialPostApiSchema = z.object({
  platform: z.string().min(1),
  message: z.string().min(1),
  assetPath: z.string().min(1).optional(),
  // The admin explicitly approving this CONSEQUENTIAL public broadcast. Required true.
  approved: z.literal(true),
});

const sendEmailBlastApiSchema = z.object({
  segment: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  // The admin explicitly approving this CONSEQUENTIAL outward send. Required true.
  approved: z.literal(true),
});

const marketingSpendApiSchema = z.object({
  platform: z.string().min(1),
  budgetCents: z.number().int().positive(),
  currency: z.string().min(1),
  objective: z.string().min(1),
  // The admin explicitly approving this CONSEQUENTIAL spend. Required true.
  approved: z.literal(true),
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

// ---------------------------------------------------------------------------
// Distribution (P2B03, F4) — admin-guarded scheduling + the CONSEQUENTIAL
// deliver-to-DSP, gated on the admin explicitly approving (`approved: true`).
// The distributor client is INJECTED so unit tests pass a FakeDistributorClient
// and the real DdexDistributorClient is never constructed/invoked in a test.
// ---------------------------------------------------------------------------

/**
 * Schedule a release for DSP distribution. Records the intent (status
 * "scheduled"); does not deliver. Unknown-release / validation errors surface as
 * `invalid-argument`.
 */
export async function handleScheduleRelease(
  req: AdminRequest<unknown>,
): Promise<DistributionRecord> {
  assertAdmin(req.auth);
  const input = parse(scheduleReleaseApiSchema, req.data);
  try {
    return await scheduleRelease(input.releaseId, input.scheduledAt);
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/**
 * Deliver a release to DSPs (CONSEQUENTIAL). The admin passing `approved: true`
 * represents the human-in-the-loop approval of this action; the schema requires
 * it (a missing/false `approved` is rejected as `invalid-argument` before any
 * delivery). The distributor client is injected; production passes a real
 * `DdexDistributorClient` (which only reaches out with an operator-supplied
 * token at handoff), tests pass a `FakeDistributorClient`.
 */
export async function handleDeliverRelease(
  req: AdminRequest<unknown>,
  client: DistributorClient = new DdexDistributorClient(),
): Promise<DistributionRecord> {
  assertAdmin(req.auth);
  const input = parse(deliverReleaseApiSchema, req.data);
  try {
    return await deliverRelease(input.releaseId, { client, approved: input.approved });
  } catch (e) {
    throw asInvalidArgument(e);
  }
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
// Autonomy orchestration (P2B04, F12) — admin-guarded approval + audit review.
// These drive the human-in-the-loop side of the ApprovalGate: an admin lists
// what the agent blocked pending approval, approves a specific request (which
// lets the SAME consequential call execute on the next run), and reviews the
// full per-thread audit trail. The orchestration stores default to Firestore
// (admin SDK); the handlers are auth-guarded + runtime-agnostic for unit tests.
// ---------------------------------------------------------------------------

/** List all consequential calls the agent has BLOCKED pending human approval. */
export async function handleListPendingApprovals(
  req: AdminRequest<unknown>,
): Promise<ApprovalRecord[]> {
  assertAdmin(req.auth);
  return listPendingApprovals();
}

/**
 * Approve one pending consequential call (the human-in-the-loop decision). After
 * approval, the SAME (tool, args) call executes the next time the agent issues
 * it. Unknown-approval errors surface as `invalid-argument`.
 */
export async function handleApprove(
  req: AdminRequest<unknown>,
): Promise<ApprovalRecord> {
  assertAdmin(req.auth);
  const input = parse(approveSchema, req.data);
  try {
    return await approve(input.approvalId);
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/** Read a thread's full agent audit trail (every tool call, in order). */
export async function handleListAudit(
  req: AdminRequest<unknown>,
): Promise<AuditEntry[]> {
  assertAdmin(req.auth);
  const input = parse(listAuditSchema, req.data);
  return listAuditEntries(input.threadId);
}

// ---------------------------------------------------------------------------
// Royalties & finance (P2B05, F7) — admin-guarded ingestion, statements, and
// payout PROPOSALS. Revenue ingestion reads the local Polar `orders` mirror
// (no network) and, when supplied, deterministic distributor/PRO fixtures. The
// REAL distributor/PRO revenue sources are operator-side and are NEVER wired in
// here. proposePayout writes a "proposed" record only — there is NO live payout.
// ---------------------------------------------------------------------------

/**
 * Ingest revenue for a period into the admin-only `revenue_events` store. Always
 * pulls the local Polar `orders` mirror; optionally also ingests deterministic
 * distributor/PRO fixtures supplied by the caller. No live revenue API is ever
 * reached.
 */
export async function handleIngestRevenue(req: AdminRequest<unknown>): Promise<RevenueIngestResult> {
  assertAdmin(req.auth);
  const input = parse(ingestRevenueSchema, req.data);
  const map: ProductReleaseMap = input.productReleaseMap ?? {};
  const sources: RevenueSource[] = [new PolarRevenueSource(map)];
  if (input.distributorEvents && input.distributorEvents.length > 0) {
    sources.push(new FakeDistributorRevenueSource(input.distributorEvents as Omit<RevenueEvent, "source">[]));
  }
  if (input.proEvents && input.proEvents.length > 0) {
    sources.push(new FakePRORevenueSource(input.proEvents as Omit<RevenueEvent, "source">[]));
  }
  return ingestRevenue(sources, input.period);
}

/** Generate + store a per-artist royalty statement (totals reconcile). */
export async function handleGenerateStatement(
  req: AdminRequest<unknown>,
): Promise<RoyaltyStatement> {
  assertAdmin(req.auth);
  const input = parse(generateStatementApiSchema, req.data);
  try {
    return await generateStatement(input.artistId, input.period, {
      deductionsCents: input.deductionsCents,
      payeeName: input.payeeName,
    });
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/** List stored royalty statements, optionally filtered to one artist. */
export async function handleListStatements(
  req: AdminRequest<unknown>,
): Promise<RoyaltyStatement[]> {
  assertAdmin(req.auth);
  const input = parse(listStatementsSchema, req.data);
  return listStatements(input.artistId);
}

/**
 * Propose a payout for an artist's statement (status "proposed", amount =
 * statement net). Does NOT pay — executing a payout is consequential and gated
 * by the ApprovalGate's `initiate_payout`. Unknown-statement errors surface as
 * `invalid-argument`.
 */
export async function handleProposePayout(req: AdminRequest<unknown>): Promise<Payout> {
  assertAdmin(req.auth);
  const input = parse(proposePayoutApiSchema, req.data);
  try {
    return await proposePayout(input.artistId, input.statementId, { currency: input.currency });
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

// ---------------------------------------------------------------------------
// Publishing & sync (P2B06, F8/F9) — admin-guarded works registry, writer
// splits, PRO/MLC affiliation, sync catalog, and the sync-license flow. Writer
// splits go ONLY to the admin-only work_splits collection (never the public
// works doc). The PRO registrar is INJECTED; production passes a RealProRegistrar
// (throws without operator creds), tests pass a FakeProRegistrar — NO live
// PRO/MLC call in any test. `issueSyncLicense` is CONSEQUENTIAL and is gated on
// the admin explicitly approving (`approved: true`), mirroring adminDeliverRelease.
// ---------------------------------------------------------------------------

/** Register a composition (PUBLIC works doc only — never writer splits). */
export async function handleRegisterWork(req: AdminRequest<unknown>): Promise<Work> {
  assertAdmin(req.auth);
  const input = parse(registerWorkApiSchema, req.data);
  try {
    return await registerWork({
      id: input.id,
      title: input.title,
      iswc: input.iswc,
      linkedIsrcs: input.linkedIsrcs ?? [],
    });
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/** Set a work's SENSITIVE writer splits (admin-only work_splits; must sum 100). */
export async function handleSetWriterSplits(req: AdminRequest<unknown>): Promise<WorkSplits> {
  assertAdmin(req.auth);
  const input = parse(setWriterSplitsApiSchema, req.data);
  try {
    return await setWriterSplits(
      input.workId,
      input.splits.map((s) => ({ payee: s.payee, percent: s.percent })),
    );
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/**
 * Register a writer's PRO/MLC affiliation via the injected registrar, then
 * persist it to the admin-only pro_affiliations collection. Production passes a
 * RealProRegistrar (which throws without operator-supplied PRO_API_TOKEN at
 * handoff); unit tests pass a FakeProRegistrar so NO live call is made.
 */
export async function handleRegisterProAffiliation(
  req: AdminRequest<unknown>,
  registrar: ProRegistrar = new RealProRegistrar(),
): Promise<ProRegistrationConfirmation> {
  assertAdmin(req.auth);
  const input = parse(registerProAffiliationApiSchema, req.data);
  const affiliation: ProAffiliation = {
    writerId: input.writerId,
    pro: input.pro as Pro,
    ipi: input.ipi,
    memberId: input.memberId,
  };
  try {
    return await registerProAffiliation(affiliation, registrar);
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/** Add a recording to the PUBLIC sync catalog (admin-write). */
export async function handleAddToSyncCatalog(req: AdminRequest<unknown>): Promise<SyncCatalogEntry> {
  assertAdmin(req.auth);
  const input = parse(addToSyncCatalogApiSchema, req.data);
  try {
    return await addToSyncCatalog({
      recordingId: input.recordingId,
      workId: input.workId,
      title: input.title,
      available: input.available,
    });
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/** Record an inbound sync-license REQUEST (status "requested"). */
export async function handleRequestSyncLicense(req: AdminRequest<unknown>): Promise<SyncLicense> {
  assertAdmin(req.auth);
  const input = parse(requestSyncLicenseApiSchema, req.data);
  try {
    return await requestSyncLicense({
      id: input.id,
      recordingId: input.recordingId,
      workId: input.workId,
      licensee: input.licensee,
      mediaType: input.mediaType,
      territory: input.territory,
      termMonths: input.termMonths,
      feeCents: input.feeCents,
    });
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/** Clear a requested sync license (verify master + composition). */
export async function handleClearSyncLicense(req: AdminRequest<unknown>): Promise<SyncLicense> {
  assertAdmin(req.auth);
  const input = parse(clearSyncLicenseApiSchema, req.data);
  try {
    return await clearSyncLicense(input.licenseId);
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/**
 * Issue a CLEARED sync license (CONSEQUENTIAL). The admin passing `approved:
 * true` represents the human-in-the-loop approval; the schema requires it (a
 * missing/false `approved` is rejected as `invalid-argument` before any issue).
 * Stamps the placeholder license text + status "issued".
 */
export async function handleIssueSyncLicense(req: AdminRequest<unknown>): Promise<SyncLicense> {
  assertAdmin(req.auth);
  const input = parse(issueSyncLicenseApiSchema, req.data);
  try {
    return await issueSyncLicense(input.licenseId);
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

// ---------------------------------------------------------------------------
// Marketing & promotion (P2B07, F5) — admin-guarded campaign planning +
// scheduling (NON-consequential, no outward effect) and the CONSEQUENTIAL
// outward/spending actions (publish/email/spend), each gated on the admin
// explicitly approving (`approved: true`), mirroring adminDeliverRelease. The
// channels are INJECTED; production passes the Real* stubs (which throw without
// operator-supplied creds at handoff), tests pass Fake channels — NO live
// social/email/ad call occurs in any test. Every fired outward action is logged
// to the admin-only marketing_events sent-log.
// ---------------------------------------------------------------------------

/** Plan + persist a release campaign (NON-consequential; no outward effect). */
export async function handlePlanCampaign(req: AdminRequest<unknown>): Promise<Campaign> {
  assertAdmin(req.auth);
  const input = parse(planCampaignApiSchema, req.data);
  try {
    return await planAndSaveCampaign(input.releaseId, {
      budgetCents: input.budgetCents,
      campaignId: input.campaignId,
    });
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/**
 * Schedule a planned campaign's steps via the injected scheduler (NON-
 * consequential; records scheduled runs + step times, no outward effect).
 * Production defaults to a FakeScheduler (the real Cloud Scheduler is wired at
 * handoff); tests inject a FakeScheduler.
 */
export async function handleScheduleCampaign(
  req: AdminRequest<unknown>,
  scheduler: Scheduler = new FakeScheduler(),
): Promise<ScheduleCampaignResult> {
  assertAdmin(req.auth);
  const input = parse(scheduleCampaignApiSchema, req.data);
  try {
    return await scheduleCampaign(input.campaignId, scheduler, {
      baseTime: input.baseTime,
      cadenceDays: input.cadenceDays,
    });
  } catch (e) {
    throw asInvalidArgument(e);
  }
}

/** List all campaigns (admin-only). */
export async function handleListCampaigns(req: AdminRequest<unknown>): Promise<Campaign[]> {
  assertAdmin(req.auth);
  return listCampaigns();
}

/**
 * Publish a PUBLIC social post (CONSEQUENTIAL). The admin passing `approved:
 * true` represents the human-in-the-loop approval; the schema requires it (a
 * missing/false `approved` is rejected as `invalid-argument` BEFORE any post).
 * The channel is injected (Real* in production — throws without creds; Fake in
 * tests). Logs a marketing_events sent-log entry on success.
 */
export async function handlePublishSocialPost(
  req: AdminRequest<unknown>,
  channel: SocialChannel = new RealSocialChannel(),
): Promise<SocialPostResult> {
  assertAdmin(req.auth);
  const input = parse(publishSocialPostApiSchema, req.data);
  const result = await channel.post({
    platform: input.platform,
    message: input.message,
    assetPath: input.assetPath,
  });
  await recordMarketingEvent({
    id: `social__${result.postId}`,
    kind: "social_post",
    ref: result.postId,
    summary: `social post to ${result.platform}`,
    occurredAt: new Date().toISOString(),
  });
  return result;
}

/**
 * Send an email blast (CONSEQUENTIAL). `approved: true` is the human-in-the-loop
 * approval; the schema requires it. The channel is injected (Real* in production
 * — throws without creds; Fake in tests). Logs a sent-log entry on success.
 */
export async function handleSendEmailBlast(
  req: AdminRequest<unknown>,
  channel: EmailChannel = new RealEmailChannel(),
): Promise<EmailBlastResult> {
  assertAdmin(req.auth);
  const input = parse(sendEmailBlastApiSchema, req.data);
  const result = await channel.send({
    segment: input.segment,
    subject: input.subject,
    body: input.body,
  });
  await recordMarketingEvent({
    id: `email__${result.sendId}`,
    kind: "email_blast",
    ref: result.sendId,
    summary: `email blast to ${result.segment}`,
    occurredAt: new Date().toISOString(),
  });
  return result;
}

/**
 * Place paid-ad spend (CONSEQUENTIAL — spends money). `approved: true` is the
 * human-in-the-loop approval; the schema requires it. The channel is injected
 * (Real* in production — throws without creds; Fake in tests). Logs a sent-log
 * entry on success.
 */
export async function handleMarketingSpend(
  req: AdminRequest<unknown>,
  channel: AdChannel = new RealAdChannel(),
): Promise<AdSpendResult> {
  assertAdmin(req.auth);
  const input = parse(marketingSpendApiSchema, req.data);
  const result = await channel.spend({
    platform: input.platform,
    budgetCents: input.budgetCents,
    currency: input.currency,
    objective: input.objective,
  });
  await recordMarketingEvent({
    id: `ad__${result.adOrderId}`,
    kind: "ad_spend",
    ref: result.adOrderId,
    summary: `ad spend on ${result.platform} (${result.budgetCents} ${result.currency})`,
    occurredAt: new Date().toISOString(),
  });
  return result;
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
export const adminScheduleRelease = onCall((request) =>
  handleScheduleRelease(toAdminRequest(request)),
);
// `adminDeliverRelease` performs the CONSEQUENTIAL delivery. It binds the
// DISTRIBUTOR_API_TOKEN secret so the real DdexDistributorClient can read it at
// runtime (and only then) — the token is operator-supplied at handoff. NO live
// delivery occurs in any test (unit tests inject a FakeDistributorClient).
const distributorApiToken = defineSecret("DISTRIBUTOR_API_TOKEN");

export const adminDeliverRelease = onCall({ secrets: [distributorApiToken] }, (request) =>
  handleDeliverRelease(toAdminRequest(request)),
);
// `runAgent` invokes the Claude-backed model factory, which reads
// ANTHROPIC_API_KEY from the environment — bind it so the secret is present at
// runtime (Functions v2 does not auto-inject Secret Manager values).
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

export const runAgent = onCall({ secrets: [anthropicApiKey] }, (request) =>
  handleRunAgent(toAdminRequest(request)),
);

// Autonomy orchestration callables (P2B04): list/approve pending consequential
// actions + review the agent audit trail. Admin-guarded; no secrets needed.
export const adminListPendingApprovals = onCall((request) =>
  handleListPendingApprovals(toAdminRequest(request)),
);
export const adminApprove = onCall((request) => handleApprove(toAdminRequest(request)));
export const adminListAudit = onCall((request) => handleListAudit(toAdminRequest(request)));

// Finance callables (P2B05, F7): ingest revenue, generate/list statements, and
// propose payouts. Admin-guarded; no secrets needed (no live revenue/payout).
export const adminIngestRevenue = onCall((request) =>
  handleIngestRevenue(toAdminRequest(request)),
);
export const adminGenerateStatement = onCall((request) =>
  handleGenerateStatement(toAdminRequest(request)),
);
export const adminListStatements = onCall((request) =>
  handleListStatements(toAdminRequest(request)),
);
export const adminProposePayout = onCall((request) =>
  handleProposePayout(toAdminRequest(request)),
);

// Publishing & sync callables (P2B06, F8/F9). Admin-guarded. `adminRegisterPro
// Affiliation` binds the PRO_API_TOKEN secret so the RealProRegistrar can read
// it at runtime (operator-supplied at handoff) — it throws without it, and NO
// live PRO/MLC call occurs in any test (unit tests inject a FakeProRegistrar).
const proApiToken = defineSecret("PRO_API_TOKEN");

export const adminRegisterWork = onCall((request) => handleRegisterWork(toAdminRequest(request)));
export const adminSetWriterSplits = onCall((request) =>
  handleSetWriterSplits(toAdminRequest(request)),
);
export const adminRegisterProAffiliation = onCall({ secrets: [proApiToken] }, (request) =>
  handleRegisterProAffiliation(toAdminRequest(request)),
);
export const adminAddToSyncCatalog = onCall((request) =>
  handleAddToSyncCatalog(toAdminRequest(request)),
);
export const adminRequestSyncLicense = onCall((request) =>
  handleRequestSyncLicense(toAdminRequest(request)),
);
export const adminClearSyncLicense = onCall((request) =>
  handleClearSyncLicense(toAdminRequest(request)),
);
export const adminIssueSyncLicense = onCall((request) =>
  handleIssueSyncLicense(toAdminRequest(request)),
);

// Marketing & promotion callables (P2B07, F5). Planning/scheduling/listing are
// admin-guarded with no secrets (no outward effect). The CONSEQUENTIAL
// publish/email/spend callables bind the channel secrets so the Real* channels
// can read them at runtime (operator-supplied at handoff) — they throw without
// them, and NO live social/email/ad call occurs in any test (unit tests inject
// Fake channels).
const socialApiToken = defineSecret("SOCIAL_API_TOKEN");
const emailApiToken = defineSecret("EMAIL_API_TOKEN");
const adsApiToken = defineSecret("ADS_API_TOKEN");

export const adminPlanCampaign = onCall((request) => handlePlanCampaign(toAdminRequest(request)));
export const adminScheduleCampaign = onCall((request) =>
  handleScheduleCampaign(toAdminRequest(request)),
);
export const adminListCampaigns = onCall((request) =>
  handleListCampaigns(toAdminRequest(request)),
);
export const adminPublishSocialPost = onCall({ secrets: [socialApiToken] }, (request) =>
  handlePublishSocialPost(toAdminRequest(request)),
);
export const adminSendEmailBlast = onCall({ secrets: [emailApiToken] }, (request) =>
  handleSendEmailBlast(toAdminRequest(request)),
);
export const adminMarketingSpend = onCall({ secrets: [adsApiToken] }, (request) =>
  handleMarketingSpend(toAdminRequest(request)),
);
