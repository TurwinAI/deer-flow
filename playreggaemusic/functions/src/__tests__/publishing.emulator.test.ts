/**
 * Publishing admin (P2B06, F8) — EMULATOR-only. Guarded so plain `pnpm test`
 * skips it; run via `pnpm test:emulator`.
 *
 * Proves:
 *   - registerWork writes the PUBLIC works/{id} doc WITHOUT writer splits,
 *   - setWriterSplits lands the splits in the admin-only work_splits collection,
 *   - PRO affiliation via FakeProRegistrar persists to pro_affiliations (no live
 *     PRO/MLC call),
 *   - a sync_catalog entry is written + readable.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import { registerWork, setWriterSplits, getWork, getWriterSplits } from "../app/publishing/works";
import { registerProAffiliation, getProAffiliation, FakeProRegistrar } from "../app/publishing/pro";
import { addToSyncCatalog, getSyncCatalogEntry } from "../app/publishing/sync";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;
const VALID_ISWC = "T0000000010";
const VALID_ISRC = "USRC12600001";

describe.skipIf(RUN)("publishing admin (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of ["works", "work_splits", "pro_affiliations", "sync_catalog"]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("registerWork writes a PUBLIC works doc WITHOUT writer splits", async () => {
    await registerWork({
      id: "work-foundation",
      title: "Foundation Stones",
      iswc: VALID_ISWC,
      linkedIsrcs: [VALID_ISRC],
    });
    const db = getDb();
    const snap = await db.collection("works").doc("work-foundation").get();
    expect(snap.exists).toBe(true);
    const data = snap.data() as Record<string, unknown>;
    // PUBLIC transparency fields only — writer splits must NOT be here.
    expect(data.title).toBe("Foundation Stones");
    expect(data.iswc).toBe(VALID_ISWC);
    expect(data.linkedIsrcs).toEqual([VALID_ISRC]);
    expect("writerSplits" in data).toBe(false);
    expect("splits" in data).toBe(false);
  });

  it("setWriterSplits lands SENSITIVE splits in admin-only work_splits, not works", async () => {
    await registerWork({ id: "work-foundation", title: "Foundation Stones", linkedIsrcs: [] });
    await setWriterSplits("work-foundation", [
      { payee: "Roots Untold", percent: 70 },
      { payee: "PlayReggaeMusic.ai", percent: 30 },
    ]);
    const db = getDb();
    // The splits are in work_splits.
    const splitsSnap = await db.collection("work_splits").doc("work-foundation").get();
    expect(splitsSnap.exists).toBe(true);
    expect((splitsSnap.data() as { writerSplits: unknown[] }).writerSplits).toHaveLength(2);
    // The PUBLIC works doc still carries NO splits.
    const workSnap = await db.collection("works").doc("work-foundation").get();
    const workData = workSnap.data() as Record<string, unknown>;
    expect("writerSplits" in workData).toBe(false);

    // Read-back helpers agree.
    const work = await getWork("work-foundation");
    expect(work?.title).toBe("Foundation Stones");
    const splits = await getWriterSplits("work-foundation");
    expect(splits?.writerSplits.map((s) => s.percent).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("PRO affiliation via FakeProRegistrar persists to pro_affiliations (no live call)", async () => {
    const registrar = new FakeProRegistrar();
    const confirmation = await registerProAffiliation(
      { writerId: "roots-untold", pro: "ASCAP", ipi: "00000000000", memberId: "M-123" },
      registrar,
    );
    expect(confirmation.confirmationId).toMatch(/^fake-pro-ascap-/);
    // The fake recorded the registration — no network was used.
    expect(registrar.registered).toHaveLength(1);
    const stored = await getProAffiliation("roots-untold");
    expect(stored?.pro).toBe("ASCAP");
    expect(stored?.memberId).toBe("M-123");
  });

  it("sync_catalog entry is written + publicly-shaped + readable", async () => {
    const entry = await addToSyncCatalog({
      recordingId: VALID_ISRC,
      workId: "work-foundation",
      title: "Foundation Stones",
    });
    expect(entry.available).toBe(true);
    const got = await getSyncCatalogEntry(VALID_ISRC);
    expect(got?.workId).toBe("work-foundation");
    expect(got?.recordingId).toBe(VALID_ISRC);
  });
});
