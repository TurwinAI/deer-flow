/**
 * Sync catalog + licensing (P2B06, F9) — EMULATOR-only. Guarded so plain
 * `pnpm test` skips it; run via `pnpm test:emulator`.
 *
 * Proves:
 *   - the request → clear → issue flow advances a license through its lifecycle,
 *   - clearance REFUSES when the master (sync_catalog entry) or the composition
 *     (work) is missing,
 *   - issue_sync_license driven through the ASSEMBLED agent + the P2B04
 *     ApprovalGate is BLOCKED until approved: no license is issued, a pending
 *     approval + a "blocked-pending-approval" audit entry are written,
 *   - after approve(), the SAME call issues the license with the placeholder
 *     licenseText and status "issued".
 *
 * A ScriptedModel (mock LLM, no network) drives the agent — no live LLM, no live
 * PRO/MLC call (FakeProRegistrar), nothing external.
 */
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../harness/persistence/firestore";
import { buildLabelAgent } from "../app/agent/leadAgent";
import { registerWork } from "../app/publishing/works";
import {
  addToSyncCatalog,
  requestSyncLicense,
  clearSyncLicense,
  issueSyncLicense,
  getSyncLicense,
  SYNC_LICENSE_PLACEHOLDER,
} from "../app/publishing/sync";
import {
  FirestoreApprovalsStore,
  FirestoreAuditStore,
  approve,
} from "../harness/orchestration";
import type { ChatModelLike } from "../harness/runtime";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;
const VALID_ISRC = "USRC12600001";
const WORK_ID = "work-foundation";

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

/** A scripted run that asks the agent to issue a (cleared) sync license. */
function issueScript(licenseId: string): AIMessage[] {
  return [
    new AIMessage({
      content: "",
      tool_calls: [
        { name: "issue_sync_license", id: "call-issue", args: { licenseId } },
      ],
    }),
    new AIMessage({ content: "Done handling the sync license." }),
  ];
}

async function seedClearedLicense(licenseId: string): Promise<void> {
  await registerWork({ id: WORK_ID, title: "Foundation Stones", linkedIsrcs: [VALID_ISRC] });
  await addToSyncCatalog({ recordingId: VALID_ISRC, workId: WORK_ID, title: "Foundation Stones" });
  await requestSyncLicense({
    id: licenseId,
    recordingId: VALID_ISRC,
    workId: WORK_ID,
    licensee: "Acme Films",
    mediaType: "film",
    territory: "worldwide",
    termMonths: 24,
    feeCents: 500000,
  });
  await clearSyncLicense(licenseId);
}

describe.skipIf(RUN)("sync catalog + licensing (emulator)", () => {
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "playreggaemusic-dev";
  });

  afterEach(async () => {
    const db = getDb();
    for (const coll of [
      "works",
      "work_splits",
      "sync_catalog",
      "sync_licenses",
      "pending_approvals",
      "audit_log",
    ]) {
      const snap = await db.collection(coll).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  it("request → clear → issue advances the license lifecycle", async () => {
    await seedClearedLicense("lic-1");
    let license = await getSyncLicense("lic-1");
    expect(license?.status).toBe("cleared");
    // Direct issue (store-level) stamps the placeholder + status issued.
    license = await issueSyncLicense("lic-1");
    expect(license.status).toBe("issued");
    expect(license.licenseText).toBe(SYNC_LICENSE_PLACEHOLDER);
    expect(license.issuedAt).toBeDefined();
  });

  it("clearance REFUSES when the master (sync_catalog) is missing", async () => {
    await registerWork({ id: WORK_ID, title: "Foundation Stones", linkedIsrcs: [VALID_ISRC] });
    // No addToSyncCatalog → master not clearable.
    await requestSyncLicense({
      id: "lic-nomaster",
      recordingId: VALID_ISRC,
      workId: WORK_ID,
      licensee: "Acme",
      mediaType: "tv",
      territory: "US",
      termMonths: 12,
      feeCents: 1000,
    });
    await expect(clearSyncLicense("lic-nomaster")).rejects.toThrow(/Master not clearable/);
  });

  it("clearance REFUSES when the composition (work) is missing", async () => {
    await addToSyncCatalog({ recordingId: VALID_ISRC, workId: "ghost-work", title: "X" });
    await requestSyncLicense({
      id: "lic-nowork",
      recordingId: VALID_ISRC,
      workId: "ghost-work",
      licensee: "Acme",
      mediaType: "game",
      territory: "worldwide",
      termMonths: 6,
      feeCents: 2000,
    });
    await expect(clearSyncLicense("lic-nowork")).rejects.toThrow(/Composition not clearable/);
  });

  it("issue_sync_license via the agent is BLOCKED until approved, then issues with placeholder", async () => {
    await seedClearedLicense("lic-gated");

    const approvalsStore = new FirestoreApprovalsStore();
    const auditStore = new FirestoreAuditStore();
    const runCtx = { runId: "run-sync", threadId: "thread-sync" };

    // First run: the gate blocks the consequential issue_sync_license.
    const blockedAgent = buildLabelAgent({
      model: new ScriptedModel(issueScript("lic-gated")),
      approval: { ...runCtx, approvalsStore, auditStore },
    });
    expect(blockedAgent.tools.map((t) => t.name)).toContain("issue_sync_license");

    const messages: BaseMessage[] = [
      new SystemMessage(blockedAgent.systemPrompt),
      new HumanMessage("Issue the cleared sync license lic-gated."),
    ];
    const blockedResult = await blockedAgent.graph.invoke({ messages });

    // The tool call returned the structured approval-required message.
    const blockedTool = blockedResult.messages.find(
      (m) => m.getType() === "tool" && String(m.content).includes("approvalRequired"),
    );
    expect(blockedTool).toBeDefined();
    expect(String(blockedTool?.content)).toMatch(/issue_sync_license/);

    // NO license was issued — still "cleared".
    const stillCleared = await getSyncLicense("lic-gated");
    expect(stillCleared?.status).toBe("cleared");
    expect(stillCleared?.licenseText).toBeUndefined();

    // A pending approval + a blocked audit entry exist.
    const pending = await approvalsStore.listPending();
    const pendingIssue = pending.find((p) => p.tool === "issue_sync_license");
    expect(pendingIssue).toBeDefined();
    const audit = await auditStore.list("thread-sync");
    expect(
      audit.some(
        (a) => a.tool === "issue_sync_license" && a.decision === "blocked-pending-approval",
      ),
    ).toBe(true);

    // Human approves the SAME (tool, args) request.
    await approve(pendingIssue!.approvalId, approvalsStore);

    // Second run: the identical call now executes — the license issues.
    const approvedAgent = buildLabelAgent({
      model: new ScriptedModel(issueScript("lic-gated")),
      approval: { ...runCtx, approvalsStore, auditStore },
    });
    const approvedResult = await approvedAgent.graph.invoke({
      messages: [
        new SystemMessage(approvedAgent.systemPrompt),
        new HumanMessage("Issue the cleared sync license lic-gated."),
      ],
    });
    const issuedTool = approvedResult.messages.find(
      (m) => m.getType() === "tool" && String(m.content).includes("Issued sync license"),
    );
    expect(issuedTool).toBeDefined();

    const issued = await getSyncLicense("lic-gated");
    expect(issued?.status).toBe("issued");
    expect(issued?.licenseText).toBe(SYNC_LICENSE_PLACEHOLDER);
    expect(issued?.issuedAt).toBeDefined();

    // The executed call is now in the audit trail too.
    const audit2 = await auditStore.list("thread-sync");
    expect(
      audit2.some((a) => a.tool === "issue_sync_license" && a.decision === "executed"),
    ).toBe(true);
  });
});
