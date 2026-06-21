/**
 * Split + royalty engine unit tests (P2B05, F7) — PURE, no emulator.
 *
 * Proves:
 *   - splitCents distributes exactly: Σ shares === total, even when naive
 *     division would lose a cent (largest-remainder allocation),
 *   - per-payee shares respect the ownershipSplits percentages,
 *   - recoupment deducts from the recouped artist's share up to the outstanding
 *     advance, never negative, and leftover advance carries,
 *   - totalNet === totalGross - recoupmentApplied.
 */
import { describe, expect, it } from "vitest";
import { splitCents, computeRoyalties } from "../app/finance/royalty";
import type { Split } from "../app/label/index";

const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);

describe("splitCents — cent-exact allocation", () => {
  it("splits a clean 50/50 with no remainder", () => {
    const shares = splitCents(1000, [
      { payee: "A", percent: 50 },
      { payee: "B", percent: 50 },
    ]);
    expect(shares.map((s) => s.grossCents)).toEqual([500, 500]);
    expect(sum(shares.map((s) => s.grossCents))).toBe(1000);
  });

  it("ROUNDING CASE: 100¢ split three equal ways loses no cent (naive 33+33+33=99)", () => {
    const splits: Split[] = [
      { payee: "A", percent: 33.34 },
      { payee: "B", percent: 33.33 },
      { payee: "C", percent: 33.33 },
    ];
    const shares = splitCents(100, splits);
    // Naive floor(100*pct/100) would give 33+33+33 = 99 (a lost cent). Largest
    // remainder gives the extra cent to A (largest fractional remainder), so the
    // sum is EXACTLY 100.
    expect(sum(shares.map((s) => s.grossCents))).toBe(100);
    expect(shares.map((s) => s.grossCents)).toEqual([34, 33, 33]);
  });

  it("ROUNDING CASE: 10¢ split three ways gives the leftover cents to the largest remainders", () => {
    const shares = splitCents(10, [
      { payee: "A", percent: 33.34 },
      { payee: "B", percent: 33.33 },
      { payee: "C", percent: 33.33 },
    ]);
    // 10 * 33.34/100 = 3.334 -> floor 3; the others floor 3 too (sum 9). One
    // leftover cent goes to A (largest remainder). Σ === 10.
    expect(sum(shares.map((s) => s.grossCents))).toBe(10);
    expect(shares.map((s) => s.grossCents)).toEqual([4, 3, 3]);
  });

  it("ROUNDING CASE: 70/30 on an odd total stays exact", () => {
    const shares = splitCents(101, [
      { payee: "Label", percent: 70 },
      { payee: "Artist", percent: 30 },
    ]);
    // 101*0.70 = 70.7 -> 70; 101*0.30 = 30.3 -> 30; sum 100, leftover 1 -> Label
    // (0.7 > 0.3). Σ === 101.
    expect(shares.map((s) => s.grossCents)).toEqual([71, 30]);
    expect(sum(shares.map((s) => s.grossCents))).toBe(101);
  });

  it("never creates or loses cents across many odd totals", () => {
    const splits: Split[] = [
      { payee: "A", percent: 33.34 },
      { payee: "B", percent: 33.33 },
      { payee: "C", percent: 33.33 },
    ];
    for (let total = 0; total <= 333; total += 1) {
      const shares = splitCents(total, splits);
      expect(sum(shares.map((s) => s.grossCents))).toBe(total);
    }
  });

  it("rejects an empty split set, a non-100 sum, and non-integer/negative totals", () => {
    expect(() => splitCents(100, [])).toThrow(/no ownership splits/);
    expect(() => splitCents(100, [{ payee: "A", percent: 60 }])).toThrow(/sum to 100/);
    expect(() => splitCents(10.5, [{ payee: "A", percent: 100 }])).toThrow(/integer/);
    expect(() => splitCents(-1, [{ payee: "A", percent: 100 }])).toThrow(/non-negative/);
  });
});

describe("computeRoyalties — recoupment against the artist share", () => {
  const splits: Split[] = [
    { payee: "Label", percent: 70 },
    { payee: "Artist", percent: 30 },
  ];

  it("with no recoupment, every line nets to its gross and Σ reconciles", () => {
    const result = computeRoyalties(1000, splits);
    expect(result.totalGrossCents).toBe(1000);
    expect(result.recoupmentAppliedCents).toBe(0);
    expect(result.totalNetCents).toBe(1000);
    const artist = result.lines.find((l) => l.payee === "Artist");
    expect(artist?.grossCents).toBe(300);
    expect(artist?.netCents).toBe(300);
  });

  it("recoups from ONLY the artist share, up to the outstanding advance, never negative", () => {
    // Artist share = 300¢; outstanding advance = 200¢. Recoup 200, net 100.
    const result = computeRoyalties(1000, splits, {
      recoupPayee: "Artist",
      account: { artistId: "artist", advanceCents: 200, recoupedCents: 0 },
    });
    const artist = result.lines.find((l) => l.payee === "Artist");
    const label = result.lines.find((l) => l.payee === "Label");
    expect(artist?.grossCents).toBe(300);
    expect(artist?.recoupmentAppliedCents).toBe(200);
    expect(artist?.netCents).toBe(100);
    // Label is untouched by the artist's recoupment.
    expect(label?.recoupmentAppliedCents).toBe(0);
    expect(label?.netCents).toBe(700);
    // Reconciles.
    expect(result.recoupmentAppliedCents).toBe(200);
    expect(result.totalNetCents).toBe(1000 - 200);
    // Advance fully recouped, nothing carries.
    expect(result.account).toEqual({ artistId: "artist", advanceCents: 200, recoupedCents: 200 });
  });

  it("never recoups more than the artist share; leftover advance CARRIES", () => {
    // Artist share = 300¢; outstanding advance = 1000¢. Recoup only 300, net 0,
    // 700¢ advance carries.
    const result = computeRoyalties(1000, splits, {
      recoupPayee: "Artist",
      account: { artistId: "artist", advanceCents: 1000, recoupedCents: 0 },
    });
    const artist = result.lines.find((l) => l.payee === "Artist");
    expect(artist?.recoupmentAppliedCents).toBe(300);
    expect(artist?.netCents).toBe(0);
    // recoupedCents grew by exactly the artist share; advance unchanged -> 700 carries.
    expect(result.account).toEqual({ artistId: "artist", advanceCents: 1000, recoupedCents: 300 });
    expect(result.account!.advanceCents - result.account!.recoupedCents).toBe(700);
  });

  it("a fully-recouped account recoups nothing further (net === gross)", () => {
    const result = computeRoyalties(1000, splits, {
      recoupPayee: "Artist",
      account: { artistId: "artist", advanceCents: 500, recoupedCents: 500 },
    });
    const artist = result.lines.find((l) => l.payee === "Artist");
    expect(artist?.recoupmentAppliedCents).toBe(0);
    expect(artist?.netCents).toBe(300);
    expect(result.totalNetCents).toBe(1000);
  });
});
