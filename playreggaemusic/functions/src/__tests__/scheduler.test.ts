/**
 * Scheduler adapter unit gate (P2B04, F12) — OFFLINE, no emulator, no infra.
 *
 * - FakeScheduler.schedule writes a scheduled_runs record (in-memory store).
 * - CloudScheduler (real-impl stub) THROWS and is never wired to live infra.
 * - startAutonomousRun loads the spec by id and hands it to an injected executor
 *   (no live model). Proves the entry-point shape a real scheduler would call.
 */
import { describe, expect, it } from "vitest";
import {
  FakeScheduler,
  CloudScheduler,
  startAutonomousRun,
  type RunSpec,
  type ScheduledRunRecord,
  type ScheduledRunsStore,
} from "../harness/orchestration/scheduler";

class MemoryScheduledRunsStore implements ScheduledRunsStore {
  public readonly records: ScheduledRunRecord[] = [];
  async put(record: ScheduledRunRecord): Promise<ScheduledRunRecord> {
    this.records.push({ ...record });
    return record;
  }
  async list(): Promise<ScheduledRunRecord[]> {
    return [...this.records];
  }
}

const SPEC: RunSpec = {
  threadId: "nightly-anr",
  prompt: "Review the catalog and propose the next release.",
  maxTurns: 8,
};

describe("scheduler adapter (P2B04)", () => {
  it("FakeScheduler.schedule writes a scheduled_runs record", async () => {
    const store = new MemoryScheduledRunsStore();
    const scheduler = new FakeScheduler(store);
    const id = await scheduler.schedule(SPEC, "2026-07-01T03:00:00Z");
    expect(id).toMatch(/^fake-schedule-/);
    expect(store.records).toHaveLength(1);
    expect(store.records[0]).toMatchObject({
      scheduledId: id,
      threadId: "nightly-anr",
      maxTurns: 8,
      when: "2026-07-01T03:00:00Z",
    });
  });

  it("CloudScheduler (real impl) THROWS — never provisions live infra in tests", async () => {
    const unconfigured = new CloudScheduler();
    await expect(unconfigured.schedule(SPEC, "2026-07-01T03:00:00Z")).rejects.toThrow(
      /requires project\/location\/topic/i,
    );
    const configured = new CloudScheduler({
      project: "p",
      location: "us-central1",
      topic: "runs",
    });
    await expect(configured.schedule(SPEC, "2026-07-01T03:00:00Z")).rejects.toThrow(
      /not implemented/i,
    );
  });

  it("startAutonomousRun loads the spec and invokes the injected executor", async () => {
    const store = new MemoryScheduledRunsStore();
    const scheduler = new FakeScheduler(store);
    const id = await scheduler.schedule(SPEC, "2026-07-01T03:00:00Z");

    const seen: RunSpec[] = [];
    await startAutonomousRun(id, async (spec) => {
      seen.push(spec);
    }, store);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ threadId: "nightly-anr", prompt: SPEC.prompt, maxTurns: 8 });
  });

  it("startAutonomousRun throws on an unknown scheduled id", async () => {
    const store = new MemoryScheduledRunsStore();
    await expect(
      startAutonomousRun("nope", async () => undefined, store),
    ).rejects.toThrow(/unknown scheduled run/i);
  });
});
