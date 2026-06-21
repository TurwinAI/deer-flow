/**
 * Agent audit log unit gate (P2B04, F12) — OFFLINE, no emulator.
 *
 * Uses an in-memory AuditStore to assert recordAuditEntry persists entries and
 * listAuditEntries returns them in chronological order.
 */
import { describe, expect, it } from "vitest";
import {
  recordAuditEntry,
  listAuditEntries,
  summariseArgs,
  type AuditEntry,
  type AuditStore,
} from "../harness/orchestration/audit";

class MemoryAuditStore implements AuditStore {
  public readonly entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push({ ...entry });
  }
  async list(threadId: string): Promise<AuditEntry[]> {
    return this.entries
      .filter((e) => e.threadId === threadId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}

function entry(over: Partial<AuditEntry>): AuditEntry {
  return {
    runId: "run-1",
    threadId: "thread-1",
    tool: "echo",
    argsSummary: "{}",
    decision: "executed",
    timestamp: "2026-06-21T00:00:00.000Z",
    ...over,
  };
}

describe("agent audit log (P2B04)", () => {
  it("records entries and lists them in chronological order", async () => {
    const store = new MemoryAuditStore();
    await recordAuditEntry(entry({ tool: "second", timestamp: "2026-06-21T00:00:02.000Z" }), store);
    await recordAuditEntry(entry({ tool: "first", timestamp: "2026-06-21T00:00:01.000Z" }), store);
    await recordAuditEntry(entry({ tool: "third", timestamp: "2026-06-21T00:00:03.000Z" }), store);

    const listed = await listAuditEntries("thread-1", store);
    expect(listed.map((e) => e.tool)).toEqual(["first", "second", "third"]);
  });

  it("scopes the listing to the requested thread", async () => {
    const store = new MemoryAuditStore();
    await recordAuditEntry(entry({ threadId: "A", tool: "a" }), store);
    await recordAuditEntry(entry({ threadId: "B", tool: "b" }), store);
    const onlyA = await listAuditEntries("A", store);
    expect(onlyA.map((e) => e.tool)).toEqual(["a"]);
  });

  it("records both executed and blocked decisions", async () => {
    const store = new MemoryAuditStore();
    await recordAuditEntry(entry({ decision: "executed", timestamp: "2026-06-21T00:00:01.000Z" }), store);
    await recordAuditEntry(
      entry({ decision: "blocked-pending-approval", timestamp: "2026-06-21T00:00:02.000Z" }),
      store,
    );
    const listed = await listAuditEntries("thread-1", store);
    expect(listed.map((e) => e.decision)).toEqual(["executed", "blocked-pending-approval"]);
  });

  it("summariseArgs truncates long args and is log-safe", () => {
    expect(summariseArgs({ a: 1 })).toBe('{"a":1}');
    expect(summariseArgs(undefined)).toBe("");
    const long = summariseArgs({ blob: "x".repeat(1000) });
    expect(long.length).toBeLessThanOrEqual(501);
    expect(long.endsWith("…")).toBe(true);
  });
});
