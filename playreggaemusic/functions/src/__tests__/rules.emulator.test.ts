/**
 * Firestore security rules tests (B03). Emulator-only: guarded so plain
 * `pnpm test` (no emulator) does not run them. Run via `pnpm test:emulator`.
 *
 * Asserts:
 *   - public (unauthenticated) CAN read catalog `artists`,
 *   - public CANNOT write `artists` (admin-only),
 *   - NOBODY (anon or non-admin) can read the private `track_masters`,
 *   - NOBODY (unauthenticated client) can read engine collections
 *     `threads` / `memory` / `checkpoints`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

// __dirname is functions/src/__tests__ at runtime; rules live at repo root.
const RULES_PATH = resolve(__dirname, "../../../firestore.rules");

describe.skipIf(RUN)("firestore.rules (emulator)", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "playreggaemusic-dev",
      firestore: { rules: readFileSync(RULES_PATH, "utf8") },
    });
    // Seed a catalog doc with rules disabled so public reads have something.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "artists", "roots-untold"), { name: "Roots Untold" });
      // Releases/tracks now carry PUBLIC identifiers (isrc/upc/credits).
      await setDoc(doc(db, "releases", "rel1"), {
        title: "Foundation Stones",
        upc: "196633982100",
        credits: [{ role: "Producer", name: "PlayReggaeMusic.ai" }],
      });
      await setDoc(doc(db, "tracks", "trk1"), {
        title: "Foundation Stones",
        isrc: "USRUM2600001",
      });
      await setDoc(doc(db, "track_masters", "trk1"), {
        trackId: "trk1",
        masterPath: "masters/foundation-stones/01.wav",
      });
      // SENSITIVE ownership splits — must NOT be publicly readable.
      await setDoc(doc(db, "rights", "rel1"), {
        releaseId: "rel1",
        ownershipSplits: [
          { payee: "PlayReggaeMusic.ai", percent: 70 },
          { payee: "Roots Untold", percent: 30 },
        ],
      });
      // PUBLIC AI-provenance disclosure — must be world-readable, admin-write.
      await setDoc(doc(db, "provenance", "trk1"), {
        trackId: "trk1",
        generator: "PlayReggaeMusic.ai",
        createdAt: "2026-07-04T00:00:00.000Z",
        disclosure: "AI-generated: produced with artificial intelligence.",
        contentSha256: "a".repeat(64),
      });
      await setDoc(doc(db, "products", "prod1"), { title: "Download" });
      await setDoc(doc(db, "orders", "o1"), { customer: "cus_test" });
      await setDoc(doc(db, "threads", "t1"), { threadId: "t1" });
      await setDoc(doc(db, "memory", "u1"), { seeded: true });
      await setDoc(doc(db, "checkpoints", "c1"), { id: "c1" });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("public CAN read catalog artists", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "artists", "roots-untold")));
  });

  it("public CAN read catalog tracks", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "tracks", "trk1")));
  });

  it("public CAN read catalog products", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "products", "prod1")));
  });

  it("public CAN read a release carrying PUBLIC upc/credits", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const snap = await assertSucceeds(getDoc(doc(db, "releases", "rel1")));
    expect(snap.data()?.upc).toBe("196633982100");
    expect(Array.isArray(snap.data()?.credits)).toBe(true);
  });

  it("public CAN read a track carrying a PUBLIC isrc", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const snap = await assertSucceeds(getDoc(doc(db, "tracks", "trk1")));
    expect(snap.data()?.isrc).toBe("USRUM2600001");
  });

  it("public CANNOT write catalog artists without admin", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, "artists", "evil"), { name: "hax" }));
  });

  it("anon CANNOT write any catalog collection", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, "releases", "evilrel"), { title: "hax" }));
    await assertFails(setDoc(doc(db, "tracks", "eviltrk"), { title: "hax" }));
    await assertFails(setDoc(doc(db, "products", "evilprod"), { title: "hax" }));
  });

  it("non-admin authenticated user CANNOT write catalog artists", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(setDoc(doc(db, "artists", "evil2"), { name: "hax" }));
  });

  it("non-admin authenticated user CANNOT write catalog tracks/products", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(setDoc(doc(db, "tracks", "evil3"), { title: "hax" }));
    await assertFails(setDoc(doc(db, "products", "evil4"), { title: "hax" }));
  });

  it("NOBODY (anon) can read orders", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "orders", "o1")));
  });

  it("non-admin authenticated user CANNOT read orders", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "orders", "o1")));
  });

  it("anon CANNOT read private track_masters (master path stays private)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "track_masters", "trk1")));
  });

  it("non-admin authenticated user CANNOT read private track_masters", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "track_masters", "trk1")));
  });

  it("anon CANNOT write track_masters", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, "track_masters", "evilmaster"), { masterPath: "masters/hax.wav" }),
    );
  });

  it("anon CANNOT read private rights (ownership splits stay private)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "rights", "rel1")));
  });

  it("non-admin authenticated user CANNOT read private rights", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "rights", "rel1")));
  });

  it("anon CANNOT write rights", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, "rights", "evilrights"), {
        releaseId: "evil",
        ownershipSplits: [{ payee: "hax", percent: 100 }],
      }),
    );
  });

  it("public CAN read AI-provenance (transparency artifact, public-read)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const snap = await assertSucceeds(getDoc(doc(db, "provenance", "trk1")));
    expect(snap.data()?.generator).toBe("PlayReggaeMusic.ai");
    expect(snap.data()?.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("anon CANNOT write provenance (admin-write only)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, "provenance", "evilprov"), { trackId: "evil", generator: "hax" }),
    );
  });

  it("non-admin authenticated user CANNOT write provenance", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(
      setDoc(doc(db, "provenance", "evilprov2"), { trackId: "evil", generator: "hax" }),
    );
  });

  it("NOBODY can read engine threads", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "threads", "t1")));
  });

  it("NOBODY can read engine memory", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "memory", "u1")));
  });

  it("NOBODY can read engine checkpoints", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "checkpoints", "c1")));
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
