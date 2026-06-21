/**
 * Campaign scheduling (P2B07, F5).
 *
 * Schedules a planned campaign's steps through the GENERIC P2B04 `Scheduler`
 * (FakeScheduler in tests). Each step becomes a `scheduled_runs` record whose
 * prompt instructs the autonomous agent to perform that step at the step's time;
 * the steps are stamped with `scheduledAt` + status "scheduled" and the campaign
 * advances to "scheduled". Scheduling performs NO outward marketing effect — the
 * consequential outward steps still run only through the ApprovalGate / approved
 * admin callables when they actually fire.
 *
 * The scheduler is INJECTED so the gate runs with a FakeScheduler and never
 * provisions live infra. Step times are deterministic: each step is offset by a
 * fixed cadence (in days) from a base time, so the same campaign + base yields
 * the same schedule.
 *
 * Application layer: MAY import harness/* (the Scheduler types) and app/*.
 */
import type { Scheduler, RunSpec } from "../../harness/orchestration";
import {
  getCampaign,
  saveCampaign,
  type Campaign,
  type CampaignStep,
} from "./campaign";
import type { Firestore } from "firebase-admin/firestore";

/** Default cadence (whole days) between consecutive campaign steps. */
export const DEFAULT_STEP_CADENCE_DAYS = 1;

/** Options for {@link scheduleCampaign}. */
export interface ScheduleCampaignOptions {
  /**
   * ISO-8601 base time the FIRST step fires; subsequent steps are offset by the
   * cadence. Defaults to the release campaign's first slot one cadence out from
   * the supplied base. REQUIRED to be supplied for determinism in tests.
   */
  baseTime: string;
  /** Days between consecutive steps. Defaults to {@link DEFAULT_STEP_CADENCE_DAYS}. */
  cadenceDays?: number;
  /** Hard turn cap for each scheduled autonomous run (bounded autonomy). */
  maxTurns?: number;
  /** Optional Firestore override (tests pass the emulator db). */
  store?: Firestore;
}

/** A step paired with the scheduled-run id the scheduler returned. */
export interface ScheduledStep {
  stepId: string;
  scheduledAt: string;
  scheduledId: string;
}

/** Result of scheduling a campaign: the updated campaign + scheduled steps. */
export interface ScheduleCampaignResult {
  campaign: Campaign;
  scheduledSteps: ScheduledStep[];
}

/** Add `days` whole days to an ISO time, returning a new ISO string. */
function addDays(isoTime: string, days: number): string {
  const ms = Date.parse(isoTime);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid base time for scheduling: ${isoTime}`);
  }
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Build the autonomous-run prompt that fires a single campaign step. */
function stepPrompt(campaign: Campaign, step: CampaignStep): string {
  return (
    `Execute campaign ${campaign.id} step "${step.kind}" for release ` +
    `${campaign.releaseId}. Consequential outward actions require human approval.`
  );
}

/**
 * Schedule every step of a (planned) campaign through the injected scheduler.
 * Each step is scheduled `cadenceDays` apart starting at `baseTime`, stamped
 * with `scheduledAt` + status "scheduled"; the campaign advances to "scheduled"
 * and is persisted. Throws if the campaign is unknown. Deterministic given the
 * base time + cadence. Performs NO outward marketing effect.
 */
export async function scheduleCampaign(
  campaignId: string,
  scheduler: Scheduler,
  options: ScheduleCampaignOptions,
): Promise<ScheduleCampaignResult> {
  const campaign = await getCampaign(campaignId, options.store);
  if (!campaign) {
    throw new Error(`Unknown campaign: ${campaignId}`);
  }

  const cadence = options.cadenceDays ?? DEFAULT_STEP_CADENCE_DAYS;
  const maxTurns = options.maxTurns ?? 4;
  const scheduledSteps: ScheduledStep[] = [];

  const steps: CampaignStep[] = [];
  for (let i = 0; i < campaign.steps.length; i += 1) {
    const step = campaign.steps[i];
    const scheduledAt = addDays(options.baseTime, i * cadence);
    const runSpec: RunSpec = {
      threadId: `${campaign.id}__${step.kind}`,
      prompt: stepPrompt(campaign, step),
      maxTurns,
    };
    const scheduledId = await scheduler.schedule(runSpec, scheduledAt);
    steps.push({ ...step, scheduledAt, status: "scheduled" });
    scheduledSteps.push({ stepId: step.id, scheduledAt, scheduledId });
  }

  const updated: Campaign = { ...campaign, status: "scheduled", steps };
  const saved = await saveCampaign(updated, options.store);
  return { campaign: saved, scheduledSteps };
}
