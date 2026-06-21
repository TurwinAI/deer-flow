/**
 * Identifier + split validators (P2B01) — PURE UNIT gate. No emulator, no
 * network. Exercises ISRC / UPC(EAN) check-digit / ISWC validation and
 * ownership-split summation.
 */
import { describe, expect, it } from "vitest";
import {
  isValidISRC,
  isValidISWC,
  isValidUPC,
  normalizeISRC,
  normalizeUPC,
  validateSplits,
} from "../app/label/identifiers";
import type { Split } from "../app/label/index";

describe("isValidISRC", () => {
  it("accepts a well-formed ISRC with and without hyphens", () => {
    expect(isValidISRC("USRC17607839")).toBe(true);
    expect(isValidISRC("US-RC1-76-07839")).toBe(true);
    expect(isValidISRC("us-rc1-76-07839")).toBe(true); // case-insensitive
  });

  it("normalizes to the canonical 12-char uppercase form", () => {
    expect(normalizeISRC("us-rc1-76-07839")).toBe("USRC17607839");
  });

  it("rejects malformed ISRCs", () => {
    expect(isValidISRC("USRC1760783")).toBe(false); // too short
    expect(isValidISRC("USRC176078390")).toBe(false); // too long
    expect(isValidISRC("1SRC17607839")).toBe(false); // country must be letters
    expect(isValidISRC("USRC1A607839")).toBe(false); // year must be digits
    expect(isValidISRC("")).toBe(false);
  });
});

describe("isValidUPC", () => {
  it("accepts a valid 12-digit UPC-A (correct check digit)", () => {
    expect(isValidUPC("036000291452")).toBe(true);
    expect(isValidUPC("196633982100")).toBe(true); // seed UPC
  });

  it("accepts hyphen/space separators", () => {
    expect(isValidUPC("0-36000-29145-2")).toBe(true);
    expect(normalizeUPC("0-36000-29145-2")).toBe("036000291452");
  });

  it("accepts a valid 13-digit EAN/GTIN-13", () => {
    expect(isValidUPC("4006381333931")).toBe(true);
  });

  it("rejects a UPC with a BAD check digit", () => {
    expect(isValidUPC("036000291453")).toBe(false);
    expect(isValidUPC("4006381333930")).toBe(false);
  });

  it("rejects wrong-length or non-numeric barcodes", () => {
    expect(isValidUPC("03600029145")).toBe(false); // 11 digits
    expect(isValidUPC("03600029145200")).toBe(false); // 14 digits
    expect(isValidUPC("03600029145A")).toBe(false); // non-numeric
    expect(isValidUPC("")).toBe(false);
  });
});

describe("isValidISWC", () => {
  it("accepts a valid ISWC with and without separators", () => {
    expect(isValidISWC("T-034524680-1")).toBe(true);
    expect(isValidISWC("T0345246801")).toBe(true);
    expect(isValidISWC("t-034.524.680-1".replace(/\./g, ""))).toBe(true);
  });

  it("rejects a bad check digit", () => {
    expect(isValidISWC("T-034524680-2")).toBe(false);
  });

  it("rejects malformed ISWCs", () => {
    expect(isValidISWC("X-034524680-1")).toBe(false); // no leading T
    expect(isValidISWC("T-03452468-1")).toBe(false); // too few digits
    expect(isValidISWC("T-0345246801-1")).toBe(false); // too many digits
    expect(isValidISWC("")).toBe(false);
  });
});

describe("validateSplits", () => {
  it("accepts splits summing to exactly 100", () => {
    const splits: Split[] = [
      { payee: "Label", percent: 70 },
      { payee: "Artist", percent: 30 },
    ];
    expect(validateSplits(splits).splits).toEqual(splits);
  });

  it("accepts fractional splits summing to 100", () => {
    const splits: Split[] = [
      { payee: "A", percent: 33.33 },
      { payee: "B", percent: 33.33 },
      { payee: "C", percent: 33.34 },
    ];
    expect(() => validateSplits(splits)).not.toThrow();
  });

  it("accepts an empty array (splits unset / no-op)", () => {
    expect(validateSplits([]).splits).toEqual([]);
  });

  it("rejects splits that do not sum to 100", () => {
    expect(() =>
      validateSplits([
        { payee: "A", percent: 60 },
        { payee: "B", percent: 30 },
      ]),
    ).toThrow(/sum to 100/i);
  });

  it("rejects a negative percent", () => {
    expect(() =>
      validateSplits([
        { payee: "A", percent: 80 },
        { payee: "B", percent: -20 },
      ]),
    ).toThrow(/greater than 0/i);
  });

  it("rejects a zero percent", () => {
    expect(() =>
      validateSplits([
        { payee: "A", percent: 100 },
        { payee: "B", percent: 0 },
      ]),
    ).toThrow(/greater than 0/i);
  });

  it("rejects a percent over 100", () => {
    expect(() => validateSplits([{ payee: "A", percent: 100.5 }])).toThrow(/exceed 100/i);
  });

  it("rejects an empty payee", () => {
    expect(() => validateSplits([{ payee: "  ", percent: 100 }])).toThrow(/payee/i);
  });
});
