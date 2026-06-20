/**
 * Firestore security rules tests (B03). Emulator-only: guarded so plain
 * `pnpm test` (no emulator) does not run them. Run via `pnpm test:emulator`.
 *
 * Asserts:
 *   - public (unauthenticated) CAN read catalog `artists`,
 *   - public CANNOT write `artists` (admin-only),
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
      await setDoc(doc(db, "tracks", "trk1"), { title: "Foundation Stones" });
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
