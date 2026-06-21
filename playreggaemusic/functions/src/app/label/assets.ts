/**
 * Production-asset pipeline (P2B02): master ingestion, preview-clip generation,
 * asset validation, and content hashing for AI-provenance records.
 *
 * Storage is reached ONLY via the admin SDK, but the bucket and the audio
 * encoder are INJECTED (the Polar/entitlement pattern): tests pass an emulator
 * bucket + a `FakePreviewEncoder` so NO real ffmpeg and NO live GCS/network is
 * ever touched in a gate. The default encoder is a deploy-time stub that throws
 * until a real encoder is configured — it is never invoked in tests.
 *
 * Masters are written to PRIVATE Storage (`masters/...`, denied to all clients
 * by storage.rules) and recorded via the admin-only `track_masters` collection
 * (reusing `setTrackMaster`). Previews are written to PUBLIC Storage
 * (`previews/...`, world-readable) and the path is stored on the public
 * `Track.previewClipPath`.
 *
 * Application layer: MAY import harness/* and app/* (here only app/label/store).
 */
import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { setTrackMaster, setTrackPreviewClip } from "./store";

/** Allowed lossless master container extensions (lower-case, no dot). */
export const MASTER_EXTENSIONS = ["wav", "flac", "aiff"] as const;
export type MasterExtension = (typeof MASTER_EXTENSIONS)[number];

/** A preview clip may be at most this long (seconds). */
export const MAX_PREVIEW_DURATION_SEC = 30;

/** Private Storage prefix for master objects. */
export const MASTERS_PREFIX = "masters/";
/** Public Storage prefix for preview-clip objects. */
export const PREVIEWS_PREFIX = "previews/";

/**
 * The minimal Storage-bucket surface the pipeline needs: write bytes to an
 * object path. Injected so tests use an emulator bucket and never require a
 * real GCS bucket or credentials. `save` mirrors `File.save` from the admin
 * SDK; `{ resumable: false }` forces a simple (multipart) upload — the
 * resumable path needs `duplex` which the bundled gaxios omits under Node fetch
 * and fails in the emulator (see seed/storageRules pattern).
 */
export interface StorageBucketLike {
  file(path: string): {
    save(data: Buffer, options: { resumable: false }): Promise<void>;
  };
}

/** Options handed to a {@link PreviewEncoder}. */
export interface PreviewEncodeOptions {
  /** Maximum clip length in seconds (defaults to {@link MAX_PREVIEW_DURATION_SEC}). */
  maxDurationSec: number;
}

/**
 * An audio clipper: takes master bytes and produces short preview bytes. The
 * real implementation shells out to ffmpeg (or a hosted transcoder); it is
 * INJECTED so gates can pass a deterministic fake and never run a transcode.
 */
export interface PreviewEncoder {
  clip(input: Buffer, opts: PreviewEncodeOptions): Promise<Buffer>;
}

/**
 * A deterministic fake encoder for tests/seed paths: returns a small,
 * stable byte slice derived from the input, with no ffmpeg and no network. The
 * output is non-empty for any non-empty input.
 */
export class FakePreviewEncoder implements PreviewEncoder {
  async clip(input: Buffer, opts: PreviewEncodeOptions): Promise<Buffer> {
    // Deterministic: a fixed marker (encoding the requested clip length) plus a
    // short prefix of the master bytes. No ffmpeg, no network.
    const head = input.subarray(0, Math.min(input.length, 16));
    return Buffer.concat([Buffer.from(`PREVIEW(${opts.maxDurationSec}s):`), head]);
  }
}

/**
 * Default/production encoder: a documented STUB. Running a real transcode
 * requires ffmpeg (or a hosted transcoder) configured at deploy time; until
 * then this throws so it can never silently emit an invalid clip. NEVER invoked
 * in tests — tests inject {@link FakePreviewEncoder}.
 */
export class UnconfiguredPreviewEncoder implements PreviewEncoder {
  async clip(): Promise<Buffer> {
    throw new Error(
      "No preview encoder configured — provide a real PreviewEncoder " +
        "(e.g. an ffmpeg shell-out) at deploy time.",
    );
  }
}

/**
 * Default production bucket: the admin Storage default bucket. Imported lazily
 * (the entitlement `defaultSigner` pattern) so tests that inject their own
 * bucket never load `firebase-admin/storage` and never need a real bucket.
 */
export async function defaultBucket(): Promise<StorageBucketLike> {
  const { getStorage } = await import("firebase-admin/storage");
  return getStorage().bucket() as unknown as StorageBucketLike;
}

/** Compute the lower-case hex SHA-256 of a byte buffer. */
export function contentSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The file extension (lower-case, no dot) of a Storage path, or "". */
function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

/** What kind of asset {@link validateAsset} is checking. */
export type AssetKind = "master" | "preview";

/** The metadata describing an asset to validate before it is written. */
export interface AssetMeta {
  kind: AssetKind;
  /** Storage object path; must sit under the correct prefix for the kind. */
  path: string;
  /** Asset bytes; must be non-empty. */
  bytes: Buffer;
  /** For a preview only: clip duration in seconds (must be <= 30). */
  durationSec?: number;
}

/**
 * Validate an asset by simple rules. Throws a clear Error on any violation so
 * no invalid asset is ever written:
 *   - bytes must be non-empty,
 *   - a MASTER path must end in {wav,flac,aiff} and sit under `masters/`,
 *   - a PREVIEW path must sit under `previews/` and (if a duration is given)
 *     be <= 30 seconds.
 */
export function validateAsset(meta: AssetMeta): void {
  if (meta.bytes.length === 0) {
    throw new Error(`Asset bytes are empty for ${meta.path}.`);
  }
  if (meta.kind === "master") {
    if (!meta.path.startsWith(MASTERS_PREFIX)) {
      throw new Error(`Master path must be under '${MASTERS_PREFIX}': ${meta.path}`);
    }
    const ext = extensionOf(meta.path);
    if (!(MASTER_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new Error(
        `Master extension '${ext || "(none)"}' not allowed; expected one of ` +
          `${MASTER_EXTENSIONS.join(", ")}.`,
      );
    }
    return;
  }
  // preview
  if (!meta.path.startsWith(PREVIEWS_PREFIX)) {
    throw new Error(`Preview path must be under '${PREVIEWS_PREFIX}': ${meta.path}`);
  }
  if (meta.durationSec !== undefined && meta.durationSec > MAX_PREVIEW_DURATION_SEC) {
    throw new Error(
      `Preview duration ${meta.durationSec}s exceeds the ${MAX_PREVIEW_DURATION_SEC}s limit.`,
    );
  }
}

/** Injected dependencies for {@link ingestMaster}. */
export interface IngestDeps {
  bucket: StorageBucketLike;
  /** Optional Firestore override so `setTrackMaster` hits the emulator/test db. */
  db?: Firestore;
}

/** Result of {@link ingestMaster}. */
export interface IngestResult {
  trackId: string;
  masterPath: string;
  /** SHA-256 of the ingested master bytes (for the provenance record). */
  contentSha256: string;
}

/**
 * Ingest a track master: validate the bytes/path, write them to PRIVATE Storage
 * via the injected bucket (`{ resumable: false }`), and record the private path
 * in the admin-only `track_masters` collection via `setTrackMaster`. Returns the
 * master content SHA-256 so the caller can attach AI provenance.
 *
 * @throws if validation fails (empty bytes / bad extension / wrong prefix).
 */
export async function ingestMaster(
  trackId: string,
  masterPath: string,
  bytes: Buffer,
  deps: IngestDeps,
): Promise<IngestResult> {
  validateAsset({ kind: "master", path: masterPath, bytes });
  await deps.bucket.file(masterPath).save(bytes, { resumable: false });
  await setTrackMaster(trackId, masterPath, deps.db);
  return { trackId, masterPath, contentSha256: contentSha256(bytes) };
}

/** Injected dependencies for {@link generatePreview}. */
export interface PreviewDeps {
  bucket: StorageBucketLike;
  encoder: PreviewEncoder;
  /** Optional Firestore override so `setTrackPreviewClip` hits the test db. */
  db?: Firestore;
  /** Max clip length; defaults to {@link MAX_PREVIEW_DURATION_SEC}. */
  maxDurationSec?: number;
}

/** Result of {@link generatePreview}. */
export interface PreviewResult {
  trackId: string;
  previewClipPath: string;
}

/**
 * Generate a public preview clip for a track: read the master bytes, clip them
 * with the INJECTED encoder, validate the resulting preview, write it to PUBLIC
 * Storage (`previews/...`), and set the public `Track.previewClipPath`.
 *
 * The `masterBytes` are passed in (the caller already has them from ingest);
 * this keeps the pipeline storage-agnostic and lets tests avoid any download.
 *
 * @throws if the preview path is not under `previews/`, or the encoder yields
 *   empty bytes.
 */
export async function generatePreview(
  trackId: string,
  previewClipPath: string,
  masterBytes: Buffer,
  deps: PreviewDeps,
): Promise<PreviewResult> {
  if (!previewClipPath.startsWith(PREVIEWS_PREFIX)) {
    throw new Error(`Preview path must be under '${PREVIEWS_PREFIX}': ${previewClipPath}`);
  }
  const maxDurationSec = deps.maxDurationSec ?? MAX_PREVIEW_DURATION_SEC;
  const previewBytes = await deps.encoder.clip(masterBytes, { maxDurationSec });
  validateAsset({
    kind: "preview",
    path: previewClipPath,
    bytes: previewBytes,
    durationSec: maxDurationSec,
  });
  await deps.bucket.file(previewClipPath).save(previewBytes, { resumable: false });
  await setTrackPreviewClip(trackId, previewClipPath, deps.db);
  return { trackId, previewClipPath };
}
