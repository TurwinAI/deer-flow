/**
 * Scheduler adapter (P2B04, F12) — GENERIC autonomous-run scheduling.
 *
 * An autonomous label runs the agent on a schedule (e.g. nightly A&R/marketing
 * sweeps). Scheduling is an INJECTABLE interface so every gate runs offline:
 *   - `FakeScheduler` (tests) records the schedule into `scheduled_runs` and
 *     never provisions infra,
 *   - `CloudScheduler` is a real-impl STUB that requires config and THROWS until
 *     an operator wires Cloud Scheduler / Pub/Sub at handoff. It is NEVER
 *     constructed or invoked in tests.
 *
 * A scheduled run is described by a `RunSpec` (prompt + thread + maxTurns) and a
 * `when` (ISO time or a cron-style string). Scheduling writes a `scheduled_runs`
 * Firestore record (admin SDK). The ENTRY POINT a real scheduler/PubSub target
 * would call is `startAutonomousRun`, which is supplied a run executor so no
 * live model/infra is needed to test the shape.
 *
 * harness↛app firewall: imports ONLY harness persistence. Never imports app/*.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../persistence/firestore";

const SCHEDULED_RUNS = "scheduled_runs";

/** What to run when the schedule fires. */
export interface RunSpec {
  /** Thread the autonomous run belongs to. */
  threadId: string;
  /** The instruction the agent starts from. */
  prompt: string;
  /** Hard turn cap for the run (bounded autonomy). */
  maxTurns: number;
}

/** A persisted scheduled-run record. */
export interface ScheduledRunRecord {
  scheduledId: string;
  threadId: string;
  prompt: string;
  maxTurns: number;
  /** ISO time or cron-style expression the run should fire. */
  when: string;
  createdAt: string;
}

/** The narrow store the scheduler writes through. Injectable. */
export interface ScheduledRunsStore {
  put(record: ScheduledRunRecord): Promise<ScheduledRunRecord>;
  list(): Promise<ScheduledRunRecord[]>;
}

/** Firestore-backed scheduled-runs store (admin SDK), keyed by scheduledId. */
export class FirestoreScheduledRunsStore implements ScheduledRunsStore {
  constructor(private readonly db: Firestore = getDb()) {}

  async put(record: ScheduledRunRecord): Promise<ScheduledRunRecord> {
    await this.db.collection(SCHEDULED_RUNS).doc(record.scheduledId).set({ ...record });
    return record;
  }

  async list(): Promise<ScheduledRunRecord[]> {
    const snap = await this.db.collection(SCHEDULED_RUNS).get();
    return snap.docs.map((d) => d.data() as ScheduledRunRecord);
  }
}

/** The scheduling capability. Returns the scheduled id. */
export interface Scheduler {
  schedule(runSpec: RunSpec, when: string): Promise<string>;
}

let fakeCounter = 0;

/**
 * Test scheduler. Persists a `scheduled_runs` record and returns a synthetic
 * scheduled id. Provisions NOTHING. Used by every gate so no live infra runs.
 */
export class FakeScheduler implements Scheduler {
  constructor(private readonly store: ScheduledRunsStore = new FirestoreScheduledRunsStore()) {}

  async schedule(runSpec: RunSpec, when: string): Promise<string> {
    fakeCounter += 1;
    const scheduledId = `fake-schedule-${fakeCounter}`;
    await this.store.put({
      scheduledId,
      threadId: runSpec.threadId,
      prompt: runSpec.prompt,
      maxTurns: runSpec.maxTurns,
      when,
      createdAt: new Date().toISOString(),
    });
    return scheduledId;
  }
}

/** Config the real Cloud Scheduler stub needs (operator-supplied at handoff). */
export interface CloudSchedulerConfig {
  /** GCP project the scheduler job lives in. */
  project?: string;
  /** Region/location of the scheduler job. */
  location?: string;
  /** Pub/Sub topic the job publishes to (drives `startAutonomousRun`). */
  topic?: string;
}

/**
 * Real-impl STUB. Constructing it is harmless; `schedule()` THROWS until an
 * operator provisions Cloud Scheduler + Pub/Sub and supplies config at handoff
 * (manifest §9 approval gate). NEVER constructed or invoked by any test.
 */
export class CloudScheduler implements Scheduler {
  constructor(private readonly config: CloudSchedulerConfig = {}) {}

  async schedule(runSpec: RunSpec, when: string): Promise<string> {
    if (!this.config.project || !this.config.location || !this.config.topic) {
      throw new Error(
        "CloudScheduler requires project/location/topic (operator-supplied at handoff). " +
          "No live scheduler is provisioned in this build.",
      );
    }
    // Even fully configured, live provisioning is an operator-side action that
    // is intentionally not implemented in this build. Reference the inputs so
    // the contract is explicit (and lint sees them used).
    throw new Error(
      `CloudScheduler live provisioning is not implemented in this build (handoff gate). ` +
        `Refused to schedule thread ${runSpec.threadId} at ${when}.`,
    );
  }
}

/** A run executor: starts an agent run for a spec and resolves when it ends. */
export type RunExecutor = (runSpec: RunSpec) => Promise<void>;

/**
 * The ENTRY POINT a real scheduler/Pub/Sub target invokes when a schedule fires.
 * It loads the persisted spec by scheduledId and hands it to the injected
 * executor. The executor is injected so tests drive the shape with NO live model
 * (and production wires the assembled agent). Throws if the spec is unknown.
 */
export async function startAutonomousRun(
  scheduledId: string,
  executor: RunExecutor,
  store: ScheduledRunsStore = new FirestoreScheduledRunsStore(),
): Promise<void> {
  const all = await store.list();
  const record = all.find((r) => r.scheduledId === scheduledId);
  if (!record) {
    throw new Error(`Unknown scheduled run: ${scheduledId}`);
  }
  await executor({
    threadId: record.threadId,
    prompt: record.prompt,
    maxTurns: record.maxTurns,
  });
}
