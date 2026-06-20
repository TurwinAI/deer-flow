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
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  createArtist,
  createProduct,
  createRelease,
  listOrders,
} from "../label/store";
import type { Artist, Order, Product, Release } from "../label";
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
export const runAgent = onCall((request) => handleRunAgent(toAdminRequest(request)));
