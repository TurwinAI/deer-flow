/**
 * `adminListDistributions` auth-guard tests (P2B10) — OFFLINE unit gate. No
 * emulator, no network. The distribution store + label store are MOCKED so the
 * handler never touches Firestore. Assertions focus on the SECURITY GUARD
 * (assertAdmin runs first) and the title join used by the admin status view.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const listDistributionRecords = vi.fn(async () => [
  {
    releaseId: "foundation-stones",
    status: "delivered" as const,
    scheduledAt: "2026-07-04T00:00:00.000Z",
    deliveredAt: "2026-07-04T01:00:00.000Z",
    updatedAt: "2026-07-04T01:00:00.000Z",
  },
]);
const getRelease = vi.fn(async (id: string) =>
  id === "foundation-stones"
    ? {
        id,
        artistId: "roots-untold",
        title: "Foundation Stones",
        catalogNumber: "PRM-001",
        type: "ep" as const,
        releaseDate: "2026-07-04",
        aiGenerated: true as const,
      }
    : undefined,
);

vi.mock("../app/distribution/store", () => ({
  listDistributionRecords: () => listDistributionRecords(),
}));

vi.mock("../app/label/store", () => ({
  getRelease: (id: string) => getRelease(id),
}));

import { handleListDistributions, type AdminAuthContext } from "../app/gateway/adminApi";

const ADMIN: AdminAuthContext = { uid: "owner", token: { admin: true } };
const NON_ADMIN: AdminAuthContext = { uid: "fan", token: { admin: false } };

describe("adminListDistributions (P2B10)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a non-admin and never reads the store", async () => {
    await expect(
      handleListDistributions({ auth: NON_ADMIN, data: {} }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(listDistributionRecords).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(handleListDistributions({ data: {} })).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("allows an admin and joins the release title", async () => {
    const rows = await handleListDistributions({ auth: ADMIN, data: {} });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      releaseId: "foundation-stones",
      status: "delivered",
      title: "Foundation Stones",
    });
  });
});
