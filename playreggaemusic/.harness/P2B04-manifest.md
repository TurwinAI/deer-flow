# P2B04 BUILD manifest — F12 Autonomy orchestration

> Role: BUILD. Constitution §2 (manifest before motion). Builder ≠ verifier ≠ approver.

## Objective
Implement F12: agent audit log, generic ApprovalGate, bounded planner, scheduler adapter, wired into the app lead agent + admin callables + firestore.rules. Get ALL gates green.

## Inputs / authority
- Files only under `playreggaemusic/`. No commit/push. No live infra.
- harness↛app firewall: new harness/orchestration/* MUST NOT import app/*. Consequential tool NAMES are passed in as plain strings/params from app.

## Batches (build → verify → attest)
- B1: harness/orchestration/audit.ts (+ audit store) — recordAuditEntry, listAuditEntries.
- B2: harness/orchestration/approvalGate.ts — generic gate (consequential set + injected stores), approve/listPendingApprovals; wrapTools shim that buildLeadAgentGraph opts into via optional param (default off).
- B3: harness/orchestration/planner.ts — write_plan tool + bounded plan state.
- B4: harness/orchestration/scheduler.ts — Scheduler iface + FakeScheduler + CloudScheduler stub (throws) + scheduled_runs writer + autonomous-run entry point shape.
- B5: wire into app/agent/leadAgent.ts (gate active, consequential = distribution deliver + reserved payout/marketing-spend names); admin callables adminListPendingApprovals/adminApprove/adminListAudit.
- B6: firestore.rules — audit_log, pending_approvals, scheduled_runs → if false.
- B7: tests (approvalGate emulator + unit, audit, planner unit, scheduler, rules emulator) + regression.

## Verification criteria (gates, capture exit codes)
functions: typecheck=0 lint=0 test=0 test:emulator=0 build=0 boundary green.
web: typecheck=0 lint=0 test=0 build=0 (untouched).

## Failure modes
- Default graph behaviour changes → regression breaks. Mitigate: consequentialTools param defaults off.
- harness imports app → boundary red. Mitigate: pass names as strings; stores injected.
- Firestore undefined fields rejected → prune.
- Real scheduler invoked in tests → CloudScheduler throws + never constructed in tests.

## Recovery
If a gate stays red after 3 genuine attempts → STOP + report. No fake/skip-as-pass.
