/**
 * Structured license terms (P2B09, F10 Legal).
 *
 * Phase-1/B06 shipped a hard-coded PERSONAL_LICENSE_PLACEHOLDER string. P2B09
 * replaces that with a STRUCTURED, owner-supplied record stored admin-only in
 * `license_terms/{kind}` (kind = "personal_download" etc.). Until the owner sets
 * real wording, `getLicenseTerms` returns a CLEARLY-MARKED placeholder with
 * `isPlaceholder: true`; `setLicenseTerms` stores the owner's binding wording and
 * flips `isPlaceholder: false`.
 *
 * The placeholder string is relocated here (it was in polar/entitlement.ts) so
 * the legal layer owns license wording. The binding wording itself is
 * owner-supplied + legally reviewed before go-live — this module does NOT invent
 * binding license terms; it only models the record + the placeholder default.
 *
 * Application layer: MAY import harness/* (getDb).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";

const LICENSE_TERMS = "license_terms";

/** The personal-download license kind (the one B06 entitlement uses). */
export const PERSONAL_DOWNLOAD_KIND = "personal_download";

/**
 * PLACEHOLDER personal-listening license string — NOT binding wording. The label
 * owner must supply the final, legally reviewed personal-listening license text
 * (via `setLicenseTerms`) before go-live. Relocated from polar/entitlement.ts;
 * re-exported there for backward compatibility.
 */
export const PERSONAL_LICENSE_PLACEHOLDER =
  "[PLACEHOLDER LICENSE — owner to supply binding wording before go-live] " +
  "Personal-listening license only: this AI-generated recording is licensed to " +
  "you for personal, non-commercial listening. No redistribution, public " +
  "performance, broadcast, or commercial use is granted.";

/**
 * A structured license-terms record. SENSITIVE/operational — stored admin-only in
 * `license_terms/{kind}`. `bodyText` is the user-facing license wording;
 * `isPlaceholder` is true while the wording is the un-reviewed placeholder and
 * false once the owner supplies binding terms via `setLicenseTerms`.
 */
export interface LicenseTerms {
  kind: string;
  bodyText: string;
  isPlaceholder: boolean;
  /** ISO-8601 timestamp the terms were last set (placeholder default omits it). */
  updatedAt?: string;
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/** The clearly-marked placeholder terms for a kind (isPlaceholder: true). */
function placeholderTerms(kind: string): LicenseTerms {
  return { kind, bodyText: PERSONAL_LICENSE_PLACEHOLDER, isPlaceholder: true };
}

/**
 * Read the license terms for a kind. Returns the OWNER-SET terms when present,
 * otherwise falls back to a CLEARLY-MARKED placeholder (`isPlaceholder: true`).
 * Never returns null — there are always usable (placeholder) terms.
 */
export async function getLicenseTerms(
  kind: string,
  store?: Firestore,
): Promise<LicenseTerms> {
  const snap = await db(store).collection(LICENSE_TERMS).doc(kind).get();
  if (!snap.exists) {
    return placeholderTerms(kind);
  }
  return snap.data() as LicenseTerms;
}

/**
 * Set OWNER-SUPPLIED binding license terms for a kind. Writes the supplied
 * `bodyText` with `isPlaceholder: false` (this is the operator declaring the
 * wording legally reviewed + binding). Throws on empty wording. Idempotent
 * (set-with-id keyed by kind).
 */
export async function setLicenseTerms(
  kind: string,
  bodyText: string,
  store?: Firestore,
): Promise<LicenseTerms> {
  if (kind.trim() === "") {
    throw new Error("license kind must be non-empty.");
  }
  if (bodyText.trim() === "") {
    throw new Error("license bodyText must be non-empty.");
  }
  const terms: LicenseTerms = {
    kind,
    bodyText,
    isPlaceholder: false,
    updatedAt: new Date().toISOString(),
  };
  await db(store).collection(LICENSE_TERMS).doc(kind).set(pruneUndefined({ ...terms }));
  return terms;
}
