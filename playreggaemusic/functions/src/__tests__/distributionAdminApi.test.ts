/**
 * Distribution admin-callable auth-guard tests (P2B03, F4) — OFFLINE unit gate.
 * No emulator, no network, no live distributor.
 *
 * The distribution flow (scheduleRelease / deliverRelease) is MOCKED so the
 * handlers never touch Firestore. Assertions focus on:
 *   - assertAdmin runs FIRST: a non-admin / unauthenticated caller is rejected
 *     (permission-denied / unauthenticated) and NO scheduling/delivery happens,
 *   - an admin caller is allowed through,
 *   - adminDeliverRelease only proceeds with `approved: true` and the real
 *     DdexDistributorClient is NEVER constructed/invoked — a FakeDistributorClient
 *     is injected.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const scheduleRelease = vi.fn(async (releaseId: string, scheduledAt: string) => ({
  releaseId,
  status: "scheduled",
  scheduledAt,
  updatedAt: "2026-06-21T00:00:00.000Z",
}));
const deliverRelease = vi.fn(
  async (releaseId: string, opts: { client: unknown; approved: boolean }) => {
    if (opts.approved !== true) {
      throw new Error("distribution requires approval");
    }
    // Exercise the injected client so the test can assert it was the Fake.
    await (opts.client as { deliver: (x: string, m: unknown) => Promise<unknown> }).deliver(
      "<ern/>",
      { releaseId, upc: "196633982100", title: "t" },
    );
    return {
      releaseId,
      status: "accepted",
      deliveryId: "fake-delivery-1",
      deliveredAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    };
  },
);

vi.mock("../app/distribution/release", () => ({
  scheduleRelease: (releaseId: string, scheduledAt: string) =>
    scheduleRelease(releaseId, scheduledAt),
  deliverRelease: (releaseId: string, opts: { client: unknown; approved: boolean }) =>
    deliverRelease(releaseId, opts),
}));

import {
  handleScheduleRelease,
  handleDeliverRelease,
  type AdminAuthContext,
} from "../app/gateway/adminApi";
import { FakeDistributorClient } from "../app/distribution/client";

const ADMIN: AdminAuthContext = { uid: "owner", token: { admin: true } };
const NON_ADMIN: AdminAuthContext = { uid: "fan", token: { admin: false } };

describe("distribution admin callables (P2B03)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // -- adminScheduleRelease -------------------------------------------------

  it("handleScheduleRelease rejects non-admin and never schedules", async () => {
    await expect(
      handleScheduleRelease({ auth: NON_ADMIN, data: { releaseId: "r1", scheduledAt: "2026-07-04T00:00:00Z" } }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(scheduleRelease).not.toHaveBeenCalled();
  });

  it("handleScheduleRelease rejects an unauthenticated caller", async () => {
    await expect(
      handleScheduleRelease({ auth: undefined, data: { releaseId: "r1", scheduledAt: "x" } }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(scheduleRelease).not.toHaveBeenCalled();
  });

  it("handleScheduleRelease allows admin and schedules", async () => {
    const result = await handleScheduleRelease({
      auth: ADMIN,
      data: { releaseId: "foundation-stones", scheduledAt: "2026-07-04T00:00:00Z" },
    });
    expect(result.status).toBe("scheduled");
    expect(scheduleRelease).toHaveBeenCalledOnce();
  });

  it("handleScheduleRelease rejects malformed input (invalid-argument)", async () => {
    await expect(
      handleScheduleRelease({ auth: ADMIN, data: { releaseId: "r1" } }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(scheduleRelease).not.toHaveBeenCalled();
  });

  // -- adminDeliverRelease --------------------------------------------------

  it("handleDeliverRelease rejects non-admin and never delivers", async () => {
    const client = new FakeDistributorClient();
    await expect(
      handleDeliverRelease({ auth: NON_ADMIN, data: { releaseId: "r1", approved: true } }, client),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(deliverRelease).not.toHaveBeenCalled();
    expect(client.deliveries).toHaveLength(0);
  });

  it("handleDeliverRelease REJECTS a missing/false approval as invalid-argument (no delivery)", async () => {
    const client = new FakeDistributorClient();
    await expect(
      handleDeliverRelease({ auth: ADMIN, data: { releaseId: "r1", approved: false } }, client),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      handleDeliverRelease({ auth: ADMIN, data: { releaseId: "r1" } }, client),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(deliverRelease).not.toHaveBeenCalled();
    expect(client.deliveries).toHaveLength(0);
  });

  it("handleDeliverRelease with admin + approved:true delivers via the INJECTED Fake client", async () => {
    const client = new FakeDistributorClient();
    const result = await handleDeliverRelease(
      { auth: ADMIN, data: { releaseId: "foundation-stones", approved: true } },
      client,
    );
    expect(result.status).toBe("accepted");
    expect(result.deliveryId).toBe("fake-delivery-1");
    expect(deliverRelease).toHaveBeenCalledOnce();
    // Proof the FakeDistributorClient (not the real one) carried the delivery.
    expect(client.deliveries).toHaveLength(1);
    expect(client.deliveries[0].meta.releaseId).toBe("foundation-stones");
  });
});
