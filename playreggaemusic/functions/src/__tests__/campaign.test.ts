/**
 * Campaign planner + copy generation (P2B07, F5) — OFFLINE unit gate.
 * No emulator, no network, no LLM.
 *
 * Asserts:
 *   - planReleaseCampaign expands the release-campaign template into the EXACT
 *     ordered steps (one per kind, in template order, status "planned"),
 *     deterministically + idempotently (same id),
 *   - generateCampaignCopy is deterministic, mentions the release, and carries
 *     the AI-disclosure on outward copy — on-brand, with NO LLM/network.
 */
import { describe, expect, it } from "vitest";
import {
  planReleaseCampaign,
  campaignIdFor,
  RELEASE_CAMPAIGN_TEMPLATE,
} from "../app/marketing/campaign";
import { generateCampaignCopy, AI_DISCLOSURE } from "../app/marketing/copy";
import type { Release } from "../app/label";

const RELEASE: Release = {
  id: "foundation-stones",
  artistId: "roots-untold",
  title: "Foundation Stones",
  catalogNumber: "PRM-001",
  type: "ep",
  releaseDate: "2026-07-04",
  aiGenerated: true,
};

describe("planReleaseCampaign (P2B07 template expansion)", () => {
  it("expands the template into the expected ordered steps", () => {
    const campaign = planReleaseCampaign("foundation-stones", { budgetCents: 5000 });
    expect(campaign.id).toBe("campaign-foundation-stones");
    expect(campaign.releaseId).toBe("foundation-stones");
    expect(campaign.status).toBe("planned");
    expect(campaign.budgetCents).toBe(5000);
    // Exact ordered kinds match the canonical template.
    expect(campaign.steps.map((s) => s.kind)).toEqual([
      "announce",
      "preview_drop",
      "playlist_pitch",
      "email_blast",
      "ad_spend",
    ]);
    expect(campaign.steps.map((s) => s.kind)).toEqual([...RELEASE_CAMPAIGN_TEMPLATE]);
    // Every step starts "planned" with a deterministic id and no scheduledAt.
    for (const step of campaign.steps) {
      expect(step.status).toBe("planned");
      expect(step.id).toBe(`campaign-foundation-stones__${step.kind}`);
      expect(step.scheduledAt).toBeUndefined();
    }
  });

  it("is deterministic + idempotent on id; budget defaults to 0", () => {
    const a = planReleaseCampaign("rel-x");
    const b = planReleaseCampaign("rel-x");
    expect(a).toEqual(b);
    expect(a.budgetCents).toBe(0);
    expect(campaignIdFor("rel-x")).toBe("campaign-rel-x");
    expect(campaignIdFor("rel-x", "custom")).toBe("custom");
  });

  it("honours a custom campaign id", () => {
    const campaign = planReleaseCampaign("rel-y", { campaignId: "promo-2026" });
    expect(campaign.id).toBe("promo-2026");
    expect(campaign.steps[0].id).toBe("promo-2026__announce");
  });
});

describe("generateCampaignCopy (P2B07 deterministic on-brand copy)", () => {
  it("is deterministic per (release, kind)", () => {
    for (const kind of RELEASE_CAMPAIGN_TEMPLATE) {
      expect(generateCampaignCopy(RELEASE, kind)).toBe(generateCampaignCopy(RELEASE, kind));
    }
  });

  it("mentions the release title in every kind", () => {
    for (const kind of RELEASE_CAMPAIGN_TEMPLATE) {
      expect(generateCampaignCopy(RELEASE, kind)).toContain("Foundation Stones");
    }
  });

  it("carries the AI-disclosure on outward copy", () => {
    for (const kind of RELEASE_CAMPAIGN_TEMPLATE) {
      expect(generateCampaignCopy(RELEASE, kind)).toContain(AI_DISCLOSURE);
    }
  });

  it("is on-brand: no hype-words salad, no emoji", () => {
    const announce = generateCampaignCopy(RELEASE, "announce");
    expect(announce.toLowerCase()).not.toContain("revolutionary");
    expect(announce.toLowerCase()).not.toContain("game-changing");
    // No emoji (rough check: no surrogate-pair / pictographic chars).
    expect(/\p{Extended_Pictographic}/u.test(announce)).toBe(false);
  });

  it("differs by kind (template branches are distinct)", () => {
    const copies = RELEASE_CAMPAIGN_TEMPLATE.map((k) => generateCampaignCopy(RELEASE, k));
    expect(new Set(copies).size).toBe(copies.length);
  });
});
