/**
 * Persistence emulator tests (B03). These run only under the Firestore
 * emulator: `pnpm test:emulator`. Plain `pnpm test` skips them so the offline
 * unit gate stays green.
 */
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { Checkpoint, CheckpointMetadata } from "@langchain/langgraph-checkpoint";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import { FirestoreCheckpointSaver } from "../harness/persistence/checkpointer";
import {
  createThread,
  getThread,
  listThreads,
  updateThreadTitle,
  appendMessageSummary,
} from "../harness/persistence/threadStore";
import { buildLeadAgentGraph, type ChatModelLike } from "../harness/runtime";
import { getBuiltinTools } from "../harness/tools";
import {
  buildMemoryBlock,
  getFacts,
  saveFact,
  type MemoryFact,
} from "../harness/memory";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

/** Scripted model: returns queued AIMessages in order (no network). */
class ScriptedModel implements ChatModelLike {
  private i = 0;
  constructor(private readonly responses: AIMessage[]) {}
  bindTools() {
    return this;
  }
  async invoke(): Promise<AIMessage> {
    const next = this.responses[this.i];
    this.i += 1;
    return next;
  }
}

function makeCheckpoint(id: string): Checkpoint {
  return {
    v: 1,
    id,
    ts: new Date().toISOString(),
    channel_values: { messages: ["hello irie"] },
    channel_versions: {},
    versions_seen: {},
    pending_sends: [],
  };
}

const META: CheckpointMetadata = {
  source: "loop",
  step: 1,
  writes: null,
  parents: {},
};

describe.skipIf(RUN)("persistence (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    // Clear engine collections between tests to keep them independent.
    const db = getDb();
    for (const coll of ["checkpoints", "checkpoint_writes", "threads"]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("checkpointer round-trip: put then getTuple returns matching id and channel_values", async () => {
    const saver = new FirestoreCheckpointSaver();
    const config = { configurable: { thread_id: "cp-1", checkpoint_ns: "" } };
    const checkpoint = makeCheckpoint("0001");

    const returned = await saver.put(config, checkpoint, META);
    expect(returned.configurable?.checkpoint_id).toBe("0001");

    const tuple = await saver.getTuple({
      configurable: { thread_id: "cp-1", checkpoint_ns: "", checkpoint_id: "0001" },
    });
    expect(tuple).toBeDefined();
    expect(tuple?.checkpoint.id).toBe("0001");
    expect(tuple?.checkpoint.channel_values).toEqual({ messages: ["hello irie"] });

    // Latest lookup (no checkpoint_id) returns the same checkpoint.
    const latest = await saver.getTuple({ configurable: { thread_id: "cp-1" } });
    expect(latest?.checkpoint.id).toBe("0001");
  });

  it("integration: lead-agent graph with FirestoreCheckpointSaver persists messages", async () => {
    const model = new ScriptedModel([new AIMessage({ content: "irie done" })]);
    const saver = new FirestoreCheckpointSaver();
    const graph = buildLeadAgentGraph({
      model,
      tools: getBuiltinTools(),
      checkpointer: saver,
    });

    await graph.invoke(
      { messages: [new HumanMessage("hello")] },
      { configurable: { thread_id: "t1" } },
    );

    const tuple = await saver.getTuple({ configurable: { thread_id: "t1" } });
    expect(tuple).toBeDefined();
    const values = tuple?.checkpoint.channel_values as { messages?: unknown[] };
    expect(Array.isArray(values.messages)).toBe(true);
    const contents = (values.messages ?? []).map((m) =>
      String((m as { content?: unknown }).content),
    );
    expect(contents).toContain("hello");
    expect(contents).toContain("irie done");
  });

  it("thread store CRUD round-trip", async () => {
    await createThread("th-1", { title: "First" });
    let record = await getThread("th-1");
    expect(record?.threadId).toBe("th-1");
    expect(record?.title).toBe("First");

    await updateThreadTitle("th-1", "Renamed");
    await appendMessageSummary("th-1", "user said hi");
    record = await getThread("th-1");
    expect(record?.title).toBe("Renamed");
    expect(record?.messageSummary).toContain("user said hi");

    const all = await listThreads();
    expect(all.map((t) => t.threadId)).toContain("th-1");
  });

  it("memory: saveFact then getFacts returns it; buildMemoryBlock includes content", async () => {
    const fact: MemoryFact = {
      id: "f-1",
      content: "owner prefers roots reggae",
      category: "preference",
      confidence: 1,
      createdAt: new Date().toISOString(),
    };
    await saveFact("user-1", fact);
    const facts = await getFacts("user-1");
    expect(facts.map((f) => f.id)).toContain("f-1");

    const block = buildMemoryBlock(facts);
    expect(block).toContain("owner prefers roots reggae");
    expect(block.startsWith("<memory>")).toBe(true);

    // cleanup
    const db = getDb();
    await db.collection("memory").doc("user-1").collection("facts").doc("f-1").delete();
  });
});
