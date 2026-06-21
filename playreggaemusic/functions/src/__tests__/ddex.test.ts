/**
 * DDEX ERN builder + validator tests (P2B03, F4) — PURE unit gate. No emulator,
 * no network, no distributor.
 *
 * Asserts:
 *   - buildErnMessage emits well-formed XML carrying the release UPC, every
 *     track ISRC, the title/artist, and the AI-disclosure flag,
 *   - buildErnMessage REJECTS a release missing a (valid) UPC and a track with a
 *     missing or invalid ISRC (throws, names the field),
 *   - validateErn passes on a built message and fails on garbage / structurally
 *     incomplete XML.
 */
import { describe, expect, it } from "vitest";
import { buildErnMessage, validateErn } from "../app/distribution/ddex";
import type { Release, Track } from "../app/label/index";

const RELEASE: Release = {
  id: "foundation-stones",
  artistId: "roots-untold",
  title: "Foundation Stones",
  catalogNumber: "PRM-001",
  type: "ep",
  releaseDate: "2026-07-04",
  aiGenerated: true,
  upc: "196633982100",
  credits: [
    { role: "Produced by", name: "PlayReggaeMusic.ai" },
    { role: "Performed by", name: "Roots Untold (AI)" },
  ],
};

const TRACKS: Track[] = [
  {
    id: "foundation-stones-01",
    releaseId: "foundation-stones",
    title: "Foundation Stones",
    durationSec: 218,
    previewClipPath: "previews/foundation-stones/01.mp3",
    isrc: "USRUM2600001",
  },
  {
    id: "foundation-stones-02",
    releaseId: "foundation-stones",
    title: "Jah Light Dub",
    durationSec: 245,
    previewClipPath: "previews/foundation-stones/02.mp3",
    isrc: "USRUM2600002",
  },
];

describe("DDEX ERN builder (P2B03)", () => {
  it("emits well-formed XML containing the UPC, every ISRC, title, artist and AI disclosure", () => {
    const xml = buildErnMessage(RELEASE, TRACKS, { artistName: "Roots Untold" });

    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml).toContain("<ern:NewReleaseMessage");
    // Release barcode (UPC) appears.
    expect(xml).toContain("196633982100");
    // Every track ISRC appears.
    expect(xml).toContain("USRUM2600001");
    expect(xml).toContain("USRUM2600002");
    // Title + artist.
    expect(xml).toContain("Foundation Stones");
    expect(xml).toContain("Roots Untold");
    // AI-disclosure flag present and true.
    expect(xml).toContain("<IsAiGenerated>true</IsAiGenerated>");
    expect(xml).toContain("artificial intelligence");
    // Credits carried.
    expect(xml).toContain("PlayReggaeMusic.ai");

    // And the built XML passes structural validation.
    const result = validateErn(xml);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("is deterministic for the same input", () => {
    const a = buildErnMessage(RELEASE, TRACKS, { artistName: "Roots Untold" });
    const b = buildErnMessage(RELEASE, TRACKS, { artistName: "Roots Untold" });
    expect(a).toEqual(b);
  });

  it("escapes special XML characters in titles/artist", () => {
    const tricky: Release = { ...RELEASE, title: "Fire & <Brimstone>" };
    const xml = buildErnMessage(tricky, TRACKS, { artistName: 'Roots "Untold"' });
    expect(xml).toContain("Fire &amp; &lt;Brimstone&gt;");
    expect(xml).not.toContain("Fire & <Brimstone>");
    expect(validateErn(xml).ok).toBe(true);
  });

  it("carries an optional ISWC when supplied", () => {
    const xml = buildErnMessage(RELEASE, TRACKS, {
      artistName: "Roots Untold",
      iswcByTrackId: { "foundation-stones-01": "T-034524680-1" },
    });
    expect(xml).toContain("T0345246801");
    expect(xml).toContain("<ISWC>");
    expect(validateErn(xml).ok).toBe(true);
  });

  // --- Validation gate: REJECTS missing/invalid identifiers ----------------

  it("REJECTS a release missing a UPC", () => {
    const noUpc: Release = { ...RELEASE, upc: undefined };
    expect(() => buildErnMessage(noUpc, TRACKS, { artistName: "Roots Untold" })).toThrow(
      /missing or invalid UPC/i,
    );
  });

  it("REJECTS a release with an invalid UPC check digit", () => {
    const badUpc: Release = { ...RELEASE, upc: "196633982101" };
    expect(() => buildErnMessage(badUpc, TRACKS, { artistName: "Roots Untold" })).toThrow(
      /missing or invalid UPC/i,
    );
  });

  it("REJECTS when ANY track is missing an ISRC", () => {
    const tracks: Track[] = [TRACKS[0], { ...TRACKS[1], isrc: undefined }];
    expect(() => buildErnMessage(RELEASE, tracks, { artistName: "Roots Untold" })).toThrow(
      /track foundation-stones-02 has missing or invalid ISRC/i,
    );
  });

  it("REJECTS when a track has an invalid ISRC", () => {
    const tracks: Track[] = [{ ...TRACKS[0], isrc: "NOT-AN-ISRC" }, TRACKS[1]];
    expect(() => buildErnMessage(RELEASE, tracks, { artistName: "Roots Untold" })).toThrow(
      /missing or invalid ISRC/i,
    );
  });

  it("REJECTS an empty track list", () => {
    expect(() => buildErnMessage(RELEASE, [], { artistName: "Roots Untold" })).toThrow(/no tracks/i);
  });

  it("REJECTS a malformed supplied ISWC", () => {
    expect(() =>
      buildErnMessage(RELEASE, TRACKS, {
        artistName: "Roots Untold",
        iswcByTrackId: { "foundation-stones-01": "T-000000000-0-EXTRA" },
      }),
    ).toThrow(/invalid ISWC/i);
  });
});

describe("DDEX ERN validator (P2B03)", () => {
  it("fails on non-XML garbage", () => {
    const result = validateErn("this is not xml <<<");
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it("fails on well-formed XML that is not an ERN message", () => {
    const result = validateErn("<root><hello>world</hello></root>");
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("missing NewReleaseMessage root element");
  });

  it("fails on an ERN message missing required Release elements", () => {
    const partial =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/43">` +
      `<MessageHeader><MessageId>x</MessageId><MessageSender>s</MessageSender></MessageHeader>` +
      `<ResourceList><SoundRecording><ISRC>USRUM2600001</ISRC></SoundRecording></ResourceList>` +
      `</ern:NewReleaseMessage>`;
    const result = validateErn(partial);
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("missing ReleaseList/Release");
  });

  it("flags a SoundRecording missing its ISRC", () => {
    const noIsrc =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/43">` +
      `<MessageHeader><MessageId>x</MessageId><MessageSender>s</MessageSender></MessageHeader>` +
      `<ResourceList><SoundRecording><ReferenceTitle><TitleText>t</TitleText></ReferenceTitle></SoundRecording></ResourceList>` +
      `<ReleaseList><Release><ReleaseId>1</ReleaseId><ReferenceTitle>t</ReferenceTitle><DisplayArtist>a</DisplayArtist></Release></ReleaseList>` +
      `</ern:NewReleaseMessage>`;
    const result = validateErn(noIsrc);
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => /missing ISRC/.test(p))).toBe(true);
  });
});
