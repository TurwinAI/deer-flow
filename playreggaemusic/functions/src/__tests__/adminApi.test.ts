/**
 * Admin API auth-guard tests (B07) — OFFLINE unit gate. No emulator, no network,
 * no live LLM.
 *
 * The label store is MOCKED so the create/list handlers never touch Firestore,
 * and the agent runner is driven by a ScriptedModel (a fake LLM), so `runAgent`
 * never calls Anthropic. The assertions focus on the SECURITY GUARD:
 *   - a non-admin / unauthenticated caller is rejected with permission-denied /
 *     unauthenticated (HttpsError),
 *   - an admin caller is allowed through to the underlying operation.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { HttpsError } from "firebase-functions/v2/https";
import type { ChatModelLike } from "../harness/runtime";

const createArtist = vi.fn(async (a: unknown) => a);
const createRelease = vi.fn(async (r: unknown) => r);
const createProduct = vi.fn(async (p: unknown) => p);
const listOrders = vi.fn(async () => [
  {
    id: "order-1",
    customer: "cus_1",
    productId: "foundation-stones-download",
    amount: 700,
    currency: "USD",
    status: "paid",
    createdAt: "2026-06-20T00:00:00.000Z",
  },
]);

vi.mock("../app/label/store", () => ({
  createArtist: (a: unknown) => createArtist(a),
  createRelease: (r: unknown) => createRelease(r),
  createProduct: (p: unknown) => createProduct(p),
  listOrders: () => listOrders(),
}));

import {
  assertAdmin,
  handleCreateArtist,
  handleCreateProduct,
  handleCreateRelease,
  handleListOrders,
  handleRunAgent,
  type AdminAuthContext,
} from "../app/gateway/adminApi";

const ADMIN: AdminAuthContext = { uid: "owner", token: { admin: true } };
const NON_ADMIN: AdminAuthContext = { uid: "fan", token: { admin: false } };

/** Scripted LLM: returns a single final answer (no tool calls, no network). */
class ScriptedModel implements ChatModelLike {
  constructor(private readonly reply: string) {}
  bindTools() {
    return this;
  }
  async invoke(): Promise<AIMessage> {
    return new AIMessage({ content: this.reply });
  }
}

const VALID_ARTIST = {
  id: "a1",
  name: "New Artist",
  bio: "bio",
  links: { spotify: "https://open.spotify.com/artist/x" },
};
const VALID_RELEASE = {
  id: "r1",
  artistId: "a1",
  title: "New EP",
  catalogNumber: "PRM-100",
  type: "ep",
  releaseDate: "2026-09-01",
};
const VALID_PRODUCT = {
  id: "p1",
  type: "music_download",
  title: "New EP (Download)",
  priceCents: 800,
  currency: "USD",
  releaseId: "r1",
};

describe("admin API auth guard (B07)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // -- assertAdmin (the single choke point) --------------------------------

  it("assertAdmin rejects an unauthenticated caller (unauthenticated)", () => {
    try {
      assertAdmin(undefined);
      throw new Error("expected assertAdmin to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpsError);
      expect((e as HttpsError).code).toBe("unauthenticated");
    }
  });

  it("assertAdmin rejects a non-admin caller (permission-denied)", () => {
    try {
      assertAdmin(NON_ADMIN);
      throw new Error("expected assertAdmin to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpsError);
      expect((e as HttpsError).code).toBe("permission-denied");
    }
  });

  it("assertAdmin allows an admin caller (admin === true)", () => {
    expect(() => assertAdmin(ADMIN)).not.toThrow();
  });

  // -- handleCreateArtist ---------------------------------------------------

  it("handleCreateArtist rejects non-admin and never writes", async () => {
    await expect(handleCreateArtist({ auth: NON_ADMIN, data: VALID_ARTIST })).rejects.toMatchObject(
      { code: "permission-denied" },
    );
    expect(createArtist).not.toHaveBeenCalled();
  });

  it("handleCreateArtist allows admin and writes the artist", async () => {
    const result = await handleCreateArtist({ auth: ADMIN, data: VALID_ARTIST });
    expect(result.id).toBe("a1");
    expect(createArtist).toHaveBeenCalledOnce();
  });

  // -- handleCreateRelease --------------------------------------------------

  it("handleCreateRelease rejects non-admin", async () => {
    await expect(
      handleCreateRelease({ auth: NON_ADMIN, data: VALID_RELEASE }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(createRelease).not.toHaveBeenCalled();
  });

  it("handleCreateRelease allows admin and marks AI-generated", async () => {
    const result = await handleCreateRelease({ auth: ADMIN, data: VALID_RELEASE });
    expect(result.aiGenerated).toBe(true);
    expect(createRelease).toHaveBeenCalledOnce();
  });

  // -- handleCreateProduct --------------------------------------------------

  it("handleCreateProduct rejects non-admin", async () => {
    await expect(
      handleCreateProduct({ auth: NON_ADMIN, data: VALID_PRODUCT }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("handleCreateProduct allows admin", async () => {
    const result = await handleCreateProduct({ auth: ADMIN, data: VALID_PRODUCT });
    expect(result.id).toBe("p1");
    expect(createProduct).toHaveBeenCalledOnce();
  });

  it("handleCreateProduct rejects malformed input even for an admin (invalid-argument)", async () => {
    await expect(
      handleCreateProduct({ auth: ADMIN, data: { id: "p1" } }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(createProduct).not.toHaveBeenCalled();
  });

  // -- handleListOrders -----------------------------------------------------

  it("handleListOrders rejects non-admin", async () => {
    await expect(handleListOrders({ auth: NON_ADMIN, data: {} })).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(listOrders).not.toHaveBeenCalled();
  });

  it("handleListOrders allows admin and returns mirrored orders", async () => {
    const orders = await handleListOrders({ auth: ADMIN, data: {} });
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe("order-1");
  });

  // -- handleRunAgent (agent execution injected — NO live LLM) --------------

  it("handleRunAgent rejects non-admin and never builds/invokes the agent", async () => {
    const factory = vi.fn(() => new ScriptedModel("should not run"));
    await expect(
      handleRunAgent({ auth: NON_ADMIN, data: { prompt: "do it" } }, factory),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(factory).not.toHaveBeenCalled();
  });

  it("handleRunAgent allows admin and returns the transcript (scripted model, no network)", async () => {
    const result = await handleRunAgent(
      { auth: ADMIN, data: { prompt: "Summarise the catalog." } },
      () => new ScriptedModel("Catalog summarised: 1 artist, 1 release."),
    );
    const roles = result.transcript.map((t) => t.role);
    expect(roles).toContain("system");
    expect(roles).toContain("human");
    expect(roles).toContain("ai");
    expect(result.transcript.at(-1)?.content).toMatch(/catalog summarised/i);
  });
});
