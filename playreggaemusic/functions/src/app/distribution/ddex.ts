/**
 * DDEX ERN package builder + validator (P2B03, F4 Distribution).
 *
 * Builds a DDEX ERN-style `NewReleaseMessage` XML string from a label
 * `Release` + its `Track[]`, mapping the music-industry model onto DDEX:
 *   - Work        -> ISWC (optional, per track composition),
 *   - Recording   -> ISRC (REQUIRED, per track),
 *   - Release     -> UPC/EAN (REQUIRED, the release barcode).
 *
 * The XML is constructed DETERMINISTICALLY by hand (stable element order,
 * explicit escaping) so the output is reproducible and unit-testable without a
 * live distributor. `validateErn` re-parses the XML with `fast-xml-parser` to
 * confirm well-formedness + the presence of the required structural elements.
 *
 * VALIDATION BEFORE BUILD: `buildErnMessage` rejects a release with no valid UPC
 * and any track lacking a valid ISRC, reusing the P2B01 validators
 * (`isValidUPC` / `isValidISRC`). Nothing is emitted for an invalid input — it
 * throws a clear error naming the offending field.
 *
 * Pure module: no Firestore, no network. Application layer — imports only the
 * label types/validators and `fast-xml-parser`.
 *
 * NOTE (limitation): this is a SIMPLIFIED ERN profile — a single
 * NewReleaseMessage with MessageHeader, ResourceList (SoundRecordings),
 * ReleaseList (one Release) and a DealList stub. It is structurally ERN-shaped
 * and well-formed but is NOT validated against the full DDEX ERN 4.x XSD; a
 * production delivery would map to the licensed schema version the distributor
 * requires. The required identifiers (ISRC/UPC, optional ISWC), title, artist,
 * release date, AI-disclosure flag and credits are all carried.
 */
import { XMLParser } from "fast-xml-parser";
import type { Credit, Release, Track } from "../label/index";
import {
  isValidISRC,
  isValidISWC,
  isValidUPC,
  normalizeISRC,
  normalizeISWC,
  normalizeUPC,
} from "../label/identifiers";

/** Options controlling the built ERN message. */
export interface BuildErnOptions {
  /**
   * The display artist for the release (the label `Release` does not carry an
   * artist name, only `artistId`). REQUIRED — DDEX `DisplayArtist`.
   */
  artistName: string;
  /**
   * The party sending the message (DDEX `MessageSender`). Defaults to the label.
   */
  messageSender?: string;
  /** The party receiving the message (DDEX `MessageRecipient`). */
  messageRecipient?: string;
  /**
   * Whether the recording is AI-generated. Surfaced as an `<IsAiGenerated>`
   * disclosure flag on each recording. Defaults to `release.aiGenerated`.
   */
  aiGenerated?: boolean;
  /**
   * Deterministic message id. Defaults to a value derived from the release id so
   * the output is reproducible (no wall-clock / random in the XML body).
   */
  messageId?: string;
  /**
   * Deterministic message-created timestamp (ISO-8601). Defaults to the release
   * date at midnight UTC so the XML stays reproducible.
   */
  createdAt?: string;
  /** Optional per-track ISWC (composition) map keyed by track id. */
  iswcByTrackId?: Record<string, string>;
}

/** The label's default DDEX sender name. */
export const DEFAULT_MESSAGE_SENDER = "PlayReggaeMusic.ai";

/** XML-escape text content (and attribute values). */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A single XML element `<tag>escaped-text</tag>` (text is escaped). */
function el(tag: string, text: string): string {
  return `<${tag}>${escapeXml(text)}</${tag}>`;
}

/**
 * Build a DDEX ERN-style `NewReleaseMessage` XML string for a release + tracks.
 *
 * Throws BEFORE producing any XML if:
 *   - the release has no valid UPC/EAN barcode (uses {@link isValidUPC}), or
 *   - the track list is empty, or
 *   - ANY track lacks a valid ISRC (uses {@link isValidISRC}),
 *   - an optional supplied ISWC is malformed (uses {@link isValidISWC}).
 *
 * The thrown error names the offending field so callers can surface it.
 */
export function buildErnMessage(release: Release, tracks: Track[], opts: BuildErnOptions): string {
  // --- Validation gate (reuse P2B01 validators) ---------------------------
  if (release.upc === undefined || !isValidUPC(release.upc)) {
    throw new Error(
      `Cannot build ERN for release ${release.id}: missing or invalid UPC (got ${
        release.upc ?? "undefined"
      }).`,
    );
  }
  if (tracks.length === 0) {
    throw new Error(`Cannot build ERN for release ${release.id}: no tracks.`);
  }
  for (const track of tracks) {
    if (track.isrc === undefined || !isValidISRC(track.isrc)) {
      throw new Error(
        `Cannot build ERN for release ${release.id}: track ${track.id} has missing or invalid ISRC (got ${
          track.isrc ?? "undefined"
        }).`,
      );
    }
  }

  const upc = normalizeUPC(release.upc);
  const artistName = opts.artistName;
  if (typeof artistName !== "string" || artistName.trim() === "") {
    throw new Error(`Cannot build ERN for release ${release.id}: missing artistName.`);
  }
  const aiGenerated = opts.aiGenerated ?? release.aiGenerated === true;
  const sender = opts.messageSender ?? DEFAULT_MESSAGE_SENDER;
  const recipient = opts.messageRecipient ?? "DSP";
  const messageId = opts.messageId ?? `ERN-${release.id}`;
  const createdAt = opts.createdAt ?? `${release.releaseDate}T00:00:00Z`;
  const iswcByTrackId = opts.iswcByTrackId ?? {};

  // Validate any supplied ISWCs up-front.
  for (const [trackId, iswc] of Object.entries(iswcByTrackId)) {
    if (!isValidISWC(iswc)) {
      throw new Error(
        `Cannot build ERN for release ${release.id}: track ${trackId} has invalid ISWC (got ${iswc}).`,
      );
    }
  }

  // --- ResourceList: one SoundRecording per track -------------------------
  const resources = tracks
    .map((track, index) => {
      const isrc = normalizeISRC(track.isrc as string);
      const ref = `A${index + 1}`;
      const iswc = iswcByTrackId[track.id];
      const lines: string[] = [
        `<SoundRecording>`,
        el("ResourceReference", ref),
        el("ISRC", isrc),
      ];
      if (iswc) {
        // Work/composition identifier mapped onto the recording's work.
        lines.push(`<ReferenceTitle>`, el("TitleText", track.title), `</ReferenceTitle>`);
        lines.push(`<Work>`, el("ISWC", normalizeISWC(iswc)), `</Work>`);
      } else {
        lines.push(`<ReferenceTitle>`, el("TitleText", track.title), `</ReferenceTitle>`);
      }
      lines.push(el("DisplayArtist", artistName));
      lines.push(el("Duration", `PT${Math.max(0, Math.round(track.durationSec))}S`));
      lines.push(el("IsAiGenerated", aiGenerated ? "true" : "false"));
      lines.push(`</SoundRecording>`);
      return lines.join("");
    })
    .join("");

  // --- ReleaseResourceReferences (the release bundles every recording) ----
  const releaseResourceRefs = tracks
    .map((_track, index) => el("ReleaseResourceReference", `A${index + 1}`))
    .join("");

  // --- Credits ------------------------------------------------------------
  const credits: Credit[] = release.credits ?? [];
  const creditXml = credits
    .map((c) => `<Contributor>${el("Role", c.role)}${el("PartyName", c.name)}</Contributor>`)
    .join("");

  // --- Assemble the message ----------------------------------------------
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/43" MessageSchemaVersionId="ern/43">` +
    `<MessageHeader>` +
    el("MessageId", messageId) +
    el("MessageSender", sender) +
    el("MessageRecipient", recipient) +
    el("MessageCreatedDateTime", createdAt) +
    `</MessageHeader>` +
    `<ResourceList>` +
    resources +
    `</ResourceList>` +
    `<ReleaseList>` +
    `<Release>` +
    el("ReleaseId", upc) +
    `<ReleaseId>${el("ICPN", upc)}</ReleaseId>` +
    el("ReferenceTitle", release.title) +
    el("DisplayArtist", artistName) +
    el("ReleaseType", release.type) +
    el("ReleaseDate", release.releaseDate) +
    el("IsAiGenerated", aiGenerated ? "true" : "false") +
    el("AiDisclosure", aiGenerated ? "This release was generated with artificial intelligence." : "") +
    (creditXml ? `<ContributorList>${creditXml}</ContributorList>` : "") +
    `<ReleaseResourceReferenceList>` +
    releaseResourceRefs +
    `</ReleaseResourceReferenceList>` +
    `</Release>` +
    `</ReleaseList>` +
    `<DealList>` +
    `<ReleaseDeal>` +
    el("DealReleaseReference", upc) +
    el("CommercialModelType", "PayAsYouGoModel") +
    el("ValidityStartDate", release.releaseDate) +
    `</ReleaseDeal>` +
    `</DealList>` +
    `</ern:NewReleaseMessage>`;

  return xml;
}

/** Result of {@link validateErn}: ok plus any structural problems found. */
export interface ErnValidationResult {
  ok: boolean;
  problems: string[];
}

/**
 * Structurally validate an ERN XML string. Confirms it is WELL-FORMED (parses)
 * and that the required elements exist:
 *   NewReleaseMessage > MessageHeader (MessageId, MessageSender),
 *   ResourceList > >=1 SoundRecording each with an ISRC,
 *   ReleaseList > Release with a ReleaseId + ReferenceTitle + DisplayArtist.
 *
 * Returns `{ ok, problems }` rather than throwing so callers can branch.
 */
export function validateErn(xml: string): ErnValidationResult {
  const problems: string[] = [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    // Always coerce repeated/optional nodes deterministically.
    isArray: (name) => name === "SoundRecording",
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, problems: [`not well-formed XML: ${e instanceof Error ? e.message : String(e)}`] };
  }

  const message = (parsed["ern:NewReleaseMessage"] ?? parsed["NewReleaseMessage"]) as
    | Record<string, unknown>
    | undefined;
  if (!message || typeof message !== "object") {
    return { ok: false, problems: ["missing NewReleaseMessage root element"] };
  }

  const header = message["MessageHeader"] as Record<string, unknown> | undefined;
  if (!header) {
    problems.push("missing MessageHeader");
  } else {
    if (header["MessageId"] === undefined) problems.push("missing MessageHeader/MessageId");
    if (header["MessageSender"] === undefined) problems.push("missing MessageHeader/MessageSender");
  }

  const resourceList = message["ResourceList"] as Record<string, unknown> | undefined;
  const recordings = resourceList?.["SoundRecording"] as Array<Record<string, unknown>> | undefined;
  if (!resourceList || !recordings || recordings.length === 0) {
    problems.push("missing ResourceList/SoundRecording");
  } else {
    recordings.forEach((rec, i) => {
      if (rec["ISRC"] === undefined || String(rec["ISRC"]).trim() === "") {
        problems.push(`SoundRecording[${i}] missing ISRC`);
      }
    });
  }

  const releaseList = message["ReleaseList"] as Record<string, unknown> | undefined;
  const releaseNode = releaseList?.["Release"] as Record<string, unknown> | undefined;
  if (!releaseList || !releaseNode) {
    problems.push("missing ReleaseList/Release");
  } else {
    if (releaseNode["ReleaseId"] === undefined) problems.push("missing Release/ReleaseId");
    if (releaseNode["ReferenceTitle"] === undefined) problems.push("missing Release/ReferenceTitle");
    if (releaseNode["DisplayArtist"] === undefined) problems.push("missing Release/DisplayArtist");
  }

  return { ok: problems.length === 0, problems };
}
