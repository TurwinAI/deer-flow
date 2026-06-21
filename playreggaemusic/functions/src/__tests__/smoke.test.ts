import { describe, expect, it } from "vitest";
import { HARNESS_VERSION } from "../harness";
import { gatewayInfo } from "../app";

describe("B01 functions smoke", () => {
  it("exposes a harness version", () => {
    expect(HARNESS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("gateway reports the harness version (app -> harness wiring)", () => {
    const info = gatewayInfo();
    expect(info.service).toBe("playreggaemusic-gateway");
    expect(info.harnessVersion).toBe(HARNESS_VERSION);
  });
});
