/**
 * Marketing channel adapters (P2B07, F5) — OFFLINE unit gate.
 * No emulator, no network.
 *
 * Asserts the Fake channels record calls + return synthetic ids (no network),
 * and the Real* stubs THROW without operator-supplied creds (never reachable in
 * tests). Proves the Fakes are the only adapters that ever do anything.
 */
import { describe, expect, it } from "vitest";
import {
  FakeSocialChannel,
  FakeEmailChannel,
  FakePlaylistPitch,
  FakeAdChannel,
  RealSocialChannel,
  RealEmailChannel,
  RealPlaylistPitch,
  RealAdChannel,
} from "../app/marketing/channels";

describe("Fake marketing channels record calls (no network)", () => {
  it("FakeSocialChannel records the post + returns a synthetic id", async () => {
    const ch = new FakeSocialChannel();
    const r = await ch.post({ platform: "instagram", message: "hello" });
    expect(r.postId).toBe("fake-social-1");
    expect(r.platform).toBe("instagram");
    expect(ch.posts).toHaveLength(1);
    expect(ch.posts[0].message).toBe("hello");
  });

  it("FakeEmailChannel records the blast + returns a synthetic id", async () => {
    const ch = new FakeEmailChannel();
    const r = await ch.send({ segment: "newsletter", subject: "s", body: "b" });
    expect(r.sendId).toBe("fake-email-1");
    expect(r.recipientCount).toBe(0);
    expect(ch.blasts).toHaveLength(1);
  });

  it("FakePlaylistPitch records the pitch + returns a synthetic id", async () => {
    const ch = new FakePlaylistPitch();
    const r = await ch.pitch({ recordingId: "USRC12600001", playlist: "Roots Vibes", note: "n" });
    expect(r.pitchId).toBe("fake-pitch-1");
    expect(ch.pitches).toHaveLength(1);
  });

  it("FakeAdChannel records the spend + returns a synthetic id", async () => {
    const ch = new FakeAdChannel();
    const r = await ch.spend({ platform: "meta", budgetCents: 5000, currency: "USD", objective: "reach" });
    expect(r.adOrderId).toBe("fake-ad-1");
    expect(r.budgetCents).toBe(5000);
    expect(ch.spends).toHaveLength(1);
  });
});

describe("Real marketing channel stubs THROW without creds (never live in tests)", () => {
  it("RealSocialChannel.post throws without SOCIAL_API_TOKEN", async () => {
    await expect(new RealSocialChannel({ apiToken: "" }).post({ platform: "x", message: "m" })).rejects.toThrow(
      /SOCIAL_API_TOKEN/,
    );
  });

  it("RealEmailChannel.send throws without EMAIL_API_TOKEN", async () => {
    await expect(
      new RealEmailChannel({ apiToken: "" }).send({ segment: "s", subject: "x", body: "y" }),
    ).rejects.toThrow(/EMAIL_API_TOKEN/);
  });

  it("RealPlaylistPitch.pitch throws without PLAYLIST_API_TOKEN", async () => {
    await expect(
      new RealPlaylistPitch({ apiToken: "" }).pitch({ recordingId: "r", playlist: "p", note: "n" }),
    ).rejects.toThrow(/PLAYLIST_API_TOKEN/);
  });

  it("RealAdChannel.spend throws without ADS_API_TOKEN", async () => {
    await expect(
      new RealAdChannel({ apiToken: "" }).spend({ platform: "meta", budgetCents: 1, currency: "USD", objective: "o" }),
    ).rejects.toThrow(/ADS_API_TOKEN/);
  });

  it("even WITH a token the real stubs refuse to make a live call (owner-side)", async () => {
    await expect(
      new RealSocialChannel({ apiToken: "tok" }).post({ platform: "x", message: "m" }),
    ).rejects.toThrow(/not wired/);
  });
});
