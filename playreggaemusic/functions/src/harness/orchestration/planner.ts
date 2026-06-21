/**
 * Planner (P2B04, F12) — a bounded plan/todo capability for the agent.
 *
 * The agent maintains a small plan: an ordered list of steps, each with a
 * status. It updates the plan via the `write_plan` tool as it works. This is a
 * THIN, in-memory state module — the durable run loop stays bounded by the
 * harness `maxTurns` config (the graph's recursion limit), so the planner adds
 * structure WITHOUT removing the hard turn cap (constitution §13, bounded
 * autonomy).
 *
 * GENERIC: lives in the harness; no app imports. The `write_plan` tool mutates a
 * `PlanState` instance the caller owns and (optionally) surfaces to the operator.
 */
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

/** Status of a single plan step. */
export type StepStatus = "pending" | "in_progress" | "done";

/** One step in the agent's plan. */
export interface PlanStep {
  id: string;
  text: string;
  status: StepStatus;
}

/** Maximum steps a plan may hold — bounds the plan itself. */
export const MAX_PLAN_STEPS = 50;

/**
 * In-memory plan state. Mutated by the planner tool / methods. Kept tiny and
 * fully unit-testable: create, update text, set status, complete.
 */
export class PlanState {
  private readonly stepsById = new Map<string, PlanStep>();
  private readonly order: string[] = [];

  /** Current steps in insertion order. */
  get steps(): PlanStep[] {
    return this.order.map((id) => {
      const step = this.stepsById.get(id);
      // order + stepsById are kept in lockstep, so this is always present.
      if (!step) {
        throw new Error(`Plan invariant violated: missing step ${id}`);
      }
      return { ...step };
    });
  }

  /** Create a step. Throws past MAX_PLAN_STEPS or on duplicate id. */
  createStep(id: string, text: string): PlanStep {
    if (this.order.length >= MAX_PLAN_STEPS) {
      throw new Error(`Plan is full (max ${MAX_PLAN_STEPS} steps).`);
    }
    if (this.stepsById.has(id)) {
      throw new Error(`Duplicate plan step id: ${id}`);
    }
    const step: PlanStep = { id, text, status: "pending" };
    this.stepsById.set(id, step);
    this.order.push(id);
    return { ...step };
  }

  /** Update a step's text. Throws if unknown. */
  updateStep(id: string, text: string): PlanStep {
    const step = this.require(id);
    step.text = text;
    return { ...step };
  }

  /** Set a step's status. Throws if unknown. */
  setStatus(id: string, status: StepStatus): PlanStep {
    const step = this.require(id);
    step.status = status;
    return { ...step };
  }

  /** Mark a step done. Convenience over setStatus. */
  completeStep(id: string): PlanStep {
    return this.setStatus(id, "done");
  }

  /** Whether every step is done (vacuously true for an empty plan). */
  get isComplete(): boolean {
    return this.steps.every((s) => s.status === "done");
  }

  private require(id: string): PlanStep {
    const step = this.stepsById.get(id);
    if (!step) {
      throw new Error(`Unknown plan step: ${id}`);
    }
    return step;
  }
}

const writePlanSchema = z.object({
  action: z
    .enum(["create", "update", "complete"])
    .describe("create a new step, update a step's text, or mark a step complete"),
  id: z.string().min(1).describe("the step id to operate on"),
  text: z
    .string()
    .optional()
    .describe("the step text (required for create/update)"),
});

/**
 * Build a `write_plan` tool bound to a `PlanState` instance. The agent calls it
 * to create/update/complete steps as it works. Returns a short status string.
 */
export function buildWritePlanTool(state: PlanState): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: "write_plan",
    description:
      "Maintain your working plan: create a step, update a step's text, or mark " +
      "a step complete. Use it to track multi-step work. Each call takes " +
      "{ action: 'create'|'update'|'complete', id, text? }.",
    schema: writePlanSchema,
    func: async (input: z.infer<typeof writePlanSchema>): Promise<string> => {
      switch (input.action) {
        case "create": {
          if (input.text === undefined) {
            return "create requires 'text'.";
          }
          const step = state.createStep(input.id, input.text);
          return `Created step ${step.id}: ${step.text} (${step.status}).`;
        }
        case "update": {
          if (input.text === undefined) {
            return "update requires 'text'.";
          }
          const step = state.updateStep(input.id, input.text);
          return `Updated step ${step.id}: ${step.text}.`;
        }
        case "complete": {
          const step = state.completeStep(input.id);
          return `Completed step ${step.id}.`;
        }
      }
    },
  });
}
