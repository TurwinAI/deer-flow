/**
 * Music-industry identifier validators + ownership-split validation (P2B01).
 *
 * Pure, dependency-free functions (no Firestore, no network) so they are
 * exhaustively unit-testable without an emulator. Used by the label store,
 * agent tools, and admin callables to REJECT malformed identifiers/splits
 * before any write.
 *
 * Identifiers:
 *   - ISRC  (recording)    — ISO 3901:  CC-XXX-YY-NNNNN (12 alphanumeric).
 *   - UPC-A (release)      — 12 digits, GS1 mod-10 check digit.
 *   - EAN/GTIN-13 (release)— 13 digits, GS1 mod-10 check digit.
 *   - ISWC  (composition)  — ISO 15707: T-NNNNNNNNN-C (T + 9 digits + check).
 *
 * Application layer: this module imports nothing from harness/* or app/*.
 */
import type { Split } from "./index";

// ---------------------------------------------------------------------------
// ISRC — International Standard Recording Code (ISO 3901)
// ---------------------------------------------------------------------------

/**
 * Normalize an ISRC to its canonical 12-character form: strip hyphens/spaces
 * and uppercase. Does NOT validate — call {@link isValidISRC} for that.
 */
export function normalizeISRC(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Validate an ISRC. Format `CCXXXYYNNNNN` (12 chars), accepted with or without
 * hyphens (e.g. `US-RC1-24-00001`):
 *   - CC     : 2-letter country code (A–Z),
 *   - XXX    : 3-char alphanumeric registrant (A–Z, 0–9),
 *   - YY     : 2-digit year of reference,
 *   - NNNNN  : 5-digit designation code.
 */
export function isValidISRC(value: string): boolean {
  const s = normalizeISRC(value);
  return /^[A-Z]{2}[A-Z0-9]{3}[0-9]{2}[0-9]{5}$/.test(s);
}

// ---------------------------------------------------------------------------
// UPC-A / EAN(GTIN)-13 — release barcode (GS1 mod-10 check digit)
// ---------------------------------------------------------------------------

/** Strip hyphens/spaces from a barcode. Does NOT validate. */
export function normalizeUPC(value: string): string {
  return value.replace(/[\s-]/g, "");
}

/**
 * GS1 mod-10 check-digit verification for a 12- or 13-digit numeric string.
 * Weighting runs from the rightmost data digit: the check digit is the last
 * digit; immediately to its left the weight is 3, then 1, alternating. The
 * weighted sum of all digits (data + check) must be a multiple of 10.
 */
function gs1CheckDigitValid(digits: string): boolean {
  let sum = 0;
  // Walk right-to-left. The rightmost digit (the check digit) gets weight 1,
  // the next gets 3, alternating — equivalent to the GS1 standard where the
  // weighting is anchored at the check digit.
  for (let i = 0; i < digits.length; i += 1) {
    const digit = digits.charCodeAt(digits.length - 1 - i) - 48;
    const weight = i % 2 === 0 ? 1 : 3;
    sum += digit * weight;
  }
  return sum % 10 === 0;
}

/**
 * Validate a release barcode: 12-digit UPC-A or 13-digit EAN/GTIN-13, each with
 * a valid GS1 mod-10 check digit. Accepts hyphen/space separators.
 */
export function isValidUPC(value: string): boolean {
  const s = normalizeUPC(value);
  if (!/^[0-9]{12}$/.test(s) && !/^[0-9]{13}$/.test(s)) {
    return false;
  }
  return gs1CheckDigitValid(s);
}

// ---------------------------------------------------------------------------
// ISWC — International Standard Musical Work Code (ISO 15707)
// ---------------------------------------------------------------------------

/** Normalize an ISWC: strip spaces/hyphens, uppercase the leading T. */
export function normalizeISWC(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Validate an ISWC. Format `T-NNNNNNNNN-C` (the letter T, 9 digits, then a
 * single check digit), accepted with or without hyphens.
 *
 * Check digit (ISO 15707): a weighted mod-10 sum of the 9 work digits with
 * weights 1..9 (left to right), plus a constant 1, taken mod 10, then the
 * complement to 10:  `check = (10 - ((1 + Σ d_i·i) mod 10)) mod 10`.
 */
export function isValidISWC(value: string): boolean {
  const s = normalizeISWC(value);
  if (!/^T[0-9]{10}$/.test(s)) {
    return false;
  }
  const workDigits = s.slice(1, 10);
  const check = Number(s[10]);
  let sum = 1;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(workDigits[i]) * (i + 1);
  }
  const expected = (10 - (sum % 10)) % 10;
  return check === expected;
}

// ---------------------------------------------------------------------------
// Ownership splits
// ---------------------------------------------------------------------------

/** Result of validating a set of ownership splits. */
export interface SplitValidationResult {
  splits: Split[];
}

/**
 * Validate ownership splits. Rules:
 *   - each `percent` is `0 < p <= 100` (no zero, no negatives, no >100),
 *   - each `payee` is a non-empty string,
 *   - an EMPTY array is valid (splits unset / no-op),
 *   - a NON-EMPTY set must sum to exactly 100.
 *
 * Floating-point sums are compared with a tiny epsilon so e.g. 33.33 + 33.33 +
 * 33.34 = 100 is accepted. Throws an `Error` with a clear message on failure.
 */
export function validateSplits(splits: Split[]): SplitValidationResult {
  if (splits.length === 0) {
    return { splits: [] };
  }
  let total = 0;
  for (const split of splits) {
    if (typeof split.payee !== "string" || split.payee.trim() === "") {
      throw new Error("Each ownership split must have a non-empty payee.");
    }
    if (!Number.isFinite(split.percent)) {
      throw new Error(`Split percent for ${split.payee} must be a finite number.`);
    }
    if (split.percent <= 0) {
      throw new Error(`Split percent for ${split.payee} must be greater than 0.`);
    }
    if (split.percent > 100) {
      throw new Error(`Split percent for ${split.payee} must not exceed 100.`);
    }
    total += split.percent;
  }
  if (Math.abs(total - 100) > 1e-9) {
    throw new Error(`Ownership splits must sum to 100 (got ${total}).`);
  }
  return { splits };
}
