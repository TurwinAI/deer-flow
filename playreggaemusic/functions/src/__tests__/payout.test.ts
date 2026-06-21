/**
 * Payout safety unit test (P2B05, F7) — OFFLINE, no emulator.
 *
 * Proves there is NO live payment rail reachable from the finance code:
 *   - the payout module never imports a payment SDK / fetch / http client,
 *   - the only "execute" path is the documented stub, whose note says no money
 *     moved,
 *   - PAYOUT_STUB_NOTE explicitly states no money is moved.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PAYOUT_STUB_NOTE } from "../app/finance/payout";

const FINANCE_DIR = resolve(__dirname, "..", "app", "finance");

function read(file: string): string {
  return readFileSync(resolve(FINANCE_DIR, file), "utf8");
}

describe("payout has no live payment rail", () => {
  it("the stub note states no money is moved", () => {
    expect(PAYOUT_STUB_NOTE).toMatch(/no money was moved/i);
  });

  it("payout.ts imports no payment SDK / network client", () => {
    const src = read("payout.ts");
    // No fetch, no http(s), no stripe/paypal/wise/polar payout client, no axios.
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/require\(["']https?["']\)/);
    expect(src).not.toMatch(/from\s+["']node:https?["']/);
    expect(src).not.toMatch(/stripe|paypal|wise|payout-rail|axios/i);
  });

  it("tools.ts initiate_payout reaches only the stub (no live transfer)", () => {
    const src = read("tools.ts");
    expect(src).toMatch(/executePayoutStub/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/stripe|paypal|wise|axios/i);
  });
});
