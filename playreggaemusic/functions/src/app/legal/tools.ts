/**
 * Agent legal/compliance tools (P2B09, F10).
 *
 * DynamicStructuredTool wrappers so the lead agent can operate the legal side:
 *   - register_artist_agreement   (record/overwrite an artist agreement, draft),
 *   - set_license_terms           (store OWNER-SUPPLIED binding license wording),
 *   - check_release_compliance    (run the pre-distribution compliance gate).
 *
 * All three are NON-CONSEQUENTIAL: they record contract/terms data or run a
 * read-only check. The CONSEQUENTIAL action (delivering to DSPs) lives in
 * distribution and already runs `checkReleaseCompliance` as a hard precondition,
 * so these tools cannot themselves cause an outward effect.
 *
 * Application layer: imports the harness tool types + zod (allowed direction).
 */
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { registerAgreement } from "./contracts";
import { setLicenseTerms } from "./license";
import { checkReleaseCompliance } from "./compliance";

const registerArtistAgreementSchema = z.object({
  artistId: z.string().describe("id of the artist this agreement covers"),
  termMonths: z.number().int().positive().describe("contract term length in whole months"),
  royaltyRatePct: z
    .number()
    .describe("artist royalty rate as a percentage (0..100)"),
  ownershipNote: z
    .string()
    .describe("free-text ownership note (NOT binding wording — owner-supplied terms govern)"),
  aiGenerationConsent: z
    .boolean()
    .optional()
    .describe("whether the artist consents to AI generation (default false)"),
  signedAt: z
    .string()
    .optional()
    .describe("ISO-8601 timestamp the consent was signed (optional)"),
});

const setLicenseTermsSchema = z.object({
  kind: z
    .string()
    .describe("license kind, e.g. 'personal_download'"),
  bodyText: z
    .string()
    .describe(
      "the OWNER-SUPPLIED, legally reviewed binding license wording. Setting this " +
        "marks the terms non-placeholder (isPlaceholder:false).",
    ),
});

const checkReleaseComplianceSchema = z.object({
  releaseId: z.string().describe("id of the release to check for distribution compliance"),
});

export const registerArtistAgreementTool = new DynamicStructuredTool({
  name: "register_artist_agreement",
  description:
    "Register (create/overwrite) an artist agreement in DRAFT status: term, " +
    "royalty rate, ownership note, and AI-generation consent. SENSITIVE — stored " +
    "admin-only. Activate it separately before it counts for compliance.",
  schema: registerArtistAgreementSchema,
  func: async (input: z.infer<typeof registerArtistAgreementSchema>): Promise<string> => {
    const agreement = await registerAgreement({
      artistId: input.artistId,
      termMonths: input.termMonths,
      royaltyRatePct: input.royaltyRatePct,
      ownershipNote: input.ownershipNote,
      aiGenerationConsent: input.aiGenerationConsent,
      signedAt: input.signedAt,
    });
    return `Registered ${agreement.status} agreement for artist ${agreement.artistId} (consent ${agreement.consent.aiGenerationConsent}).`;
  },
});

export const setLicenseTermsTool = new DynamicStructuredTool({
  name: "set_license_terms",
  description:
    "Store OWNER-SUPPLIED binding license wording for a kind (e.g. " +
    "'personal_download'), replacing the clearly-marked placeholder " +
    "(isPlaceholder flips to false). Use only with legally reviewed wording.",
  schema: setLicenseTermsSchema,
  func: async (input: z.infer<typeof setLicenseTermsSchema>): Promise<string> => {
    const terms = await setLicenseTerms(input.kind, input.bodyText);
    return `Set license terms for '${terms.kind}' (isPlaceholder ${terms.isPlaceholder}).`;
  },
});

export const checkReleaseComplianceTool = new DynamicStructuredTool({
  name: "check_release_compliance",
  description:
    "Run the pre-distribution compliance check for a release: AI-disclosure " +
    "(aiGenerated + provenance per track), ownership splits summing to 100, and " +
    "an ACTIVE artist agreement with AI-generation consent. Returns the verdict " +
    "and any issues as JSON. Read-only — makes no changes.",
  schema: checkReleaseComplianceSchema,
  func: async (input: z.infer<typeof checkReleaseComplianceSchema>): Promise<string> => {
    const result = await checkReleaseCompliance(input.releaseId);
    return JSON.stringify(result);
  },
});

/** All legal/compliance tools the lead agent uses. All NON-consequential. */
export function getLegalTools(): StructuredToolInterface[] {
  return [registerArtistAgreementTool, setLicenseTermsTool, checkReleaseComplianceTool];
}
