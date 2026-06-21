/**
 * Marketing campaign plan + schedule (P2B07, F5) — EMULATOR-only. Guarded so
 * plain `pnpm test` skips it; run via `pnpm test:emulator`.
 *
 * Proves through the REAL Firestore-backed store (admin SDK):
 *   - planAndSaveCampaign writes campaigns/{id} with the template steps,
 *   - scheduleCampaign (FakeScheduler) stamps step times + status "scheduled",
 *     writes scheduled_runs records, and persists the updated campaign,
 *   - listCampaigns returns the persisted campaign.
 * No live infra/social/email/ad call.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import {
  planAndSaveCampaign,
  getCampaign,
  listCampaigns,
} from "../app/marketing/campaign";
import { scheduleCampaign } from "../app/marketing/scheduling";
import { FakeScheduler, FirestoreScheduledRunsStore } from "../harness/orchestration";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(RUN)("marketing campaign plan + schedule (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of ["campaigns", "scheduled_runs"]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("plan writes campaigns/{id} with the template steps", async () => {
    const campaign = await planAndSaveCampaign("foundation-stones", { budgetCents: 5000 });
    const stored = await getCampaign(campaign.id);
    expect(stored?.id).toBe("campaign-foundation-stones");
    expect(stored?.status).toBe("planned");
    expect(stored?.budgetCents).toBe(5000);
    expect(stored?.steps.map((s) => s.kind)).toEqual([
      "announce",
      "preview_drop",
      "playlist_pitch",
      "email_blast",
      "ad_spend",
    ]);
    expect(stored?.steps.every((s) => s.status === "planned")).toBe(true);
  });

  it("schedule (FakeScheduler) stamps step times + writes scheduled_runs", async () => {
    await planAndSaveCampaign("foundation-stones", { budgetCents: 5000 });
    const runsStore = new FirestoreScheduledRunsStore();
    const scheduler = new FakeScheduler(runsStore);

    const result = await scheduleCampaign("campaign-foundation-stones", scheduler, {
      baseTime: "2026-07-01T00:00:00.000Z",
      cadenceDays: 2,
    });

    // The campaign advanced to "scheduled" with every step scheduled.
    expect(result.campaign.status).toBe("scheduled");
    expect(result.scheduledSteps).toHaveLength(5);
    expect(result.campaign.steps.every((s) => s.status === "scheduled")).toBe(true);
    // Deterministic cadence: first step at base, last 8 days later.
    expect(result.campaign.steps[0].scheduledAt).toBe("2026-07-01T00:00:00.000Z");
    expect(result.campaign.steps[4].scheduledAt).toBe("2026-07-09T00:00:00.000Z");

    // The persisted campaign reflects the schedule.
    const stored = await getCampaign("campaign-foundation-stones");
    expect(stored?.status).toBe("scheduled");
    expect(stored?.steps[0].scheduledAt).toBe("2026-07-01T00:00:00.000Z");

    // scheduled_runs has one record per step.
    const runs = await runsStore.list();
    const forCampaign = runs.filter((r) => r.threadId.startsWith("campaign-foundation-stones__"));
    expect(forCampaign).toHaveLength(5);
  });

  it("listCampaigns returns the persisted campaign", async () => {
    await planAndSaveCampaign("rel-a");
    await planAndSaveCampaign("rel-b");
    const all = await listCampaigns();
    expect(all.map((c) => c.id).sort()).toEqual(["campaign-rel-a", "campaign-rel-b"]);
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
