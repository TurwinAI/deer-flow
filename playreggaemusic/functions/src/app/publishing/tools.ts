/**
 * Agent publishing tools (P2B06, F8/F9).
 *
 * DynamicStructuredTool wrappers so the lead agent can operate the publishing +
 * sync side of the label:
 *   - register_work / set_writer_splits      (F8 works registry + splits),
 *   - register_pro_affiliation               (F8 PRO/MLC affiliation),
 *   - add_to_sync_catalog                     (F9 advertise what's licensable),
 *   - request_sync_license / issue_sync_license (F9 license flow).
 *
 * `issue_sync_license` is the CONSEQUENTIAL, binding commitment. It is registered
 * in CONSEQUENTIAL_TOOLS (leadAgent.ts) so the generic P2B04 ApprovalGate blocks
 * it until a human approves. The tool itself just calls `issueSyncLicense`; the
 * gate is the chokepoint.
 *
 * The PRO registrar is INJECTED into `register_pro_affiliation` (FakeProRegistrar
 * in tests) so no live PRO/MLC call is ever made in a gate.
 *
 * Application layer: imports the harness tool types + zod (allowed direction).
 */
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { registerWork, setWriterSplits, type Work, type WriterSplit } from "./works";
import {
  registerProAffiliation,
  FakeProRegistrar,
  type Pro,
  type ProAffiliation,
  type ProRegistrar,
} from "./pro";
import {
  addToSyncCatalog,
  clearSyncLicense,
  issueSyncLicense,
  requestSyncLicense,
} from "./sync";

const registerWorkSchema = z.object({
  id: z.string().describe("deterministic document id for the work (composition)"),
  title: z.string().describe("work (song) title"),
  iswc: z
    .string()
    .optional()
    .describe(
      "ISWC composition identifier in T-NNNNNNNNN-C form (hyphens optional). " +
        "PUBLIC — appears in the works registry. Rejected if the check digit is invalid.",
    ),
  linkedIsrcs: z
    .array(z.string())
    .default([])
    .describe(
      "recording ISRCs that embody this composition (CC-XXX-YY-NNNNN, hyphens " +
        "optional). PUBLIC. Each is rejected if its format is invalid.",
    ),
});

const writerSplitSchema = z.object({
  payee: z.string().describe("writer name / id receiving this share"),
  percent: z.number().describe("writer share percentage; 0 < percent <= 100"),
});

const setWriterSplitsSchema = z.object({
  workId: z.string().describe("id of the work these writer splits belong to"),
  splits: z
    .array(writerSplitSchema)
    .describe(
      "writer splits; a non-empty set must sum to 100. SENSITIVE — written ONLY " +
        "to the admin-only work_splits collection, never to the public works doc.",
    ),
});

const proSchema = z.enum(["ASCAP", "BMI", "SESAC", "MLC"]);

const registerProAffiliationSchema = z.object({
  writerId: z.string().describe("id of the writer being affiliated"),
  pro: proSchema.describe("the collection body: ASCAP, BMI, SESAC, or MLC"),
  ipi: z.string().optional().describe("Interested Party Information number (optional)"),
  memberId: z.string().optional().describe("the writer's member id at the PRO/MLC (optional)"),
});

const addToSyncCatalogSchema = z.object({
  recordingId: z
    .string()
    .describe("recording ISRC to advertise for sync (CC-XXX-YY-NNNNN, hyphens optional)"),
  workId: z.string().describe("id of the composition (work) behind the recording"),
  title: z.string().describe("display title for the catalog entry"),
  available: z
    .boolean()
    .optional()
    .describe("whether the recording is currently available for sync (default true)"),
});

const requestSyncLicenseSchema = z.object({
  id: z.string().describe("deterministic document id for the sync license"),
  recordingId: z.string().describe("recording ISRC the sync covers"),
  workId: z.string().describe("id of the composition (work) behind the recording"),
  licensee: z.string().describe("the party requesting the sync license"),
  mediaType: z.string().describe("media type, e.g. 'film', 'tv', 'game', 'trailer'"),
  territory: z.string().describe("territory, e.g. 'US', 'worldwide'"),
  termMonths: z.number().int().positive().describe("license term in whole months"),
  feeCents: z.number().int().nonnegative().describe("sync fee in minor currency units (cents)"),
});

const issueSyncLicenseSchema = z.object({
  licenseId: z.string().describe("id of a CLEARED sync license to issue"),
});

const clearSyncLicenseSchema = z.object({
  licenseId: z.string().describe("id of a REQUESTED sync license to clear (master + composition)"),
});

export const registerWorkTool = new DynamicStructuredTool({
  name: "register_work",
  description:
    "Register a composition (work) in the publishing registry. Writes a PUBLIC " +
    "works doc (id, title, iswc, linkedIsrcs) — never writer splits. Rejects an " +
    "invalid ISWC or any invalid linked ISRC.",
  schema: registerWorkSchema,
  func: async (input: z.infer<typeof registerWorkSchema>): Promise<string> => {
    const work: Work = {
      id: input.id,
      title: input.title,
      iswc: input.iswc,
      linkedIsrcs: input.linkedIsrcs,
    };
    const saved = await registerWork(work);
    return `Registered work ${saved.id} (${saved.title}) with ${saved.linkedIsrcs.length} linked ISRC(s).`;
  },
});

export const setWriterSplitsTool = new DynamicStructuredTool({
  name: "set_writer_splits",
  description:
    "Set a work's SENSITIVE writer splits. A non-empty set must sum to 100. " +
    "Written ONLY to the admin-only work_splits collection (never the public " +
    "works doc). Rejects splits that do not sum to 100 or carry bad percentages.",
  schema: setWriterSplitsSchema,
  func: async (input: z.infer<typeof setWriterSplitsSchema>): Promise<string> => {
    const splits: WriterSplit[] = input.splits.map((s) => ({ payee: s.payee, percent: s.percent }));
    await setWriterSplits(input.workId, splits);
    return `Set ${splits.length} writer split(s) for work ${input.workId}.`;
  },
});

/**
 * Build the `register_pro_affiliation` tool bound to an injected registrar. The
 * registrar is injected so the gate runs with a FakeProRegistrar and never makes
 * a live PRO/MLC call. Defaults to a FakeProRegistrar so the tool is always safe.
 */
export function buildRegisterProAffiliationTool(
  registrar: ProRegistrar = new FakeProRegistrar(),
): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: "register_pro_affiliation",
    description:
      "Register a writer's PRO/MLC affiliation (ASCAP/BMI/SESAC/MLC) via the " +
      "registrar adapter, then persist it to the admin-only pro_affiliations " +
      "collection. Live PRO/MLC registration is owner-side; tests use a fake.",
    schema: registerProAffiliationSchema,
    func: async (input: z.infer<typeof registerProAffiliationSchema>): Promise<string> => {
      const affiliation: ProAffiliation = {
        writerId: input.writerId,
        pro: input.pro as Pro,
        ipi: input.ipi,
        memberId: input.memberId,
      };
      const confirmation = await registerProAffiliation(affiliation, registrar);
      return `Registered ${affiliation.writerId} with ${affiliation.pro} (confirmation ${confirmation.confirmationId}).`;
    },
  });
}

export const addToSyncCatalogTool = new DynamicStructuredTool({
  name: "add_to_sync_catalog",
  description:
    "Advertise a recording as available for sync: write a PUBLIC sync_catalog " +
    "entry (recordingId/ISRC, workId, title, available). Rejects an invalid ISRC.",
  schema: addToSyncCatalogSchema,
  func: async (input: z.infer<typeof addToSyncCatalogSchema>): Promise<string> => {
    const entry = await addToSyncCatalog({
      recordingId: input.recordingId,
      workId: input.workId,
      title: input.title,
      available: input.available,
    });
    return `Added ${entry.recordingId} (${entry.title}) to the sync catalog (available ${entry.available}).`;
  },
});

export const requestSyncLicenseTool = new DynamicStructuredTool({
  name: "request_sync_license",
  description:
    "Record an inbound sync-license REQUEST (status 'requested'). Captures the " +
    "ask; makes no commitment. Rejects an invalid ISRC / non-positive term.",
  schema: requestSyncLicenseSchema,
  func: async (input: z.infer<typeof requestSyncLicenseSchema>): Promise<string> => {
    const license = await requestSyncLicense({
      id: input.id,
      recordingId: input.recordingId,
      workId: input.workId,
      licensee: input.licensee,
      mediaType: input.mediaType,
      territory: input.territory,
      termMonths: input.termMonths,
      feeCents: input.feeCents,
    });
    return `Requested sync license ${license.id} for ${license.licensee} (status ${license.status}).`;
  },
});

export const clearSyncLicenseTool = new DynamicStructuredTool({
  name: "clear_sync_license",
  description:
    "Clear a requested sync license: verify BOTH the master (recording in the " +
    "sync catalog + available) and the composition (work exists). Advances to " +
    "'cleared'. Refuses if either half is missing. Makes no binding commitment.",
  schema: clearSyncLicenseSchema,
  func: async (input: z.infer<typeof clearSyncLicenseSchema>): Promise<string> => {
    const license = await clearSyncLicense(input.licenseId);
    return `Cleared sync license ${license.id} (status ${license.status}).`;
  },
});

export const issueSyncLicenseTool = new DynamicStructuredTool({
  name: "issue_sync_license",
  description:
    "ISSUE a CLEARED sync license — a CONSEQUENTIAL, binding commitment. Stamps " +
    "the (placeholder) license text and sets status 'issued'. This action " +
    "requires human approval before it can run.",
  schema: issueSyncLicenseSchema,
  func: async (input: z.infer<typeof issueSyncLicenseSchema>): Promise<string> => {
    const license = await issueSyncLicense(input.licenseId);
    return `Issued sync license ${license.id} (status ${license.status}, issuedAt ${license.issuedAt}).`;
  },
});

/**
 * All publishing/sync tools the lead agent uses. The PRO registrar is injected
 * (FakeProRegistrar default) so no live PRO/MLC call is ever made. `issue_sync_
 * license` is consequential and gated by the ApprovalGate (CONSEQUENTIAL_TOOLS).
 */
export function getPublishingTools(
  proRegistrar: ProRegistrar = new FakeProRegistrar(),
): StructuredToolInterface[] {
  return [
    registerWorkTool,
    setWriterSplitsTool,
    buildRegisterProAffiliationTool(proRegistrar),
    addToSyncCatalogTool,
    requestSyncLicenseTool,
    clearSyncLicenseTool,
    issueSyncLicenseTool,
  ];
}
