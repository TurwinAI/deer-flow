/**
 * Lead-agent assembly (B06) — OFFLINE unit gate. No emulator, no network.
 * Verifies the app-layer assembly wires harness builtins + label tools +
 * create_checkout, and assembles the prompt from persona + skills + memory.
 */
import { describe, expect, it } from "vitest";
import type { AIMessage } from "@langchain/core/messages";
import { buildLabelAgent, buildLabelSystemPrompt } from "../app/agent/leadAgent";
import { FakePolarClient } from "../app/polar/client";
import type { ChatModelLike } from "../harness/runtime";
import type { SkillRecord } from "../harness/skills";
import type { MemoryFact } from "../harness/memory";

class NoopModel implements ChatModelLike {
  bindTools() {
    return this;
  }
  async invoke(): Promise<AIMessage> {
    throw new Error("not invoked in this unit test");
  }
}

describe("buildLabelAgent (B06 assembly)", () => {
  it("wires builtins + label tools + create_checkout when a client is supplied", () => {
    const agent = buildLabelAgent({ model: new NoopModel(), polarClient: new FakePolarClient() });
    const names = agent.tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "echo",
        "create_artist",
        "create_release",
        "create_track",
        "create_product",
        "list_orders",
        "create_checkout",
      ]),
    );
  });

  it("omits create_checkout when no Polar client is supplied", () => {
    const agent = buildLabelAgent({ model: new NoopModel() });
    expect(agent.tools.map((t) => t.name)).not.toContain("create_checkout");
  });

  it("assembles prompt from persona + skills + memory", () => {
    const skills: SkillRecord[] = [
      {
        name: "release-planner",
        description: "Plan and schedule releases",
        enabled: true,
        category: "public",
        path: "/skills/public/release-planner/SKILL.md",
        body: "",
      },
    ];
    const facts: MemoryFact[] = [
      {
        id: "f1",
        content: "Flagship artist is Roots Untold",
        category: "knowledge",
        confidence: 1,
        createdAt: "2026-06-20T00:00:00.000Z",
      },
    ];
    const prompt = buildLabelSystemPrompt(skills, facts);
    expect(prompt).toMatch(/autonomous label manager/i);
    expect(prompt).toContain("/release-planner");
    expect(prompt).toContain("Roots Untold");
    expect(prompt).toContain("<memory>");
  });

  it("FakePolarClient records calls and returns a sandbox URL (no network)", async () => {
    const client = new FakePolarClient();
    const result = await client.createCheckout({ productId: "polar_prod_x" });
    expect(result.checkoutUrl).toContain("polar.sh");
    expect(client.calls[0].productId).toBe("polar_prod_x");
  });
});
