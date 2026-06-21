/**
 * Admin metadata/rights callable guards (P2B01) — OFFLINE unit gate. No
 * emulator, no network. The label store is MOCKED so handlers never touch
 * Firestore; assertions focus on the SECURITY GUARD + input validation:
 *   - non-admin / unauthenticated callers are rejected (permission-denied),
 *   - admins are allowed through to the store,
 *   - invalid identifiers / splits are rejected (invalid-argument) and never
 *     reach the store.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

interface ReleaseIds {
  upc?: string;
  credits?: { role: string; name: string }[];
}
const setReleaseIdentifiers = vi.fn(async (releaseId: string, ids: ReleaseIds) => ({
  id: releaseId,
  artistId: "a1",
  title: "EP",
  catalogNumber: "PRM-1",
  type: "ep",
  releaseDate: "2026-09-01",
  aiGenerated: true,
  upc: ids.upc ?? "036000291452",
  credits: ids.credits,
}));
const setTrackISRC = vi.fn(async (trackId: string, isrc: string) => ({
  id: trackId,
  releaseId: "r1",
  title: "Track",
  durationSec: 180,
  previewClipPath: "previews/x.mp3",
  isrc,
}));
const setRights = vi.fn(async (releaseId: string, splits: unknown) => ({
  releaseId,
  ownershipSplits: splits,
}));

vi.mock("../app/label/store", () => ({
  createArtist: vi.fn(),
  createProduct: vi.fn(),
  createRelease: vi.fn(),
  listOrders: vi.fn(),
  setReleaseIdentifiers: (id: string, ids: ReleaseIds) => setReleaseIdentifiers(id, ids),
  setTrackISRC: (id: string, isrc: string) => setTrackISRC(id, isrc),
  setRights: (id: string, splits: unknown) => setRights(id, splits),
}));

import {
  handleSetIdentifiers,
  handleSetOwnershipSplits,
  type AdminAuthContext,
} from "../app/gateway/adminApi";

const ADMIN: AdminAuthContext = { uid: "owner", token: { admin: true } };
const NON_ADMIN: AdminAuthContext = { uid: "fan", token: { admin: false } };

describe("admin metadata/rights callables (P2B01)", () => {
  afterEach(() => vi.clearAllMocks());

  // -- adminSetIdentifiers ---------------------------------------------------

  it("handleSetIdentifiers rejects non-admin and never writes", async () => {
    await expect(
      handleSetIdentifiers({ auth: NON_ADMIN, data: { releaseId: "r1", upc: "036000291452" } }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(setReleaseIdentifiers).not.toHaveBeenCalled();
  });

  it("handleSetIdentifiers allows admin: sets release UPC/credits + track ISRCs", async () => {
    const result = await handleSetIdentifiers({
      auth: ADMIN,
      data: {
        releaseId: "r1",
        upc: "036000291452",
        credits: [{ role: "Producer", name: "PRM" }],
        trackIsrcs: [{ trackId: "t1", isrc: "USRC17607839" }],
      },
    });
    expect(setReleaseIdentifiers).toHaveBeenCalledOnce();
    expect(setTrackISRC).toHaveBeenCalledWith("t1", "USRC17607839");
    expect(result.tracks).toHaveLength(1);
  });

  it("handleSetIdentifiers rejects an empty payload (invalid-argument)", async () => {
    await expect(
      handleSetIdentifiers({ auth: ADMIN, data: { releaseId: "r1" } }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(setReleaseIdentifiers).not.toHaveBeenCalled();
  });

  // -- adminSetOwnershipSplits ----------------------------------------------

  it("handleSetOwnershipSplits rejects non-admin and never writes", async () => {
    await expect(
      handleSetOwnershipSplits({
        auth: NON_ADMIN,
        data: { releaseId: "r1", splits: [{ payee: "A", percent: 100 }] },
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(setRights).not.toHaveBeenCalled();
  });

  it("handleSetOwnershipSplits allows admin and writes to rights", async () => {
    const result = await handleSetOwnershipSplits({
      auth: ADMIN,
      data: {
        releaseId: "r1",
        splits: [
          { payee: "Label", percent: 70 },
          { payee: "Artist", percent: 30 },
        ],
      },
    });
    expect(setRights).toHaveBeenCalledOnce();
    expect(result.releaseId).toBe("r1");
  });
});
