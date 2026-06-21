/**
 * Works registry unit tests (P2B06, F8). Pure — no emulator, no network. Uses an
 * in-memory Firestore-like fake injected as the `store` so registerWork /
 * setWriterSplits identifier + split validation is exercised in isolation.
 *
 * Proves:
 *   - registerWork validates the ISWC (rejects an invalid check digit),
 *   - registerWork validates EACH linked ISRC (rejects a malformed one),
 *   - writer splits must sum to 100 (a non-summing set is rejected),
 *   - the PUBLIC work doc never carries writer splits.
 */
import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { registerWork, setWriterSplits, type Work } from "../app/publishing/works";

/** Minimal in-memory store implementing the doc().set()/get() surface used. */
class FakeStore {
  public readonly docs = new Map<string, Record<string, unknown>>();
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
    };
  }
}

function store(): { fs: Firestore; raw: FakeStore } {
  const raw = new FakeStore();
  return { fs: raw as unknown as Firestore, raw };
}

// A valid ISWC (T + 9 work digits + correct ISO-15707 check digit). For work
// digits 000000001 the check digit is 0, giving T0000000010 (verified vs
// isValidISWC). T0000000019 has the wrong check digit and must be rejected.
const VALID_ISWC = "T0000000010";
const VALID_ISRC = "US-RC1-26-00001";
const VALID_ISRC_2 = "GB-XYZ-26-12345";

describe("registerWork — identifier validation (P2B06)", () => {
  it("accepts a valid ISWC + valid linked ISRCs and normalizes them", async () => {
    const { fs, raw } = store();
    const work: Work = {
      id: "work-1",
      title: "Foundation Stones",
      iswc: VALID_ISWC,
      linkedIsrcs: [VALID_ISRC, VALID_ISRC_2],
    };
    const saved = await registerWork(work, fs);
    expect(saved.iswc).toBe("T0000000010");
    // Linked ISRCs normalized (hyphens stripped, uppercased).
    expect(saved.linkedIsrcs).toEqual(["USRC12600001", "GBXYZ2612345"]);
    const doc = raw.docs.get("works/work-1");
    expect(doc).toBeDefined();
    // PUBLIC doc carries ONLY transparency fields — never writer splits.
    expect(Object.keys(doc as object).sort()).toEqual(["id", "iswc", "linkedIsrcs", "title"]);
  });

  it("rejects an invalid ISWC (bad check digit)", async () => {
    const { fs, raw } = store();
    await expect(
      registerWork({ id: "w", title: "x", iswc: "T0000000019", linkedIsrcs: [] }, fs),
    ).rejects.toThrow(/Invalid ISWC/);
    // Nothing persisted on rejection.
    expect(raw.docs.size).toBe(0);
  });

  it("rejects a malformed linked ISRC", async () => {
    const { fs, raw } = store();
    await expect(
      registerWork({ id: "w", title: "x", linkedIsrcs: ["NOT-AN-ISRC"] }, fs),
    ).rejects.toThrow(/Invalid linked ISRC/);
    expect(raw.docs.size).toBe(0);
  });

  it("registers a work with no ISWC (optional) and empty links", async () => {
    const { fs } = store();
    const saved = await registerWork({ id: "w2", title: "Untitled", linkedIsrcs: [] }, fs);
    expect(saved.iswc).toBeUndefined();
    expect(saved.linkedIsrcs).toEqual([]);
  });
});

describe("setWriterSplits — splits must sum to 100 (P2B06)", () => {
  it("accepts splits that sum to 100", async () => {
    const { fs, raw } = store();
    const record = await setWriterSplits(
      "work-1",
      [
        { payee: "Roots Untold", percent: 60 },
        { payee: "PlayReggaeMusic.ai", percent: 40 },
      ],
      fs,
    );
    expect(record.writerSplits).toHaveLength(2);
    // Stored in the admin-only work_splits collection.
    expect(raw.docs.get("work_splits/work-1")).toBeDefined();
    // NOT stored in the public works doc.
    expect(raw.docs.get("works/work-1")).toBeUndefined();
  });

  it("rejects splits that do not sum to 100", async () => {
    const { fs, raw } = store();
    await expect(
      setWriterSplits(
        "work-1",
        [
          { payee: "A", percent: 60 },
          { payee: "B", percent: 30 },
        ],
        fs,
      ),
    ).rejects.toThrow(/sum to 100/);
    expect(raw.docs.size).toBe(0);
  });

  it("rejects a zero/negative percent", async () => {
    const { fs } = store();
    await expect(
      setWriterSplits("work-1", [{ payee: "A", percent: 0 }], fs),
    ).rejects.toThrow();
  });
});
