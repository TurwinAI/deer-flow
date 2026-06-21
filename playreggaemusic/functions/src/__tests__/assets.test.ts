/**
 * Asset pipeline pure-unit tests (P2B02) — OFFLINE: no emulator, no Storage, no
 * ffmpeg, no network. Covers validateAsset's rules, contentSha256 determinism,
 * and the FakePreviewEncoder + the deploy-time stub encoder.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  contentSha256,
  FakePreviewEncoder,
  MAX_PREVIEW_DURATION_SEC,
  UnconfiguredPreviewEncoder,
  validateAsset,
} from "../app/label/assets";

describe("validateAsset (P2B02)", () => {
  const goodMaster = {
    kind: "master" as const,
    path: "masters/foundation-stones/01.wav",
    bytes: Buffer.from("MASTER"),
  };

  it("accepts a valid wav/flac/aiff master under masters/", () => {
    expect(() => validateAsset(goodMaster)).not.toThrow();
    expect(() =>
      validateAsset({ ...goodMaster, path: "masters/x/track.flac" }),
    ).not.toThrow();
    expect(() =>
      validateAsset({ ...goodMaster, path: "masters/x/track.aiff" }),
    ).not.toThrow();
  });

  it("rejects a master with a bad extension", () => {
    expect(() => validateAsset({ ...goodMaster, path: "masters/x/track.mp3" })).toThrow(
      /not allowed/i,
    );
  });

  it("rejects a master not under masters/", () => {
    expect(() => validateAsset({ ...goodMaster, path: "previews/x/track.wav" })).toThrow(
      /must be under 'masters\//i,
    );
  });

  it("rejects empty master bytes", () => {
    expect(() => validateAsset({ ...goodMaster, bytes: Buffer.alloc(0) })).toThrow(/empty/i);
  });

  it("accepts a preview under previews/ at <= 30s", () => {
    expect(() =>
      validateAsset({
        kind: "preview",
        path: "previews/x/clip.mp3",
        bytes: Buffer.from("CLIP"),
        durationSec: MAX_PREVIEW_DURATION_SEC,
      }),
    ).not.toThrow();
  });

  it("rejects a preview longer than 30s", () => {
    expect(() =>
      validateAsset({
        kind: "preview",
        path: "previews/x/clip.mp3",
        bytes: Buffer.from("CLIP"),
        durationSec: 31,
      }),
    ).toThrow(/exceeds the 30s limit/i);
  });

  it("rejects a preview not under previews/", () => {
    expect(() =>
      validateAsset({ kind: "preview", path: "masters/x/clip.mp3", bytes: Buffer.from("CLIP") }),
    ).toThrow(/must be under 'previews\//i);
  });

  it("rejects empty preview bytes", () => {
    expect(() =>
      validateAsset({ kind: "preview", path: "previews/x/clip.mp3", bytes: Buffer.alloc(0) }),
    ).toThrow(/empty/i);
  });
});

describe("contentSha256 (P2B02)", () => {
  it("matches the node crypto SHA-256 hex and is deterministic", () => {
    const bytes = Buffer.from("foundation-stones-01-master");
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(contentSha256(bytes)).toBe(expected);
    expect(contentSha256(bytes)).toBe(contentSha256(bytes));
  });

  it("differs for different content", () => {
    expect(contentSha256(Buffer.from("a"))).not.toBe(contentSha256(Buffer.from("b")));
  });
});

describe("preview encoders (P2B02)", () => {
  it("FakePreviewEncoder is deterministic and non-empty for non-empty input", async () => {
    const enc = new FakePreviewEncoder();
    const input = Buffer.from("the-master-audio-bytes");
    const out1 = await enc.clip(input, { maxDurationSec: 30 });
    const out2 = await enc.clip(input, { maxDurationSec: 30 });
    expect(out1.length).toBeGreaterThan(0);
    expect(out1.equals(out2)).toBe(true);
  });

  it("UnconfiguredPreviewEncoder throws (never runs in tests/deploy stub)", async () => {
    const enc = new UnconfiguredPreviewEncoder();
    await expect(enc.clip()).rejects.toThrow(/no preview encoder configured/i);
  });
});
