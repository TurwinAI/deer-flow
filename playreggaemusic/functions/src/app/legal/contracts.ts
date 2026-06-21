/**
 * Artist agreements (P2B09, F10 Legal/Contracts).
 *
 * An `ArtistAgreement` is the per-artist contract record: term, royalty rate, an
 * ownership note, and — load-bearing for AI-disclosure compliance — an explicit
 * `consent.aiGenerationConsent` flag with a signed timestamp. Stored admin-only
 * in `artist_agreements/{artistId}` (firestore.rules denies ALL client access;
 * the admin SDK bypasses rules). Contracts carry sensitive commercial terms and
 * personal consent, so they must NEVER be publicly readable.
 *
 * The binding legal WORDING of an agreement is owner-supplied and legally
 * reviewed before go-live; this module models only the STRUCTURED record (rates,
 * term, consent, status) — it does not invent binding contract terms.
 *
 * Lifecycle: `registerAgreement` writes a "draft"; `activateAgreement` flips it
 * to "active" (the status the compliance gate requires alongside consent).
 *
 * Application layer: MAY import harness/* (getDb).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";

const ARTIST_AGREEMENTS = "artist_agreements";

/** Lifecycle of an artist agreement. */
export type AgreementStatus = "draft" | "active";

/**
 * The consent block: an explicit, timestamped record that the artist consents to
 * AI generation of their repertoire. `aiGenerationConsent` MUST be true and the
 * agreement MUST be "active" for a release to pass the AI-disclosure compliance
 * gate. `signedAt` is null until the consent is signed.
 */
export interface AgreementConsent {
  aiGenerationConsent: boolean;
  /** ISO-8601 timestamp the consent was signed, or null if unsigned. */
  signedAt: string | null;
}

/**
 * A per-artist agreement. SENSITIVE — stored admin-only in
 * `artist_agreements/{artistId}`. The document id IS the artistId (one current
 * agreement per artist, set-with-id so writes are idempotent).
 */
export interface ArtistAgreement {
  artistId: string;
  /** Contract term length in whole months. */
  termMonths: number;
  /** Artist royalty rate as a percentage (0..100). */
  royaltyRatePct: number;
  /** Free-text note on ownership of masters/compositions (not binding wording). */
  ownershipNote: string;
  consent: AgreementConsent;
  status: AgreementStatus;
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

/** The fields a caller supplies to register an agreement. */
export interface RegisterAgreementInput {
  artistId: string;
  termMonths: number;
  royaltyRatePct: number;
  ownershipNote: string;
  /** Whether the artist consents to AI generation (defaults false). */
  aiGenerationConsent?: boolean;
  /** ISO-8601 timestamp the consent was signed (defaults null). */
  signedAt?: string | null;
}

/**
 * Register (create/overwrite) an artist agreement in the DRAFT state. Validates
 * the term + royalty rate; invalid input throws and nothing is persisted. The
 * consent is captured as supplied (default: not consented, unsigned).
 * Idempotent (set-with-id keyed by artistId).
 */
export async function registerAgreement(
  input: RegisterAgreementInput,
  store?: Firestore,
): Promise<ArtistAgreement> {
  if (input.artistId.trim() === "") {
    throw new Error("artistId must be non-empty.");
  }
  if (!Number.isInteger(input.termMonths) || input.termMonths <= 0) {
    throw new Error("termMonths must be a positive integer.");
  }
  if (!Number.isFinite(input.royaltyRatePct) || input.royaltyRatePct < 0 || input.royaltyRatePct > 100) {
    throw new Error("royaltyRatePct must be between 0 and 100.");
  }
  const agreement: ArtistAgreement = {
    artistId: input.artistId,
    termMonths: input.termMonths,
    royaltyRatePct: input.royaltyRatePct,
    ownershipNote: input.ownershipNote,
    consent: {
      aiGenerationConsent: input.aiGenerationConsent ?? false,
      signedAt: input.signedAt ?? null,
    },
    status: "draft",
  };
  await db(store)
    .collection(ARTIST_AGREEMENTS)
    .doc(agreement.artistId)
    .set({ ...agreement, consent: { ...agreement.consent } });
  return agreement;
}

/** Read an artist's agreement (admin SDK). Returns null if absent. */
export async function getAgreement(
  artistId: string,
  store?: Firestore,
): Promise<ArtistAgreement | null> {
  const snap = await db(store).collection(ARTIST_AGREEMENTS).doc(artistId).get();
  return snap.exists ? (snap.data() as ArtistAgreement) : null;
}

/**
 * Activate an artist agreement (status "active"). Throws if the agreement does
 * not exist. Merges so other fields (consent/rates/term) are untouched. Returns
 * the updated agreement.
 */
export async function activateAgreement(
  artistId: string,
  store?: Firestore,
): Promise<ArtistAgreement> {
  const ref = db(store).collection(ARTIST_AGREEMENTS).doc(artistId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`Unknown artist agreement: ${artistId}`);
  }
  await ref.set({ status: "active" }, { merge: true });
  const updated = await ref.get();
  return updated.data() as ArtistAgreement;
}
