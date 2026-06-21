/**
 * Agent distribution tools (P2B03, F4).
 *
 * The agent can PREPARE and SCHEDULE distribution but CANNOT perform the
 * consequential deliver-to-DSP itself: that requires human approval
 * (`approved: true`), which only an admin supplies via `adminDeliverRelease`.
 * So these tools deliberately stop at scheduling / building+validating the ERN
 * preview — they never call the distributor.
 *
 *   - schedule_release:     record an intent to distribute at a given time.
 *   - request_distribution: build + validate the DDEX ERN for a release and
 *     report readiness, WITHOUT delivering (the human approval gate is the only
 *     path to an actual delivery).
 *
 * Application layer: imports the harness tool types + zod (allowed direction).
 */
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { getArtist, getRelease, listTracksByRelease } from "../label/store";
import { buildErnMessage, validateErn } from "./ddex";
import { scheduleRelease } from "./release";

const scheduleReleaseSchema = z.object({
  releaseId: z.string().describe("id of the release to schedule for distribution"),
  scheduledAt: z
    .string()
    .describe("ISO-8601 date/time the release should be delivered to DSPs, e.g. '2026-07-04T00:00:00Z'"),
});

const requestDistributionSchema = z.object({
  releaseId: z.string().describe("id of the release to prepare a DDEX delivery package for"),
});

export const scheduleReleaseTool = new DynamicStructuredTool({
  name: "schedule_release",
  description:
    "Schedule a release for DSP distribution at a given time. Records the intent " +
    "(status 'scheduled'); does NOT deliver — delivery to DSPs is a consequential " +
    "action that requires human approval.",
  schema: scheduleReleaseSchema,
  func: async (input: z.infer<typeof scheduleReleaseSchema>): Promise<string> => {
    const record = await scheduleRelease(input.releaseId, input.scheduledAt);
    return `Scheduled release ${record.releaseId} for distribution at ${record.scheduledAt} (status ${record.status}).`;
  },
});

export const requestDistributionTool = new DynamicStructuredTool({
  name: "request_distribution",
  description:
    "Prepare a release for distribution: build and validate its DDEX ERN package " +
    "and report whether it is ready to deliver. Does NOT deliver — delivering to " +
    "DSPs requires explicit human approval. Reports any missing/invalid ISRC/UPC " +
    "so they can be fixed before approval.",
  schema: requestDistributionSchema,
  func: async (input: z.infer<typeof requestDistributionSchema>): Promise<string> => {
    const release = await getRelease(input.releaseId);
    if (!release) {
      return `Unknown release: ${input.releaseId}.`;
    }
    const tracks = await listTracksByRelease(input.releaseId);
    const artist = await getArtist(release.artistId);
    const artistName = artist?.name ?? release.artistId;
    try {
      const ernXml = buildErnMessage(release, tracks, { artistName });
      const validation = validateErn(ernXml);
      if (!validation.ok) {
        return `Release ${input.releaseId} ERN failed validation: ${validation.problems.join("; ")}. Not ready to deliver.`;
      }
      return (
        `Release ${input.releaseId} is READY to deliver: built a valid DDEX ERN ` +
        `(${tracks.length} recording(s), UPC ${release.upc}). Delivery requires human approval.`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return `Release ${input.releaseId} is NOT ready to deliver: ${message}`;
    }
  },
});

/** The distribution tools the lead agent uses (no consequential deliver). */
export function getDistributionTools(): StructuredToolInterface[] {
  return [scheduleReleaseTool, requestDistributionTool];
}
