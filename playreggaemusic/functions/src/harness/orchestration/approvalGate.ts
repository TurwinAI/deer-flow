/**
 * ApprovalGate (P2B04, F12) — GENERIC human-in-the-loop guardrail.
 *
 * Bounded autonomy (constitution §13): consequential tool calls (publish to a
 * DSP, spend, payout) must pass an explicit human approval before they run. The
 * gate is GENERIC: it is parameterised by
 *   (a) a SET of consequential tool NAMES (plain strings, supplied by the app),
 *   (b) an injected approvals store, and
 *   (c) an injected audit store.
 * It knows nothing about which tools those are — the WIRING lives in app/.
 *
 * Mechanism: `wrapTools` returns copies of the supplied tools whose execution is
 * intercepted. For a NON-consequential tool the wrapped tool just runs and
 * audits "executed". For a CONSEQUENTIAL tool it computes an argsHash and looks
 * for an `approved` ApprovalRecord for that (tool, argsHash):
 *   - no approved record  → BLOCK: write a pending ApprovalRecord, audit
 *     "blocked-pending-approval", and return a structured "approval required"
 *     message WITHOUT running the tool (zero side effects),
 *   - approved record     → run the tool, audit "executed".
 *
 * Admin operations `approve(approvalId)` / `listPendingApprovals()` drive the
 * out-of-band human decision.
 *
 * harness↛app firewall: imports ONLY harness persistence + @langchain/core tool
 * types + node:crypto. Never imports app/*.
 */
import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { getDb } from "../persistence/firestore";
import {
  recordAuditEntry,
  summariseArgs,
  type AuditStore,
  FirestoreAuditStore,
} from "./audit";

const PENDING_APPROVALS = "pending_approvals";

/** Status of an approval request. */
export type ApprovalStatus = "pending" | "approved" | "rejected";

/** A request for human approval of one consequential tool call. */
export interface ApprovalRecord {
  /** Stable id — deterministically derived from (tool, argsHash). */
  approvalId: string;
  /** The consequential tool the call targets. */
  tool: string;
  /** SHA-256 of the canonicalised arguments — distinguishes distinct calls. */
  argsHash: string;
  /** Short human-readable summary of the arguments. */
  argsSummary: string;
  status: ApprovalStatus;
  /** Run/thread context that requested it (for traceability). */
  runId: string;
  threadId: string;
  createdAt: string;
  /** Set when an admin approves/rejects. */
  decidedAt?: string;
}

/** The narrow store the gate needs over `pending_approvals`. Injectable. */
export interface ApprovalsStore {
  /** Fetch the record for an approval id, or null. */
  get(approvalId: string): Promise<ApprovalRecord | null>;
  /** Create-if-absent a pending record (idempotent on approvalId). */
  putPending(record: ApprovalRecord): Promise<ApprovalRecord>;
  /** Mark a record approved/rejected. Throws if it does not exist. */
  setStatus(
    approvalId: string,
    status: Exclude<ApprovalStatus, "pending">,
  ): Promise<ApprovalRecord>;
  /** List all pending records. */
  listPending(): Promise<ApprovalRecord[]>;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/** Firestore-backed approvals store (admin SDK), keyed by approvalId. */
export class FirestoreApprovalsStore implements ApprovalsStore {
  constructor(private readonly db: Firestore = getDb()) {}

  async get(approvalId: string): Promise<ApprovalRecord | null> {
    const snap = await this.db.collection(PENDING_APPROVALS).doc(approvalId).get();
    return snap.exists ? (snap.data() as ApprovalRecord) : null;
  }

  async putPending(record: ApprovalRecord): Promise<ApprovalRecord> {
    const ref = this.db.collection(PENDING_APPROVALS).doc(record.approvalId);
    const existing = await ref.get();
    if (existing.exists) {
      // Idempotent: a re-blocked identical call keeps the existing record
      // (which may already be approved — we never downgrade it).
      return existing.data() as ApprovalRecord;
    }
    await ref.set(pruneUndefined({ ...record }));
    return record;
  }

  async setStatus(
    approvalId: string,
    status: Exclude<ApprovalStatus, "pending">,
  ): Promise<ApprovalRecord> {
    const ref = this.db.collection(PENDING_APPROVALS).doc(approvalId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new Error(`Unknown approval: ${approvalId}`);
    }
    await ref.set(
      { status, decidedAt: new Date().toISOString() },
      { merge: true },
    );
    const updated = await ref.get();
    return updated.data() as ApprovalRecord;
  }

  async listPending(): Promise<ApprovalRecord[]> {
    const snap = await this.db
      .collection(PENDING_APPROVALS)
      .where("status", "==", "pending")
      .get();
    return snap.docs.map((d) => d.data() as ApprovalRecord);
  }
}

/** Canonical SHA-256 of arguments — stable across key ordering. */
export function hashArgs(args: unknown): string {
  return createHash("sha256").update(canonical(args)).digest("hex");
}

/** Deterministic JSON: object keys sorted recursively. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

/** Derive a stable approval id from (tool, argsHash). */
export function approvalIdFor(tool: string, argsHash: string): string {
  return `${tool}__${argsHash.slice(0, 32)}`;
}

/** The structured result returned (instead of running the tool) when blocked. */
export interface ApprovalRequiredResult {
  approvalRequired: true;
  tool: string;
  approvalId: string;
  message: string;
}

/** Stores + run context the gate operates with. */
export interface ApprovalGateDeps {
  /** Consequential tool names. A tool in this set is gated. */
  consequentialTools: Set<string> | readonly string[];
  approvalsStore?: ApprovalsStore;
  auditStore?: AuditStore;
  /** Run context recorded on audit + approval records. */
  runId: string;
  threadId: string;
}

/** Build a structured "approval required" message string for the agent. */
function approvalRequiredMessage(tool: string, approvalId: string): string {
  const payload: ApprovalRequiredResult = {
    approvalRequired: true,
    tool,
    approvalId,
    message:
      `Tool "${tool}" is a CONSEQUENTIAL action and requires human approval ` +
      `before it can run. A pending approval (id ${approvalId}) has been ` +
      `recorded. The action was NOT performed.`,
  };
  return JSON.stringify(payload);
}

/**
 * Wrap tools with the approval gate. Returns NEW tool instances; the originals
 * are untouched. Non-consequential tools are passed through but still audited.
 *
 * A consequential tool's wrapper, on each call:
 *   1. hash args + derive approvalId,
 *   2. if an APPROVED record exists → run the original tool, audit "executed",
 *   3. else → write a pending record, audit "blocked-pending-approval", and
 *      return the structured approval-required message (tool NOT run).
 */
export function wrapTools(
  tools: StructuredToolInterface[],
  deps: ApprovalGateDeps,
): StructuredToolInterface[] {
  const consequential =
    deps.consequentialTools instanceof Set
      ? deps.consequentialTools
      : new Set(deps.consequentialTools);
  const approvalsStore = deps.approvalsStore ?? new FirestoreApprovalsStore();
  const auditStore = deps.auditStore ?? new FirestoreAuditStore();

  return tools.map((tool) => {
    const isConsequential = consequential.has(tool.name);

    const wrappedFunc = async (input: unknown): Promise<string> => {
      const argsSummary = summariseArgs(input);

      if (!isConsequential) {
        const result = await runTool(tool, input);
        await recordAuditEntry(
          {
            runId: deps.runId,
            threadId: deps.threadId,
            tool: tool.name,
            argsSummary,
            decision: "executed",
            timestamp: new Date().toISOString(),
          },
          auditStore,
        );
        return result;
      }

      const argsHash = hashArgs(input);
      const approvalId = approvalIdFor(tool.name, argsHash);
      const existing = await approvalsStore.get(approvalId);

      if (existing?.status === "approved") {
        const result = await runTool(tool, input);
        await recordAuditEntry(
          {
            runId: deps.runId,
            threadId: deps.threadId,
            tool: tool.name,
            argsSummary,
            decision: "executed",
            timestamp: new Date().toISOString(),
          },
          auditStore,
        );
        return result;
      }

      // BLOCK: no approval. Write pending, audit, return — tool NOT run.
      await approvalsStore.putPending({
        approvalId,
        tool: tool.name,
        argsHash,
        argsSummary,
        status: "pending",
        runId: deps.runId,
        threadId: deps.threadId,
        createdAt: new Date().toISOString(),
      });
      await recordAuditEntry(
        {
          runId: deps.runId,
          threadId: deps.threadId,
          tool: tool.name,
          argsSummary,
          decision: "blocked-pending-approval",
          timestamp: new Date().toISOString(),
        },
        auditStore,
      );
      return approvalRequiredMessage(tool.name, approvalId);
    };

    return new DynamicStructuredTool({
      name: tool.name,
      description: tool.description,
      // Reuse the original schema so the model sees the same tool contract.
      schema: tool.schema,
      func: wrappedFunc,
    });
  });
}

/**
 * Invoke a tool's underlying logic and normalise the result to a string (the
 * ToolNode expects string/standard content). `invoke` runs the tool's own func.
 */
async function runTool(
  tool: StructuredToolInterface,
  input: unknown,
): Promise<string> {
  const result = await tool.invoke(input as never);
  return typeof result === "string" ? result : JSON.stringify(result);
}

/** Approve a pending approval (admin). Idempotent on an already-approved record. */
export async function approve(
  approvalId: string,
  store: ApprovalsStore = new FirestoreApprovalsStore(),
): Promise<ApprovalRecord> {
  const existing = await store.get(approvalId);
  if (!existing) {
    throw new Error(`Unknown approval: ${approvalId}`);
  }
  if (existing.status === "approved") {
    return existing;
  }
  return store.setStatus(approvalId, "approved");
}

/** List all pending approvals (admin). */
export async function listPendingApprovals(
  store: ApprovalsStore = new FirestoreApprovalsStore(),
): Promise<ApprovalRecord[]> {
  return store.listPending();
}
