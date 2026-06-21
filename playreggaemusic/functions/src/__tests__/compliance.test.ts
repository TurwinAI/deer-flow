/**
 * Release compliance gate unit tests (P2B09, F10). Pure — no emulator, no
 * network. Uses an in-memory Firestore-like fake injected as the `store`, with
 * just enough surface (doc().set/get + collection().where().get()) to exercise
 * the compliance logic in isolation.
 *
 * Proves checkReleaseCompliance flags the SPECIFIC issue when:
 *   - a track is missing its AI-provenance record,
 *   - ownership splits are missing,
 *   - no ACTIVE artist agreement with AI-generation consent is on file,
 * and that a fully set-up release is compliant (with the placeholder license
 * surfaced only as a non-blocking WARNING).
 */
import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { checkReleaseCompliance, WARNING_PREFIX } from "../app/legal/compliance";

/**
 * Minimal in-memory store: supports `collection(name).doc(id).set/get` and
 * `collection(name).where(field,"==",value).get()`. Sufficient for the store
 * reads the compliance gate performs (getRelease/getRights/getProvenance/
 * getAgreement/getLicenseTerms + listTracksByRelease).
 */
class FakeStore {
  public readonly docs = new Map<string, Record<string, unknown>>();

  set(coll: string, id: string, data: Record<string, unknown>): void {
    this.docs.set(`${coll}/${id}`, data);
  }

  collection(name: string) {
    const docs = this.docs;
    return {
      doc(id: string) {
        const key = `${name}/${id}`;
        return {
          async set(data: Record<string, unknown>) {
            docs.set(key, data);
          },
          async get() {
            const data = docs.get(key);
            return { exists: data !== undefined, data: () => data };
          },
        };
      },
      where(field: string, _op: string, value: unknown) {
        return {
          async get() {
            const matched = [...docs.entries()]
              .filter(([k]) => k.startsWith(`${name}/`))
              .map(([, data]) => data)
              .filter((data) => data[field] === value);
            return { docs: matched.map((data) => ({ data: () => data })) };
          },
        };
      },
    };
  }
}

/** Seed a fully-compliant release; the caller can then delete pieces to break it. */
function compliantStore(): { fs: Firestore; raw: FakeStore } {
  const raw = new FakeStore();
  raw.set("releases", "rel1", {
    id: "rel1",
    artistId: "art1",
    title: "Foundation Stones",
    aiGenerated: true,
  });
  raw.set("tracks", "trk1", { id: "trk1", releaseId: "rel1", title: "A" });
  raw.set("tracks", "trk2", { id: "trk2", releaseId: "rel1", title: "B" });
  raw.set("provenance", "trk1", { trackId: "trk1", generator: "x", disclosure: "AI", contentSha256: "a" });
  raw.set("provenance", "trk2", { trackId: "trk2", generator: "x", disclosure: "AI", contentSha256: "b" });
  raw.set("rights", "rel1", {
    releaseId: "rel1",
    ownershipSplits: [
      { payee: "Label", percent: 70 },
      { payee: "Artist", percent: 30 },
    ],
  });
  raw.set("artist_agreements", "art1", {
    artistId: "art1",
    termMonths: 24,
    royaltyRatePct: 30,
    ownershipNote: "note",
    consent: { aiGenerationConsent: true, signedAt: "2026-06-01T00:00:00.000Z" },
    status: "active",
  });
  return { fs: raw as unknown as Firestore, raw };
}

describe("checkReleaseCompliance (unit)", () => {
  it("a fully set-up release is compliant (placeholder license is only a WARNING)", async () => {
    const { fs } = compliantStore();
    const result = await checkReleaseCompliance("rel1", fs);
    expect(result.compliant).toBe(true);
    // The only issue is the non-blocking license-placeholder warning.
    expect(result.issues.every((i) => i.startsWith(WARNING_PREFIX))).toBe(true);
    expect(result.issues.some((i) => /license/i.test(i))).toBe(true);
  });

  it("a release MISSING a track's provenance is NON-compliant with the specific issue", async () => {
    const { fs, raw } = compliantStore();
    raw.docs.delete("provenance/trk2");
    const result = await checkReleaseCompliance("rel1", fs);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => /trk2 has no AI-provenance/i.test(i))).toBe(true);
  });

  it("a release MISSING ownership splits is NON-compliant with the specific issue", async () => {
    const { fs, raw } = compliantStore();
    raw.docs.delete("rights/rel1");
    const result = await checkReleaseCompliance("rel1", fs);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => /ownership splits missing/i.test(i))).toBe(true);
  });

  it("ownership splits that do not sum to 100 are NON-compliant", async () => {
    const { fs, raw } = compliantStore();
    raw.set("rights", "rel1", {
      releaseId: "rel1",
      ownershipSplits: [{ payee: "Label", percent: 70 }],
    });
    const result = await checkReleaseCompliance("rel1", fs);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => /sum to 70, not 100/i.test(i))).toBe(true);
  });

  it("no ACTIVE agreement on file is NON-compliant with the specific issue", async () => {
    const { fs, raw } = compliantStore();
    raw.docs.delete("artist_agreements/art1");
    const result = await checkReleaseCompliance("rel1", fs);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => /agreement missing/i.test(i))).toBe(true);
  });

  it("a DRAFT (not active) agreement is NON-compliant", async () => {
    const { fs, raw } = compliantStore();
    raw.set("artist_agreements", "art1", {
      artistId: "art1",
      termMonths: 24,
      royaltyRatePct: 30,
      ownershipNote: "note",
      consent: { aiGenerationConsent: true, signedAt: "2026-06-01T00:00:00.000Z" },
      status: "draft",
    });
    const result = await checkReleaseCompliance("rel1", fs);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => /not active/i.test(i))).toBe(true);
  });

  it("an active agreement WITHOUT AI-generation consent is NON-compliant", async () => {
    const { fs, raw } = compliantStore();
    raw.set("artist_agreements", "art1", {
      artistId: "art1",
      termMonths: 24,
      royaltyRatePct: 30,
      ownershipNote: "note",
      consent: { aiGenerationConsent: false, signedAt: null },
      status: "active",
    });
    const result = await checkReleaseCompliance("rel1", fs);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => /consent missing/i.test(i))).toBe(true);
  });

  it("a release not flagged aiGenerated is NON-compliant", async () => {
    const { fs, raw } = compliantStore();
    raw.set("releases", "rel1", {
      id: "rel1",
      artistId: "art1",
      title: "Foundation Stones",
      aiGenerated: false,
    });
    const result = await checkReleaseCompliance("rel1", fs);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => /not flagged aiGenerated/i.test(i))).toBe(true);
  });

  it("an unknown release is NON-compliant (does not throw)", async () => {
    const { fs } = compliantStore();
    const result = await checkReleaseCompliance("nope", fs);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => /unknown release/i.test(i))).toBe(true);
  });
});
