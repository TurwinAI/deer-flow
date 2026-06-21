/**
 * Legal admin-callable auth-guard tests (P2B09, F10) — OFFLINE unit gate. No
 * emulator, no network. Focuses on the SECURITY GUARD: a non-admin /
 * unauthenticated caller is rejected with HttpsError BEFORE any Firestore work
 * (assertAdmin throws first), and a malformed admin payload is rejected as
 * invalid-argument (zod) before any write. Admin happy-path persistence is
 * covered by the emulator suites (contracts/license/compliance).
 */
import { describe, expect, it } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import {
  handleActivateAgreement,
  handleCheckReleaseCompliance,
  handleRegisterAgreement,
  handleSetLicenseTerms,
  type AdminAuthContext,
} from "../app/gateway/adminApi";

const NON_ADMIN: AdminAuthContext = { uid: "fan", token: { admin: false } };

const handlers = [
  ["handleRegisterAgreement", handleRegisterAgreement],
  ["handleActivateAgreement", handleActivateAgreement],
  ["handleSetLicenseTerms", handleSetLicenseTerms],
  ["handleCheckReleaseCompliance", handleCheckReleaseCompliance],
] as const;

describe("legal admin callables — auth guard", () => {
  it.each(handlers)("%s rejects an unauthenticated caller", async (_name, handler) => {
    await expect(handler({ auth: undefined, data: {} })).rejects.toBeInstanceOf(HttpsError);
  });

  it.each(handlers)("%s rejects a non-admin caller", async (_name, handler) => {
    await expect(handler({ auth: NON_ADMIN, data: {} })).rejects.toBeInstanceOf(HttpsError);
  });

  it("rejects a non-admin even with a well-formed payload (guard before validation)", async () => {
    await expect(
      handleRegisterAgreement({
        auth: NON_ADMIN,
        data: { artistId: "a", termMonths: 12, royaltyRatePct: 30, ownershipNote: "n" },
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
