/**
 * Asset pipeline tests (P2B02) — EMULATOR gate (firestore + storage). Guarded so
 * plain `pnpm test` skips them; run via `pnpm test:emulator`.
 *
 * The Storage bucket is the EMULATOR bucket (admin SDK, `{ resumable: false }`)
 * and the preview encoder is a deterministic FakePreviewEncoder — so NO real
 * ffmpeg and NO live GCS/network is ever touched.
 *
 * Asserts:
 *  - ingestMaster writes the master to masters/ (private) AND records the
 *    private path in the admin-only track_masters collection,
 *  - the ingested master is NOT client-readable, while a generated preview IS
 *    public-readable (storage.rules), proving master-private / preview-public,
 *  - generatePreview (FakePreviewEncoder) writes previews/ AND sets the public
 *    Track.previewClipPath,
 *  - validateAsset rejects a bad extension / oversized preview / empty bytes
 *    (also covered offline in assets.test.ts).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getBytes, ref } from "firebase/storage";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import {
  FakePreviewEncoder,
  generatePreview,
  ingestMaster,
  validateAsset,
  type StorageBucketLike,
} from "../app/label/assets";
import { createTrack, getTrackMaster, listTracksByRelease } from "../app/label/store";
import type { Track } from "../app/label/index";

const STORAGE_HOST =
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? process.env.STORAGE_EMULATOR_HOST;
const RUN = Boolean(process.env.FIRESTORE_EMULATOR_HOST) && Boolean(STORAGE_HOST);

const STORAGE_RULES_PATH = resolve(__dirname, "../../../storage.rules");
const PROJECT_ID = "playreggaemusic-dev";

const TRACK: Track = {
  id: "asset-track",
  releaseId: "asset-release",
  title: "Asset Track",
  durationSec: 200,
  previewClipPath: "previews/asset-release/placeholder.mp3",
};

const MASTER_PATH = "masters/asset-release/asset-track.wav";
const PREVIEW_PATH = "previews/asset-release/asset-track.mp3";

describe.skipIf(!RUN)("asset pipeline (emulator)", () => {
  let testEnv: RulesTestEnvironment;
  let bucket: StorageBucketLike;

  beforeAll(async () => {
    process.env.GCLOUD_PROJECT = PROJECT_ID;
    const [host, portStr] = (STORAGE_HOST ?? "").split(":");
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: {
        rules: readFileSync(STORAGE_RULES_PATH, "utf8"),
        host: host || "127.0.0.1",
        port: portStr ? Number(portStr) : 9199,
      },
    });
    if (getApps().length === 0) {
      initializeApp({ projectId: PROJECT_ID, storageBucket: PROJECT_ID });
    }
    // The admin bucket must match the bucket the rules-unit-testing client
    // targets: bare `<projectId>`.
    bucket = getStorage().bucket(PROJECT_ID) as unknown as StorageBucketLike;
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of ["tracks", "track_masters"]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("ingestMaster writes masters/ and records the private track_masters path", async () => {
    const masterBytes = Buffer.from("THE-MASTER-BYTES");
    const result = await ingestMaster(TRACK.id, MASTER_PATH, masterBytes, { bucket });
    expect(result.masterPath).toBe(MASTER_PATH);
    expect(result.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    // The private master path is recorded in the admin-only collection.
    const master = await getTrackMaster(TRACK.id);
    expect(master?.masterPath).toBe(MASTER_PATH);
  });

  it("the ingested master is NOT client-readable (storage.rules)", async () => {
    await ingestMaster(TRACK.id, MASTER_PATH, Buffer.from("SECRET-MASTER"), { bucket });
    const anon = testEnv.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(anon, MASTER_PATH)));
    const fan = testEnv.authenticatedContext("fan").storage();
    await assertFails(getBytes(ref(fan, MASTER_PATH)));
  });

  it("generatePreview writes a PUBLIC-readable preview + sets Track.previewClipPath", async () => {
    await createTrack(TRACK);
    const masterBytes = Buffer.from("THE-MASTER-BYTES");
    const encoder = new FakePreviewEncoder();
    const result = await generatePreview(TRACK.id, PREVIEW_PATH, masterBytes, {
      bucket,
      encoder,
    });
    expect(result.previewClipPath).toBe(PREVIEW_PATH);
    // The public track doc now points at the generated preview.
    const tracks = await listTracksByRelease(TRACK.releaseId);
    expect(tracks.find((t) => t.id === TRACK.id)?.previewClipPath).toBe(PREVIEW_PATH);
    // The preview IS world-readable (public previews).
    const anon = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(getBytes(ref(anon, PREVIEW_PATH)));
  });

  it("validateAsset rejects bad extension / oversized preview / empty bytes", () => {
    expect(() =>
      validateAsset({ kind: "master", path: "masters/x/y.mp3", bytes: Buffer.from("x") }),
    ).toThrow(/not allowed/i);
    expect(() =>
      validateAsset({
        kind: "preview",
        path: "previews/x/y.mp3",
        bytes: Buffer.from("x"),
        durationSec: 45,
      }),
    ).toThrow(/exceeds/i);
    expect(() =>
      validateAsset({ kind: "master", path: "masters/x/y.wav", bytes: Buffer.alloc(0) }),
    ).toThrow(/empty/i);
  });
});
