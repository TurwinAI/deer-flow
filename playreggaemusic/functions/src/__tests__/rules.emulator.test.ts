/**
 * Firestore security rules tests (B03). Emulator-only: guarded so plain
 * `pnpm test` (no emulator) does not run them. Run via `pnpm test:emulator`.
 *
 * Asserts:
 *   - public (unauthenticated) CAN read catalog `artists`,
 *   - public CANNOT write `artists` (admin-only),
 *   - NOBODY (anon or non-admin) can read the private `track_masters`,
 *   - NOBODY (unauthenticated client) can read engine collections
 *     `threads` / `memory` / `checkpoints`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = !process.env.FIRESTORE_EMULATOR_HOST;

// __dirname is functions/src/__tests__ at runtime; rules live at repo root.
const RULES_PATH = resolve(__dirname, "../../../firestore.rules");

describe.skipIf(RUN)("firestore.rules (emulator)", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "playreggaemusic-dev",
      firestore: { rules: readFileSync(RULES_PATH, "utf8") },
    });
    // Seed a catalog doc with rules disabled so public reads have something.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "artists", "roots-untold"), { name: "Roots Untold" });
      // Releases/tracks now carry PUBLIC identifiers (isrc/upc/credits).
      await setDoc(doc(db, "releases", "rel1"), {
        title: "Foundation Stones",
        upc: "196633982100",
        credits: [{ role: "Producer", name: "PlayReggaeMusic.ai" }],
      });
      await setDoc(doc(db, "tracks", "trk1"), {
        title: "Foundation Stones",
        isrc: "USRUM2600001",
      });
      await setDoc(doc(db, "track_masters", "trk1"), {
        trackId: "trk1",
        masterPath: "masters/foundation-stones/01.wav",
      });
      // SENSITIVE ownership splits — must NOT be publicly readable.
      await setDoc(doc(db, "rights", "rel1"), {
        releaseId: "rel1",
        ownershipSplits: [
          { payee: "PlayReggaeMusic.ai", percent: 70 },
          { payee: "Roots Untold", percent: 30 },
        ],
      });
      // PUBLIC AI-provenance disclosure — must be world-readable, admin-write.
      await setDoc(doc(db, "provenance", "trk1"), {
        trackId: "trk1",
        generator: "PlayReggaeMusic.ai",
        createdAt: "2026-07-04T00:00:00.000Z",
        disclosure: "AI-generated: produced with artificial intelligence.",
        contentSha256: "a".repeat(64),
      });
      await setDoc(doc(db, "products", "prod1"), { title: "Download" });
      await setDoc(doc(db, "orders", "o1"), { customer: "cus_test" });
      // OPERATIONAL distribution record — must NOT be client-readable/writable.
      await setDoc(doc(db, "distributions", "rel1"), {
        releaseId: "rel1",
        status: "delivered",
        deliveryId: "fake-delivery-1",
      });
      await setDoc(doc(db, "threads", "t1"), { threadId: "t1" });
      await setDoc(doc(db, "memory", "u1"), { seeded: true });
      await setDoc(doc(db, "checkpoints", "c1"), { id: "c1" });
      // P2B04 autonomy-orchestration collections — admin-only / deny client.
      await setDoc(doc(db, "audit_log", "a1"), { threadId: "t1", tool: "echo" });
      await setDoc(doc(db, "pending_approvals", "ap1"), { tool: "deliver_release", status: "pending" });
      await setDoc(doc(db, "scheduled_runs", "sr1"), { threadId: "t1", prompt: "go" });
      // P2B05 finance collections — admin-only / deny ALL client access.
      await setDoc(doc(db, "revenue_events", "rev1"), { id: "rev1", source: "polar", grossCents: 700 });
      await setDoc(doc(db, "recoupment", "roots-untold"), { artistId: "roots-untold", advanceCents: 1000, recoupedCents: 0 });
      await setDoc(doc(db, "royalty_statements", "roots-untold__2026-Q2"), { artistId: "roots-untold", netCents: 300 });
      await setDoc(doc(db, "payouts", "payout__roots-untold__2026-Q2"), { artistId: "roots-untold", amountCents: 300, status: "proposed" });
      // P2B06 publishing & sync. works + sync_catalog are PUBLIC transparency
      // artifacts; work_splits / pro_affiliations / sync_licenses are admin-only.
      await setDoc(doc(db, "works", "work1"), {
        id: "work1",
        title: "Foundation Stones",
        iswc: "T0000000010",
        linkedIsrcs: ["USRC12600001"],
      });
      await setDoc(doc(db, "sync_catalog", "USRC12600001"), {
        recordingId: "USRC12600001",
        workId: "work1",
        title: "Foundation Stones",
        available: true,
      });
      await setDoc(doc(db, "work_splits", "work1"), {
        workId: "work1",
        writerSplits: [{ payee: "Roots Untold", percent: 100 }],
      });
      await setDoc(doc(db, "pro_affiliations", "roots-untold"), {
        writerId: "roots-untold",
        pro: "ASCAP",
        memberId: "M-1",
      });
      await setDoc(doc(db, "sync_licenses", "lic1"), {
        id: "lic1",
        recordingId: "USRC12600001",
        workId: "work1",
        licensee: "Acme Films",
        status: "issued",
        feeCents: 500000,
      });
      // P2B07 marketing — campaigns + the outward sent-log are admin-only.
      await setDoc(doc(db, "campaigns", "campaign-foundation-stones"), {
        id: "campaign-foundation-stones",
        releaseId: "foundation-stones",
        status: "planned",
      });
      await setDoc(doc(db, "marketing_events", "social__fake-social-1"), {
        id: "social__fake-social-1",
        kind: "social_post",
        ref: "fake-social-1",
      });
      // P2B08 analytics & A&R — business intelligence; all admin-only.
      await setDoc(doc(db, "analytics_events", "dsp:2026-06:rel-a:streams"), {
        id: "dsp:2026-06:rel-a:streams",
        source: "dsp",
        metric: "streams",
        value: 5000,
      });
      await setDoc(doc(db, "insight_reports", "2026-06"), {
        id: "2026-06",
        period: "2026-06",
        eventCount: 1,
      });
      await setDoc(doc(db, "anr_recommendations", "2026-06__follow_up_single__rel-a"), {
        id: "2026-06__follow_up_single__rel-a",
        kind: "follow_up_single",
        releaseId: "rel-a",
        proposalOnly: true,
      });
      // P2B09 legal — artist agreements + structured license terms are admin-only.
      await setDoc(doc(db, "artist_agreements", "roots-untold"), {
        artistId: "roots-untold",
        termMonths: 24,
        royaltyRatePct: 30,
        status: "active",
        consent: { aiGenerationConsent: true, signedAt: "2026-06-01T00:00:00.000Z" },
      });
      await setDoc(doc(db, "license_terms", "personal_download"), {
        kind: "personal_download",
        bodyText: "owner wording",
        isPlaceholder: false,
      });
    });
  });

  afterAll(async () => {
    // Clear seeded docs so this suite does not pollute the shared emulator for
    // other suites (e.g. the recoupment/roots-untold account read by finance).
    await testEnv.clearFirestore();
    await testEnv.cleanup();
  });

  it("public CAN read catalog artists", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "artists", "roots-untold")));
  });

  it("public CAN read catalog tracks", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "tracks", "trk1")));
  });

  it("public CAN read catalog products", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "products", "prod1")));
  });

  it("public CAN read a release carrying PUBLIC upc/credits", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const snap = await assertSucceeds(getDoc(doc(db, "releases", "rel1")));
    expect(snap.data()?.upc).toBe("196633982100");
    expect(Array.isArray(snap.data()?.credits)).toBe(true);
  });

  it("public CAN read a track carrying a PUBLIC isrc", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const snap = await assertSucceeds(getDoc(doc(db, "tracks", "trk1")));
    expect(snap.data()?.isrc).toBe("USRUM2600001");
  });

  it("public CANNOT write catalog artists without admin", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, "artists", "evil"), { name: "hax" }));
  });

  it("anon CANNOT write any catalog collection", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, "releases", "evilrel"), { title: "hax" }));
    await assertFails(setDoc(doc(db, "tracks", "eviltrk"), { title: "hax" }));
    await assertFails(setDoc(doc(db, "products", "evilprod"), { title: "hax" }));
  });

  it("non-admin authenticated user CANNOT write catalog artists", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(setDoc(doc(db, "artists", "evil2"), { name: "hax" }));
  });

  it("non-admin authenticated user CANNOT write catalog tracks/products", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(setDoc(doc(db, "tracks", "evil3"), { title: "hax" }));
    await assertFails(setDoc(doc(db, "products", "evil4"), { title: "hax" }));
  });

  it("NOBODY (anon) can read orders", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "orders", "o1")));
  });

  it("non-admin authenticated user CANNOT read orders", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "orders", "o1")));
  });

  it("anon CANNOT read private track_masters (master path stays private)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "track_masters", "trk1")));
  });

  it("non-admin authenticated user CANNOT read private track_masters", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "track_masters", "trk1")));
  });

  it("anon CANNOT write track_masters", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, "track_masters", "evilmaster"), { masterPath: "masters/hax.wav" }),
    );
  });

  it("anon CANNOT read private rights (ownership splits stay private)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "rights", "rel1")));
  });

  it("non-admin authenticated user CANNOT read private rights", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "rights", "rel1")));
  });

  it("anon CANNOT write rights", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, "rights", "evilrights"), {
        releaseId: "evil",
        ownershipSplits: [{ payee: "hax", percent: 100 }],
      }),
    );
  });

  it("public CAN read AI-provenance (transparency artifact, public-read)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const snap = await assertSucceeds(getDoc(doc(db, "provenance", "trk1")));
    expect(snap.data()?.generator).toBe("PlayReggaeMusic.ai");
    expect(snap.data()?.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("anon CANNOT write provenance (admin-write only)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, "provenance", "evilprov"), { trackId: "evil", generator: "hax" }),
    );
  });

  it("non-admin authenticated user CANNOT write provenance", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(
      setDoc(doc(db, "provenance", "evilprov2"), { trackId: "evil", generator: "hax" }),
    );
  });

  it("anon CANNOT read operational distributions", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "distributions", "rel1")));
  });

  it("non-admin authenticated user CANNOT read distributions", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "distributions", "rel1")));
  });

  it("anon CANNOT write distributions", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, "distributions", "evildist"), { releaseId: "evil", status: "delivered" }),
    );
  });

  it("non-admin authenticated user CANNOT write distributions", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(
      setDoc(doc(db, "distributions", "evildist2"), { releaseId: "evil", status: "delivered" }),
    );
  });

  it("NOBODY can read engine threads", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "threads", "t1")));
  });

  it("NOBODY can read engine memory", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "memory", "u1")));
  });

  it("NOBODY can read engine checkpoints", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "checkpoints", "c1")));
  });

  // -- P2B04 autonomy orchestration: audit_log / pending_approvals / scheduled_runs

  it("anon CANNOT read or write audit_log", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "audit_log", "a1")));
    await assertFails(setDoc(doc(db, "audit_log", "evil"), { tool: "hax" }));
  });

  it("non-admin authenticated user CANNOT read or write audit_log", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "audit_log", "a1")));
    await assertFails(setDoc(doc(db, "audit_log", "evil2"), { tool: "hax" }));
  });

  it("anon CANNOT read or write pending_approvals", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "pending_approvals", "ap1")));
    await assertFails(setDoc(doc(db, "pending_approvals", "evil"), { status: "approved" }));
  });

  it("non-admin authenticated user CANNOT read or write pending_approvals (cannot self-approve)", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "pending_approvals", "ap1")));
    await assertFails(setDoc(doc(db, "pending_approvals", "ap1"), { status: "approved" }));
  });

  it("anon CANNOT read or write scheduled_runs", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "scheduled_runs", "sr1")));
    await assertFails(setDoc(doc(db, "scheduled_runs", "evil"), { prompt: "hax" }));
  });

  it("non-admin authenticated user CANNOT read or write scheduled_runs", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "scheduled_runs", "sr1")));
    await assertFails(setDoc(doc(db, "scheduled_runs", "evil2"), { prompt: "hax" }));
  });

  // -- P2B05 finance: revenue_events / recoupment / royalty_statements / payouts

  it("anon CANNOT read or write revenue_events", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "revenue_events", "rev1")));
    await assertFails(setDoc(doc(db, "revenue_events", "evil"), { grossCents: 1 }));
  });

  it("non-admin authenticated user CANNOT read or write revenue_events", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "revenue_events", "rev1")));
    await assertFails(setDoc(doc(db, "revenue_events", "evil2"), { grossCents: 1 }));
  });

  it("anon CANNOT read or write recoupment accounts", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "recoupment", "roots-untold")));
    await assertFails(setDoc(doc(db, "recoupment", "evil"), { advanceCents: 0 }));
  });

  it("non-admin authenticated user CANNOT read or write recoupment accounts", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "recoupment", "roots-untold")));
    await assertFails(setDoc(doc(db, "recoupment", "evil2"), { recoupedCents: 0 }));
  });

  it("anon CANNOT read or write royalty_statements", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "royalty_statements", "roots-untold__2026-Q2")));
    await assertFails(setDoc(doc(db, "royalty_statements", "evil"), { netCents: 0 }));
  });

  it("non-admin authenticated user CANNOT read or write royalty_statements", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "royalty_statements", "roots-untold__2026-Q2")));
    await assertFails(setDoc(doc(db, "royalty_statements", "evil2"), { netCents: 0 }));
  });

  it("anon CANNOT read or write payouts (cannot self-pay)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "payouts", "payout__roots-untold__2026-Q2")));
    await assertFails(setDoc(doc(db, "payouts", "evil"), { amountCents: 999999, status: "executed-stub" }));
  });

  it("non-admin authenticated user CANNOT read or write payouts (cannot self-pay)", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "payouts", "payout__roots-untold__2026-Q2")));
    await assertFails(setDoc(doc(db, "payouts", "evil2"), { amountCents: 999999, status: "executed-stub" }));
  });

  // -- P2B06 publishing & sync: works + sync_catalog public; work_splits /
  //    pro_affiliations / sync_licenses admin-only.

  it("public CAN read the works registry (transparency artifact)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const snap = await assertSucceeds(getDoc(doc(db, "works", "work1")));
    expect(snap.data()?.title).toBe("Foundation Stones");
    expect(snap.data()?.iswc).toBe("T0000000010");
  });

  it("public CAN read the sync catalog (what's available for sync)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const snap = await assertSucceeds(getDoc(doc(db, "sync_catalog", "USRC12600001")));
    expect(snap.data()?.workId).toBe("work1");
    expect(snap.data()?.available).toBe(true);
  });

  it("anon CANNOT write works or sync_catalog (admin-write only)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, "works", "evilwork"), { title: "hax" }));
    await assertFails(setDoc(doc(db, "sync_catalog", "evilrec"), { workId: "hax" }));
  });

  it("non-admin authenticated user CANNOT write works or sync_catalog", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(setDoc(doc(db, "works", "evilwork2"), { title: "hax" }));
    await assertFails(setDoc(doc(db, "sync_catalog", "evilrec2"), { workId: "hax" }));
  });

  it("anon CANNOT read or write work_splits (writer splits stay private)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "work_splits", "work1")));
    await assertFails(setDoc(doc(db, "work_splits", "evil"), { writerSplits: [] }));
  });

  it("non-admin authenticated user CANNOT read or write work_splits", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "work_splits", "work1")));
    await assertFails(setDoc(doc(db, "work_splits", "evil2"), { writerSplits: [] }));
  });

  it("anon CANNOT read or write pro_affiliations", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "pro_affiliations", "roots-untold")));
    await assertFails(setDoc(doc(db, "pro_affiliations", "evil"), { pro: "ASCAP" }));
  });

  it("non-admin authenticated user CANNOT read or write pro_affiliations", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "pro_affiliations", "roots-untold")));
    await assertFails(setDoc(doc(db, "pro_affiliations", "evil2"), { pro: "ASCAP" }));
  });

  it("anon CANNOT read or write sync_licenses (binding terms/fee stay private)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "sync_licenses", "lic1")));
    await assertFails(setDoc(doc(db, "sync_licenses", "evil"), { status: "issued" }));
  });

  it("non-admin authenticated user CANNOT read or write sync_licenses", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "sync_licenses", "lic1")));
    await assertFails(setDoc(doc(db, "sync_licenses", "evil2"), { status: "issued" }));
  });

  // -- P2B07 marketing: campaigns + marketing_events admin-only (deny client).

  it("anon CANNOT read or write campaigns", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "campaigns", "campaign-foundation-stones")));
    await assertFails(setDoc(doc(db, "campaigns", "evil"), { releaseId: "hax" }));
  });

  it("non-admin authenticated user CANNOT read or write campaigns", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "campaigns", "campaign-foundation-stones")));
    await assertFails(setDoc(doc(db, "campaigns", "evil2"), { releaseId: "hax" }));
  });

  it("anon CANNOT read or write marketing_events (sent-log stays private)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "marketing_events", "social__fake-social-1")));
    await assertFails(setDoc(doc(db, "marketing_events", "evil"), { kind: "social_post" }));
  });

  it("non-admin authenticated user CANNOT read or write marketing_events", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "marketing_events", "social__fake-social-1")));
    await assertFails(setDoc(doc(db, "marketing_events", "evil2"), { kind: "social_post" }));
  });

  // -- P2B08 analytics & A&R: analytics_events / insight_reports /
  //    anr_recommendations admin-only (deny ALL client access).

  it("anon CANNOT read or write analytics_events (business intelligence)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "analytics_events", "dsp:2026-06:rel-a:streams")));
    await assertFails(setDoc(doc(db, "analytics_events", "evil"), { value: 1 }));
  });

  it("non-admin authenticated user CANNOT read or write analytics_events", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "analytics_events", "dsp:2026-06:rel-a:streams")));
    await assertFails(setDoc(doc(db, "analytics_events", "evil2"), { value: 1 }));
  });

  it("anon CANNOT read or write insight_reports", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "insight_reports", "2026-06")));
    await assertFails(setDoc(doc(db, "insight_reports", "evil"), { eventCount: 0 }));
  });

  it("non-admin authenticated user CANNOT read or write insight_reports", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "insight_reports", "2026-06")));
    await assertFails(setDoc(doc(db, "insight_reports", "evil2"), { eventCount: 0 }));
  });

  it("anon CANNOT read or write anr_recommendations", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "anr_recommendations", "2026-06__follow_up_single__rel-a")));
    await assertFails(setDoc(doc(db, "anr_recommendations", "evil"), { kind: "follow_up_single" }));
  });

  it("non-admin authenticated user CANNOT read or write anr_recommendations", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "anr_recommendations", "2026-06__follow_up_single__rel-a")));
    await assertFails(setDoc(doc(db, "anr_recommendations", "evil2"), { kind: "follow_up_single" }));
  });

  // -- P2B09 legal: artist_agreements + license_terms admin-only (deny client).

  it("anon CANNOT read or write artist_agreements (contracts/consent stay private)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "artist_agreements", "roots-untold")));
    await assertFails(
      setDoc(doc(db, "artist_agreements", "evil"), { artistId: "evil", status: "active" }),
    );
  });

  it("non-admin authenticated user CANNOT read or write artist_agreements", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "artist_agreements", "roots-untold")));
    await assertFails(
      setDoc(doc(db, "artist_agreements", "evil2"), { artistId: "evil2", status: "active" }),
    );
  });

  it("anon CANNOT read or write license_terms", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "license_terms", "personal_download")));
    await assertFails(
      setDoc(doc(db, "license_terms", "evil"), { kind: "evil", bodyText: "hax", isPlaceholder: false }),
    );
  });

  it("non-admin authenticated user CANNOT read or write license_terms", async () => {
    const db = testEnv.authenticatedContext("fan").firestore();
    await assertFails(getDoc(doc(db, "license_terms", "personal_download")));
    await assertFails(
      setDoc(doc(db, "license_terms", "evil2"), { kind: "evil2", bodyText: "hax", isPlaceholder: false }),
    );
  });

  it("expectations registered", () => {
    expect(RUN).toBe(false);
  });
});
