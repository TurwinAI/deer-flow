/**
 * Autonomy integration (B06) — the HEADLINE end-to-end gate. EMULATOR-only.
 *
 * A ScriptedModel (mock LLM, no network) drives the assembled label agent: it
 * emits a `create_release` tool call, then a `create_product` tool call, then a
 * final answer. We assert the Firestore catalog now contains the release +
 * product the agent created — proving the full path agent -> tools -> store.
 * Polar is mocked (FakePolarClient); no live LLM and no live Polar call.
 */
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import { buildLabelAgent } from "../app/agent/leadAgent";
import { FakePolarClient } from "../app/polar/client";
import { getProduct, getRelease } from "../app/label/store";
import type { ChatModelLike } from "../harness/runtime";

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

describe.skipIf(RUN)("autonomy: agent operates the label end-to-end (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of ["artists", "releases", "tracks", "products", "orders"]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("drives create_release -> create_product -> final answer; catalog persists", async () => {
    const model = new ScriptedModel([
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "create_release",
            id: "call-rel",
            args: {
              id: "auto-release",
              artistId: "roots-untold",
              title: "Autonomy EP",
              catalogNumber: "PRM-AUTO",
              type: "ep",
              releaseDate: "2026-09-01",
            },
          },
        ],
      }),
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "create_product",
            id: "call-prod",
            args: {
              id: "auto-product",
              type: "music_download",
              title: "Autonomy EP (Digital Download)",
              priceCents: 800,
              currency: "USD",
              releaseId: "auto-release",
            },
          },
        ],
      }),
      new AIMessage({ content: "Released Autonomy EP and put it on sale." }),
    ]);

    const agent = buildLabelAgent({ model, polarClient: new FakePolarClient() });

    // create_checkout is wired in alongside builtins + label tools.
    const toolNames = agent.tools.map((t) => t.name);
    expect(toolNames).toContain("create_release");
    expect(toolNames).toContain("create_product");
    expect(toolNames).toContain("create_checkout");

    const messages: BaseMessage[] = [
      new SystemMessage(agent.systemPrompt),
      new HumanMessage("Release a new EP for Roots Untold and put it on sale."),
    ];
    const result = await agent.graph.invoke({ messages });

    // The loop ran to the final answer.
    expect(String(result.messages.at(-1)?.content)).toMatch(/autonomy ep/i);

    // The agent's tool calls actually wrote to Firestore.
    const release = await getRelease("auto-release");
    expect(release?.title).toBe("Autonomy EP");
    expect(release?.aiGenerated).toBe(true);

    const product = await getProduct("auto-product");
    expect(product?.type).toBe("music_download");
    expect(product?.releaseId).toBe("auto-release");
  });

  it("system prompt carries the AI-generated + personal-license persona", () => {
    const agent = buildLabelAgent({ model: new ScriptedModel([]) });
    expect(agent.systemPrompt).toMatch(/ai-generated/i);
    expect(agent.systemPrompt).toMatch(/personal-listening/i);
  });
});
