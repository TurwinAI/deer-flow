/**
 * Storage security rules tests (B05). Emulator-only: guarded so plain
 * `pnpm test` (no emulator) skips them. Requires the STORAGE emulator —
 * run via `pnpm test:emulator` (which starts firestore + storage).
 *
 * Asserts the master-protection invariant:
 *   - an unauthenticated client CANNOT read masters/...,
 *   - a non-admin authenticated client CANNOT read masters/...,
 *   - clients CAN read previews/... (public preview clips).
 *
 * Fallback: if the storage emulator is not reachable (no STORAGE_EMULATOR_HOST
 * / FIREBASE_STORAGE_EMULATOR_HOST), this whole suite skips and the static
 * assertion suite below verifies storage.rules denies master reads by reading
 * the rules file. The static suite always runs so coverage never silently
 * disappears.
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
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// __dirname is functions/src/__tests__ at runtime; rules live at repo root.
const STORAGE_RULES_PATH = resolve(__dirname, "../../../storage.rules");

// The storage emulator advertises itself via one of these env vars under
// `firebase emulators:exec --only firestore,storage`.
const STORAGE_HOST =
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? process.env.STORAGE_EMULATOR_HOST;
const RUN_DYNAMIC = Boolean(STORAGE_HOST);

describe.skipIf(!RUN_DYNAMIC)("storage.rules — masters unreadable (emulator)", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, portStr] = (STORAGE_HOST ?? "").split(":");
    testEnv = await initializeTestEnvironment({
      projectId: "playreggaemusic-dev",
      storage: {
        rules: readFileSync(STORAGE_RULES_PATH, "utf8"),
        host: host || "127.0.0.1",
        port: portStr ? Number(portStr) : 9199,
      },
    });
    // Seed objects via the admin SDK (bypasses rules, uses the GCS upload path
    // the storage emulator accepts; the client SDK's uploadString returns a
    // bare-400 against the emulator). The admin bucket must match the bucket
    // the rules-unit-testing client targets: bare `<projectId>` here.
    if (getApps().length === 0) {
      initializeApp({ projectId: "playreggaemusic-dev", storageBucket: "playreggaemusic-dev" });
    }
    const bucket = getStorage().bucket("playreggaemusic-dev");
    // `resumable: false` forces a simple (multipart) upload — the resumable
    // path uses a streaming fetch body that needs `duplex`, which the bundled
    // gaxios does not set under Node 18+ fetch and fails in this test env.
    await bucket
      .file("masters/foundation-stones/01.wav")
      .save(Buffer.from("MASTER"), { resumable: false });
    await bucket
      .file("previews/foundation-stones/01.mp3")
      .save(Buffer.from("PREVIEW"), { resumable: false });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("unauthenticated client CANNOT read masters/...", async () => {
    const storage = testEnv.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, "masters/foundation-stones/01.wav")));
  });

  it("non-admin authenticated client CANNOT read masters/...", async () => {
    const storage = testEnv.authenticatedContext("fan").storage();
    await assertFails(getBytes(ref(storage, "masters/foundation-stones/01.wav")));
  });

  it("unauthenticated client CAN read previews/...", async () => {
    const storage = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(getBytes(ref(storage, "previews/foundation-stones/01.mp3")));
  });
});

// Static fallback — always runs, even without the storage emulator. Verifies
// the masters path in storage.rules denies all reads/writes.
describe("storage.rules — masters denied (static)", () => {
  const rules = readFileSync(STORAGE_RULES_PATH, "utf8");

  it("masters path denies read and write", () => {
    // Match the masters block from its `match` line up to (but not including)
    // the next `match` declaration, then assert read+write are denied.
    const block = /match\s+\/masters\/[\s\S]*?(?=match\s+\/|\n\s*\})/.exec(rules)?.[0] ?? "";
    expect(block).toMatch(/allow read, write:\s*if false/);
  });

  it("previews path allows public read", () => {
    const block = /match\s+\/previews\/[\s\S]*?(?=match\s+\/)/.exec(rules)?.[0] ?? "";
    expect(block).toMatch(/allow read:\s*if true/);
  });
});
