/**
 * Admin asset-API auth-guard + validation tests (P2B02) — OFFLINE unit gate.
 * No emulator, no Storage, no ffmpeg, no network.
 *
 * The label store is MOCKED (so handlers never touch Firestore); the Storage
 * bucket is an in-memory FAKE and the encoder is a deterministic
 * FakePreviewEncoder — injected via the handler `deps` argument. Focus: the
 * SECURITY GUARD and that validation errors surface as invalid-argument.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";

const setTrackMaster = vi.fn(async () => ({ trackId: "t", masterPath: "p" }));
const setTrackPreviewClip = vi.fn(async () => ({}));
const setProvenance = vi.fn(async (r: unknown) => r);

vi.mock("../app/label/store", () => ({
  setTrackMaster: (...a: unknown[]) => setTrackMaster(...(a as [])),
  setTrackPreviewClip: (...a: unknown[]) => setTrackPreviewClip(...(a as [])),
  setProvenance: (r: unknown) => setProvenance(r),
}));

import {
  handleGeneratePreview,
  handleIngestMaster,
  handleSetProvenance,
  type AdminAuthContext,
  type AssetApiDeps,
} from "../app/gateway/adminApi";
import { FakePreviewEncoder, type StorageBucketLike } from "../app/label/assets";

const ADMIN: AdminAuthContext = { uid: "owner", token: { admin: true } };
const NON_ADMIN: AdminAuthContext = { uid: "fan", token: { admin: false } };

/** In-memory fake bucket: records saved paths/bytes, never touches GCS. */
function fakeBucket(): { bucket: StorageBucketLike; saved: Map<string, Buffer> } {
  const saved = new Map<string, Buffer>();
  const bucket: StorageBucketLike = {
    file: (path: string) => ({
      save: async (data: Buffer) => {
        saved.set(path, data);
      },
    }),
  };
  return { bucket, saved };
}

function deps(): AssetApiDeps & { saved: Map<string, Buffer> } {
  const { bucket, saved } = fakeBucket();
  return { resolveBucket: async () => bucket, encoder: new FakePreviewEncoder(), saved };
}

const b64 = (s: string): string => Buffer.from(s).toString("base64");

describe("admin asset API (P2B02)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // -- ingest_master -------------------------------------------------------
  it("handleIngestMaster rejects non-admin and never writes", async () => {
    const d = deps();
    await expect(
      handleIngestMaster(
        { auth: NON_ADMIN, data: { trackId: "t", masterPath: "masters/x/y.wav", contentBase64: b64("M") } },
        d,
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(setTrackMaster).not.toHaveBeenCalled();
    expect(d.saved.size).toBe(0);
  });

  it("handleIngestMaster (admin) writes the master + records track_masters", async () => {
    const d = deps();
    const result = await handleIngestMaster(
      { auth: ADMIN, data: { trackId: "t1", masterPath: "masters/x/y.wav", contentBase64: b64("MASTER") } },
      d,
    );
    expect(result.masterPath).toBe("masters/x/y.wav");
    expect(result.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(d.saved.get("masters/x/y.wav")?.toString()).toBe("MASTER");
    expect(setTrackMaster).toHaveBeenCalledOnce();
  });

  it("handleIngestMaster maps a bad extension to invalid-argument", async () => {
    const d = deps();
    await expect(
      handleIngestMaster(
        { auth: ADMIN, data: { trackId: "t", masterPath: "masters/x/y.mp3", contentBase64: b64("M") } },
        d,
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(setTrackMaster).not.toHaveBeenCalled();
  });

  // -- generate_preview ----------------------------------------------------
  it("handleGeneratePreview rejects non-admin", async () => {
    const d = deps();
    await expect(
      handleGeneratePreview(
        {
          auth: NON_ADMIN,
          data: { trackId: "t", previewClipPath: "previews/x/y.mp3", masterContentBase64: b64("M") },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(setTrackPreviewClip).not.toHaveBeenCalled();
  });

  it("handleGeneratePreview (admin) writes previews/ + sets the preview path", async () => {
    const d = deps();
    const result = await handleGeneratePreview(
      {
        auth: ADMIN,
        data: { trackId: "t1", previewClipPath: "previews/x/y.mp3", masterContentBase64: b64("MASTER") },
      },
      d,
    );
    expect(result.previewClipPath).toBe("previews/x/y.mp3");
    expect(d.saved.has("previews/x/y.mp3")).toBe(true);
    expect(setTrackPreviewClip).toHaveBeenCalledOnce();
  });

  it("handleGeneratePreview maps a bad preview prefix to invalid-argument", async () => {
    const d = deps();
    await expect(
      handleGeneratePreview(
        {
          auth: ADMIN,
          data: { trackId: "t", previewClipPath: "masters/x/y.mp3", masterContentBase64: b64("M") },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(setTrackPreviewClip).not.toHaveBeenCalled();
  });

  // -- set_provenance ------------------------------------------------------
  it("handleSetProvenance rejects non-admin", async () => {
    await expect(
      handleSetProvenance({
        auth: NON_ADMIN,
        data: { trackId: "t", generator: "PRM", disclosure: "AI", contentBase64: b64("M") },
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(setProvenance).not.toHaveBeenCalled();
  });

  it("handleSetProvenance (admin) writes a record with a content SHA-256", async () => {
    const result = await handleSetProvenance({
      auth: ADMIN,
      data: {
        trackId: "t1",
        generator: "PlayReggaeMusic.ai",
        disclosure: "AI-generated: produced with artificial intelligence.",
        contentBase64: b64("MASTER"),
      },
    });
    expect(result.trackId).toBe("t1");
    expect(result.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(setProvenance).toHaveBeenCalledOnce();
  });

  it("handleSetProvenance rejects malformed input (invalid-argument)", async () => {
    await expect(
      handleSetProvenance({ auth: ADMIN, data: { trackId: "t1" } }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(setProvenance).not.toHaveBeenCalled();
  });

  it("guards throw HttpsError instances", async () => {
    await expect(
      handleSetProvenance({ auth: undefined, data: {} }),
    ).rejects.toBeInstanceOf(HttpsError);
  });
});
