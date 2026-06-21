/**
 * Artist agreements (P2B09, F10) — EMULATOR gate. Guarded so plain `pnpm test`
 * (no emulator) skips them. Run via `pnpm test:emulator`.
 *
 * Asserts (admin SDK, which bypasses rules):
 *   - registerAgreement writes a DRAFT, activateAgreement flips it to ACTIVE
 *     (round-trip via getAgreement); other fields/consent are preserved,
 *   - activateAgreement throws on an unknown agreement,
 *   - registerAgreement validates term + royalty rate.
 * Rules-level admin-only access is covered in rules.emulator.test.ts.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import {
  activateAgreement,
  getAgreement,
  registerAgreement,
} from "../app/legal/contracts";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(RUN)("artist agreements (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    const snap = await db.collection("artist_agreements").get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  });

  it("registerAgreement -> draft, activateAgreement -> active (round-trip)", async () => {
    const drafted = await registerAgreement({
      artistId: "art-x",
      termMonths: 24,
      royaltyRatePct: 30,
      ownershipNote: "masters owned by label",
      aiGenerationConsent: true,
      signedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(drafted.status).toBe("draft");
    expect(drafted.consent.aiGenerationConsent).toBe(true);

    const readDraft = await getAgreement("art-x");
    expect(readDraft?.status).toBe("draft");

    const active = await activateAgreement("art-x");
    expect(active.status).toBe("active");
    // Other fields + consent preserved across activation.
    expect(active.termMonths).toBe(24);
    expect(active.royaltyRatePct).toBe(30);
    expect(active.consent.aiGenerationConsent).toBe(true);
    expect(active.consent.signedAt).toBe("2026-06-01T00:00:00.000Z");

    const readActive = await getAgreement("art-x");
    expect(readActive?.status).toBe("active");
  });

  it("activateAgreement throws on an unknown agreement", async () => {
    await expect(activateAgreement("no-such-artist")).rejects.toThrow(/unknown artist agreement/i);
  });

  it("registerAgreement rejects a non-positive term and an out-of-range royalty", async () => {
    await expect(
      registerAgreement({ artistId: "a", termMonths: 0, royaltyRatePct: 30, ownershipNote: "n" }),
    ).rejects.toThrow(/termMonths/i);
    await expect(
      registerAgreement({ artistId: "a", termMonths: 12, royaltyRatePct: 150, ownershipNote: "n" }),
    ).rejects.toThrow(/royaltyRatePct/i);
  });

  it("consent defaults to not-consented, unsigned when omitted", async () => {
    const drafted = await registerAgreement({
      artistId: "art-default",
      termMonths: 12,
      royaltyRatePct: 25,
      ownershipNote: "n",
    });
    expect(drafted.consent.aiGenerationConsent).toBe(false);
    expect(drafted.consent.signedAt).toBeNull();
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
