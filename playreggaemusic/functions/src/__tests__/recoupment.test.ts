/**
 * Recoupment math unit tests (P2B05, F7) — PURE, no emulator.
 *
 * Proves computeRecoupment recoups up to the outstanding balance, never
 * negative, leftover carries, and the remaining (net) is exact.
 */
import { describe, expect, it } from "vitest";
import { computeRecoupment, outstandingCents } from "../app/finance/recoupment";

describe("recoupment math", () => {
  it("outstanding is advance - recouped, clamped at 0", () => {
    expect(outstandingCents({ artistId: "a", advanceCents: 500, recoupedCents: 200 })).toBe(300);
    expect(outstandingCents({ artistId: "a", advanceCents: 500, recoupedCents: 500 })).toBe(0);
    // Over-recouped (shouldn't happen) still clamps.
    expect(outstandingCents({ artistId: "a", advanceCents: 500, recoupedCents: 700 })).toBe(0);
  });

  it("recoups min(available, outstanding); remaining is the net", () => {
    const r = computeRecoupment({ artistId: "a", advanceCents: 200, recoupedCents: 0 }, 300);
    expect(r.recoupedCents).toBe(200);
    expect(r.remainingCents).toBe(100);
    expect(r.account.recoupedCents).toBe(200);
  });

  it("never recoups more than available; leftover advance carries", () => {
    const r = computeRecoupment({ artistId: "a", advanceCents: 1000, recoupedCents: 0 }, 300);
    expect(r.recoupedCents).toBe(300);
    expect(r.remainingCents).toBe(0);
    expect(r.account.recoupedCents).toBe(300);
    // 700 carries.
    expect(outstandingCents(r.account)).toBe(700);
  });

  it("a zero/negative available recoups nothing", () => {
    const r0 = computeRecoupment({ artistId: "a", advanceCents: 1000, recoupedCents: 0 }, 0);
    expect(r0.recoupedCents).toBe(0);
    expect(r0.remainingCents).toBe(0);
    const rNeg = computeRecoupment({ artistId: "a", advanceCents: 1000, recoupedCents: 0 }, -50);
    expect(rNeg.recoupedCents).toBe(0);
    expect(rNeg.remainingCents).toBe(0);
  });

  it("a fully-recouped account recoups nothing further", () => {
    const r = computeRecoupment({ artistId: "a", advanceCents: 500, recoupedCents: 500 }, 1000);
    expect(r.recoupedCents).toBe(0);
    expect(r.remainingCents).toBe(1000);
  });
});
