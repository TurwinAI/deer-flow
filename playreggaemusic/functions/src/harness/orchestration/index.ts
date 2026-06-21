/**
 * Orchestration barrel (P2B04, F12) — GENERIC autonomy capabilities:
 * agent audit log, the ApprovalGate, the planner, and the scheduler adapter.
 *
 * Every module here is generic: parameterised by injected stores and (for the
 * gate) a set of consequential tool NAMES supplied as plain strings. NONE of
 * them import app/* — the harness↛app firewall holds (boundary test).
 */
export {
  type AuditDecision,
  type AuditEntry,
  type AuditStore,
  FirestoreAuditStore,
  summariseArgs,
  recordAuditEntry,
  listAuditEntries,
} from "./audit";
export {
  type ApprovalStatus,
  type ApprovalRecord,
  type ApprovalsStore,
  FirestoreApprovalsStore,
  type ApprovalRequiredResult,
  type ApprovalGateDeps,
  hashArgs,
  approvalIdFor,
  wrapTools,
  approve,
  listPendingApprovals,
} from "./approvalGate";
export {
  type StepStatus,
  type PlanStep,
  MAX_PLAN_STEPS,
  PlanState,
  buildWritePlanTool,
} from "./planner";
export {
  type RunSpec,
  type ScheduledRunRecord,
  type ScheduledRunsStore,
  FirestoreScheduledRunsStore,
  type Scheduler,
  FakeScheduler,
  type CloudSchedulerConfig,
  CloudScheduler,
  type RunExecutor,
  startAutonomousRun,
} from "./scheduler";
