/**
 * Marketing admin-callable auth-guard tests (P2B07, F5) — OFFLINE unit gate.
 * No emulator, no network, no live channels.
 *
 * The marketing flow (planAndSaveCampaign / scheduleCampaign / recordMarketing
 * Event) is MOCKED so the handlers never touch Firestore. Assertions focus on:
 *   - assertAdmin runs FIRST: a non-admin / unauthenticated caller is rejected
 *     and NO action happens,
 *   - the CONSEQUENTIAL publish/email/spend handlers REJECT a missing/false
 *     `approved` BEFORE any channel call (no Fake call happened),
 *   - with admin + approved:true they act via the INJECTED Fake channel (proving
 *     the real channel is never constructed/invoked).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const planAndSaveCampaign = vi.fn(async (releaseId: string) => ({
  id: `campaign-${releaseId}`,
  releaseId,
  status: "planned",
  budgetCents: 0,
  steps: [],
}));
const scheduleCampaign = vi.fn(async (campaignId: string) => ({
  campaign: { id: campaignId, releaseId: "r", status: "scheduled", budgetCents: 0, steps: [] },
  scheduledSteps: [],
}));
const listCampaigns = vi.fn(async () => []);
const recordMarketingEvent = vi.fn(async (e: unknown) => e);

vi.mock("../app/marketing/campaign", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/marketing/campaign")>();
  return {
    ...actual,
    planAndSaveCampaign: (releaseId: string) => planAndSaveCampaign(releaseId),
    listCampaigns: () => listCampaigns(),
    recordMarketingEvent: (e: unknown) => recordMarketingEvent(e),
  };
});

vi.mock("../app/marketing/scheduling", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/marketing/scheduling")>();
  return {
    ...actual,
    scheduleCampaign: (campaignId: string) => scheduleCampaign(campaignId),
  };
});

import {
  handlePlanCampaign,
  handleScheduleCampaign,
  handleListCampaigns,
  handlePublishSocialPost,
  handleSendEmailBlast,
  handleMarketingSpend,
  type AdminAuthContext,
} from "../app/gateway/adminApi";
import {
  FakeSocialChannel,
  FakeEmailChannel,
  FakeAdChannel,
} from "../app/marketing/channels";

const ADMIN: AdminAuthContext = { uid: "owner", token: { admin: true } };
const NON_ADMIN: AdminAuthContext = { uid: "fan", token: { admin: false } };

describe("marketing admin callables (P2B07)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // -- NON-consequential: plan / schedule / list ----------------------------

  it("handlePlanCampaign rejects non-admin and never plans", async () => {
    await expect(
      handlePlanCampaign({ auth: NON_ADMIN, data: { releaseId: "r1" } }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(planAndSaveCampaign).not.toHaveBeenCalled();
  });

  it("handlePlanCampaign allows admin + plans", async () => {
    const result = await handlePlanCampaign({ auth: ADMIN, data: { releaseId: "foundation-stones" } });
    expect(result.id).toBe("campaign-foundation-stones");
    expect(planAndSaveCampaign).toHaveBeenCalledOnce();
  });

  it("handleScheduleCampaign rejects unauthenticated; allows admin", async () => {
    await expect(
      handleScheduleCampaign({ auth: undefined, data: { campaignId: "c", baseTime: "x" } }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(scheduleCampaign).not.toHaveBeenCalled();
    const result = await handleScheduleCampaign({
      auth: ADMIN,
      data: { campaignId: "campaign-x", baseTime: "2026-07-01T00:00:00Z" },
    });
    expect(result.campaign.status).toBe("scheduled");
    expect(scheduleCampaign).toHaveBeenCalledOnce();
  });

  it("handleListCampaigns rejects non-admin; allows admin", async () => {
    await expect(
      handleListCampaigns({ auth: NON_ADMIN, data: {} }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await handleListCampaigns({ auth: ADMIN, data: {} });
    expect(listCampaigns).toHaveBeenCalledOnce();
  });

  // -- CONSEQUENTIAL: publish / email / spend (require approved:true) --------

  it("handlePublishSocialPost rejects non-admin; no Fake post happens", async () => {
    const channel = new FakeSocialChannel();
    await expect(
      handlePublishSocialPost(
        { auth: NON_ADMIN, data: { platform: "x", message: "m", approved: true } },
        channel,
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(channel.posts).toHaveLength(0);
  });

  it("handlePublishSocialPost REJECTS missing/false approval BEFORE any post", async () => {
    const channel = new FakeSocialChannel();
    await expect(
      handlePublishSocialPost({ auth: ADMIN, data: { platform: "x", message: "m", approved: false } }, channel),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      handlePublishSocialPost({ auth: ADMIN, data: { platform: "x", message: "m" } }, channel),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(channel.posts).toHaveLength(0);
  });

  it("handlePublishSocialPost with admin + approved:true posts via the INJECTED Fake", async () => {
    const channel = new FakeSocialChannel();
    const result = await handlePublishSocialPost(
      { auth: ADMIN, data: { platform: "instagram", message: "Foundation Stones out now", approved: true } },
      channel,
    );
    expect(result.postId).toBe("fake-social-1");
    expect(channel.posts).toHaveLength(1);
    expect(recordMarketingEvent).toHaveBeenCalledOnce();
  });

  it("handleSendEmailBlast REJECTS missing approval; with approval sends via Fake", async () => {
    const channel = new FakeEmailChannel();
    await expect(
      handleSendEmailBlast({ auth: ADMIN, data: { segment: "n", subject: "s", body: "b" } }, channel),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(channel.blasts).toHaveLength(0);
    const result = await handleSendEmailBlast(
      { auth: ADMIN, data: { segment: "newsletter", subject: "s", body: "b", approved: true } },
      channel,
    );
    expect(result.sendId).toBe("fake-email-1");
    expect(channel.blasts).toHaveLength(1);
  });

  it("handleMarketingSpend REJECTS missing approval; with approval spends via Fake", async () => {
    const channel = new FakeAdChannel();
    await expect(
      handleMarketingSpend(
        { auth: ADMIN, data: { platform: "meta", budgetCents: 5000, currency: "USD", objective: "reach" } },
        channel,
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(channel.spends).toHaveLength(0);
    const result = await handleMarketingSpend(
      { auth: ADMIN, data: { platform: "meta", budgetCents: 5000, currency: "USD", objective: "reach", approved: true } },
      channel,
    );
    expect(result.adOrderId).toBe("fake-ad-1");
    expect(channel.spends).toHaveLength(1);
  });

  it("handleMarketingSpend rejects non-positive budget as invalid-argument", async () => {
    const channel = new FakeAdChannel();
    await expect(
      handleMarketingSpend(
        { auth: ADMIN, data: { platform: "meta", budgetCents: 0, currency: "USD", objective: "x", approved: true } },
        channel,
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(channel.spends).toHaveLength(0);
  });
});
