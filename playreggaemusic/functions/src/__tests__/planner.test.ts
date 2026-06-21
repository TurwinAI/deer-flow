/**
 * Planner + bounded-loop unit gate (P2B04, F12) — OFFLINE, no emulator.
 *
 * Asserts the PlanState create/update/complete behaviour, the MAX_PLAN_STEPS
 * cap, and — critically — that the run loop is BOUNDED by maxTurns: a model that
 * never stops calling tools cannot loop forever; the graph trips
 * GraphRecursionError once the maxTurns-derived recursionLimit is exceeded.
 */
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import {
  PlanState,
  MAX_PLAN_STEPS,
  buildWritePlanTool,
} from "../harness/orchestration/planner";
import { buildLeadAgentGraph, runBounded, type ChatModelLike } from "../harness/runtime";
import { getBuiltinTools } from "../harness/tools";

describe("PlanState (P2B04 planner)", () => {
  it("creates, updates, and completes steps in order", () => {
    const plan = new PlanState();
    plan.createStep("s1", "Prepare release metadata");
    plan.createStep("s2", "Schedule distribution");
    expect(plan.steps.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(plan.steps[0].status).toBe("pending");

    plan.updateStep("s1", "Prepare + validate release metadata");
    expect(plan.steps[0].text).toBe("Prepare + validate release metadata");

    plan.setStatus("s1", "in_progress");
    expect(plan.steps[0].status).toBe("in_progress");

    plan.completeStep("s1");
    expect(plan.steps[0].status).toBe("done");
    expect(plan.isComplete).toBe(false);

    plan.completeStep("s2");
    expect(plan.isComplete).toBe(true);
  });

  it("rejects duplicate ids and unknown steps", () => {
    const plan = new PlanState();
    plan.createStep("s1", "one");
    expect(() => plan.createStep("s1", "again")).toThrow(/duplicate/i);
    expect(() => plan.updateStep("nope", "x")).toThrow(/unknown/i);
    expect(() => plan.completeStep("nope")).toThrow(/unknown/i);
  });

  it("bounds the plan at MAX_PLAN_STEPS", () => {
    const plan = new PlanState();
    for (let i = 0; i < MAX_PLAN_STEPS; i += 1) {
      plan.createStep(`s${i}`, `step ${i}`);
    }
    expect(plan.steps).toHaveLength(MAX_PLAN_STEPS);
    expect(() => plan.createStep("overflow", "too many")).toThrow(/full/i);
  });

  it("write_plan tool drives the same state", async () => {
    const plan = new PlanState();
    const tool = buildWritePlanTool(plan);
    await tool.invoke({ action: "create", id: "a", text: "do a thing" });
    await tool.invoke({ action: "complete", id: "a" });
    expect(plan.steps).toEqual([{ id: "a", text: "do a thing", status: "done" }]);
  });
});

/** A model that ALWAYS asks to call a tool — would loop forever if unbounded. */
class NeverStopsModel implements ChatModelLike {
  bindTools() {
    return this;
  }
  async invoke(): Promise<AIMessage> {
    return new AIMessage({
      content: "",
      tool_calls: [{ name: "echo", args: { text: "again" }, id: `call-${Math.random()}` }],
    });
  }
}

/** Calls echo once, then answers — finishes well within the bound. */
class EchoOnceModel implements ChatModelLike {
  private i = 0;
  bindTools() {
    return this;
  }
  async invoke(): Promise<AIMessage> {
    this.i += 1;
    return this.i === 1
      ? new AIMessage({
          content: "",
          tool_calls: [{ name: "echo", args: { text: "hi" }, id: "c1" }],
        })
      : new AIMessage({ content: "done" });
  }
}

describe("bounded run loop (P2B04 — constitution §13)", () => {
  it("trips a recursion error rather than looping unbounded past maxTurns", async () => {
    const graph = buildLeadAgentGraph({ model: new NeverStopsModel(), tools: getBuiltinTools() });
    // maxTurns = 3 → the loop cannot exceed; an always-tool-calling model trips
    // the recursion limit instead of running forever.
    await expect(
      runBounded(graph, [new HumanMessage("go")], 3),
    ).rejects.toThrow();
  });

  it("a run that finishes within the bound returns normally", async () => {
    // A model that calls echo once then answers — well within maxTurns.
    const model = new EchoOnceModel();
    const graph = buildLeadAgentGraph({ model, tools: getBuiltinTools() });
    const messages = await runBounded(graph, [new HumanMessage("go")], 8);
    expect(String(messages.at(-1)?.content)).toBe("done");
  });
});
