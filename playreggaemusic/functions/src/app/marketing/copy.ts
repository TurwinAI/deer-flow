/**
 * Campaign copy generation (P2B07, F5).
 *
 * Produces on-brand marketing copy for each campaign-step kind. Copy is TEMPLATED
 * + DETERMINISTIC — the same release + kind always yields the same string — so
 * the unit gate can assert exact, on-brand output with NO LLM call and NO network.
 *
 * Voice mirrors the `catalog-copywriter` skill (skills/public/catalog-copywriter):
 * rooted, warm, specific, no hype-words, and ALWAYS honest about the AI-native
 * nature of the music (the storefront's AI-generated disclosure). The disclosure
 * line is appended to outward copy (announce / preview / email / ad) so the
 * AI-generated framing is never buried.
 *
 * Application layer: imports ONLY the Release type from app/label (allowed).
 */
import type { Release } from "../label";
import type { CampaignStepKind } from "./campaign";

/** The plainly-worded AI-generated disclosure, consistent with the storefront. */
export const AI_DISCLOSURE = "This music is AI-generated.";

/** Title-case helper for a release type word ("ep" → "EP"). */
function releaseTypeWord(type: Release["type"]): string {
  if (type === "ep") return "EP";
  if (type === "album") return "album";
  return "single";
}

/**
 * Generate on-brand campaign copy for a release + step kind. Deterministic; no
 * LLM, no network. Outward kinds (announce/preview_drop/email_blast/ad_spend)
 * carry the AI-generated disclosure; the playlist pitch is a curator note that
 * still states it plainly. Always mentions the release title.
 */
export function generateCampaignCopy(release: Release, kind: CampaignStepKind): string {
  const title = release.title;
  const typeWord = releaseTypeWord(release.type);

  switch (kind) {
    case "announce":
      return (
        `New from PlayReggaeMusic.ai: "${title}", a roots-reggae ${typeWord} that ` +
        `builds like dusk over Kingston. Out now. ${AI_DISCLOSURE}`
      );
    case "preview_drop":
      return (
        `Hear it first — a preview clip from "${title}" is live. Press play and ` +
        `let the one-drop carry you. ${AI_DISCLOSURE}`
      );
    case "playlist_pitch":
      return (
        `For your consideration: "${title}" — warm, conscious roots reggae in the ` +
        `foundation tradition, mixed for the long listen. ${AI_DISCLOSURE}`
      );
    case "email_blast":
      return (
        `"${title}" is here. Our new ${typeWord} carries the weight of a dub plate ` +
        `and the patience reggae rewards — settle in. ${AI_DISCLOSURE}`
      );
    case "ad_spend":
      return (
        `"${title}" — new roots reggae from PlayReggaeMusic.ai. ${AI_DISCLOSURE}`
      );
    default: {
      // Exhaustiveness guard — a new kind must add a copy branch above.
      const exhaustive: never = kind;
      throw new Error(`No copy template for campaign step kind: ${String(exhaustive)}`);
    }
  }
}
