/**
 * Marketing channel adapters (P2B07, F5) — TEST MODE ONLY.
 *
 * Marketing reaches the outside world through four kinds of channel: social
 * posting, email blasts, playlist pitching, and paid advertising. Each is an
 * INJECTABLE interface so every gate runs offline:
 *   - `Fake*` impls record calls and make NO network request (used by tests),
 *   - the real-impl STUBS read creds from the environment and THROW without
 *     them; they are NEVER constructed or invoked in any test. Live social /
 *     email / ad accounts are OWNER-SIDE, supplied at handoff (manifest §9
 *     approval gate) — exactly the Polar / distributor / PRO pattern.
 *
 * Public posting, email sends, and ad spend are CONSEQUENTIAL outward/spending
 * actions; in the agent they are gated by the P2B04 ApprovalGate. Playlist
 * pitching is a drafted submission (not a public broadcast or a spend) and is
 * not itself gated, but its real impl is still owner-side.
 *
 * Application layer: this module imports nothing from harness/* — it is pure
 * adapter contracts + fakes + stubs.
 */

// ---------------------------------------------------------------------------
// Request / result shapes
// ---------------------------------------------------------------------------

/** A social post to publish (CONSEQUENTIAL — public broadcast). */
export interface SocialPost {
  /** The platform to post to, e.g. "instagram", "x", "mastodon". */
  platform: string;
  /** The post body (already on-brand copy). */
  message: string;
  /** Optional public asset path/URL to attach (e.g. preview clip / artwork). */
  assetPath?: string;
}

/** The result of publishing a social post. */
export interface SocialPostResult {
  /** The channel's post id. */
  postId: string;
  platform: string;
}

/** An email blast to send (CONSEQUENTIAL — outward send). */
export interface EmailBlast {
  /** Audience segment / list name, e.g. "newsletter". */
  segment: string;
  subject: string;
  body: string;
}

/** The result of sending an email blast. */
export interface EmailBlastResult {
  /** The channel's send id. */
  sendId: string;
  segment: string;
  /** How many recipients the send targeted (0 in test mode). */
  recipientCount: number;
}

/** A playlist pitch to submit (drafting/submission — not a public broadcast). */
export interface PlaylistPitchRequest {
  /** The recording (ISRC) being pitched. */
  recordingId: string;
  /** The target playlist / curator. */
  playlist: string;
  /** The pitch note (on-brand copy). */
  note: string;
}

/** The result of submitting a playlist pitch. */
export interface PlaylistPitchResult {
  pitchId: string;
  playlist: string;
}

/** A paid-advertising spend request (CONSEQUENTIAL — spends money). */
export interface AdSpendRequest {
  /** The ad platform, e.g. "meta", "google". */
  platform: string;
  /** Spend amount in minor currency units (cents). */
  budgetCents: number;
  currency: string;
  /** The campaign / objective the spend funds. */
  objective: string;
}

/** The result of placing an ad spend. */
export interface AdSpendResult {
  /** The ad platform's order id. */
  adOrderId: string;
  platform: string;
  budgetCents: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Channel interfaces (injectable capabilities)
// ---------------------------------------------------------------------------

/** Publish public posts to a social platform. */
export interface SocialChannel {
  post(post: SocialPost): Promise<SocialPostResult>;
}

/** Send email blasts to an audience segment. */
export interface EmailChannel {
  send(blast: EmailBlast): Promise<EmailBlastResult>;
}

/** Submit playlist pitches to curators/editorial. */
export interface PlaylistPitch {
  pitch(req: PlaylistPitchRequest): Promise<PlaylistPitchResult>;
}

/** Place paid-advertising spend. */
export interface AdChannel {
  spend(spendReq: AdSpendRequest): Promise<AdSpendResult>;
}

// ---------------------------------------------------------------------------
// Fake impls (record calls, no network) — used by every gate.
// ---------------------------------------------------------------------------

/** Records every social post; returns a synthetic post id. No network. */
export class FakeSocialChannel implements SocialChannel {
  public readonly posts: SocialPost[] = [];
  private counter = 0;

  async post(post: SocialPost): Promise<SocialPostResult> {
    this.counter += 1;
    this.posts.push({ ...post });
    return { postId: `fake-social-${this.counter}`, platform: post.platform };
  }
}

/** Records every email blast; returns a synthetic send id. No network. */
export class FakeEmailChannel implements EmailChannel {
  public readonly blasts: EmailBlast[] = [];
  private counter = 0;

  async send(blast: EmailBlast): Promise<EmailBlastResult> {
    this.counter += 1;
    this.blasts.push({ ...blast });
    return { sendId: `fake-email-${this.counter}`, segment: blast.segment, recipientCount: 0 };
  }
}

/** Records every playlist pitch; returns a synthetic pitch id. No network. */
export class FakePlaylistPitch implements PlaylistPitch {
  public readonly pitches: PlaylistPitchRequest[] = [];
  private counter = 0;

  async pitch(req: PlaylistPitchRequest): Promise<PlaylistPitchResult> {
    this.counter += 1;
    this.pitches.push({ ...req });
    return { pitchId: `fake-pitch-${this.counter}`, playlist: req.playlist };
  }
}

/** Records every ad spend; returns a synthetic ad-order id. No network. */
export class FakeAdChannel implements AdChannel {
  public readonly spends: AdSpendRequest[] = [];
  private counter = 0;

  async spend(spendReq: AdSpendRequest): Promise<AdSpendResult> {
    this.counter += 1;
    this.spends.push({ ...spendReq });
    return {
      adOrderId: `fake-ad-${this.counter}`,
      platform: spendReq.platform,
      budgetCents: spendReq.budgetCents,
      currency: spendReq.currency,
    };
  }
}

// ---------------------------------------------------------------------------
// Real-impl STUBS — read creds from env, THROW without them. Never invoked in
// tests. Constructing them is harmless; only the action methods reach out, and
// only when an operator supplies creds at handoff.
// ---------------------------------------------------------------------------

/** Options for the real channel stubs. Token comes from the environment. */
export interface RealChannelOptions {
  /** Channel API token. In production read from a secret; here, env only. */
  apiToken?: string;
}

function requireToken(token: string, name: string, envVar: string): string {
  if (!token) {
    // Fail loud rather than silently hitting an unauthenticated endpoint. An
    // operator supplies the credential at handoff (approval gate).
    throw new Error(
      `${name} requires ${envVar} (operator-supplied at handoff). ` +
        "Live marketing channels are owner-side; no live call is made in tests.",
    );
  }
  return token;
}

/**
 * Real social channel STUB. THROWS without SOCIAL_API_TOKEN. Live social posting
 * is owner-side at handoff. NEVER constructed/invoked in a test (tests use
 * `FakeSocialChannel`).
 */
export class RealSocialChannel implements SocialChannel {
  private readonly apiToken: string;
  constructor(options: RealChannelOptions = {}) {
    this.apiToken = options.apiToken ?? process.env.SOCIAL_API_TOKEN ?? "";
  }
  async post(post: SocialPost): Promise<SocialPostResult> {
    requireToken(this.apiToken, "RealSocialChannel", "SOCIAL_API_TOKEN");
    throw new Error(
      `RealSocialChannel live posting to ${post.platform} is not wired (owner-side at handoff).`,
    );
  }
}

/**
 * Real email channel STUB. THROWS without EMAIL_API_TOKEN. Live email sending is
 * owner-side at handoff. NEVER constructed/invoked in a test.
 */
export class RealEmailChannel implements EmailChannel {
  private readonly apiToken: string;
  constructor(options: RealChannelOptions = {}) {
    this.apiToken = options.apiToken ?? process.env.EMAIL_API_TOKEN ?? "";
  }
  async send(blast: EmailBlast): Promise<EmailBlastResult> {
    requireToken(this.apiToken, "RealEmailChannel", "EMAIL_API_TOKEN");
    throw new Error(
      `RealEmailChannel live send to segment ${blast.segment} is not wired (owner-side at handoff).`,
    );
  }
}

/**
 * Real playlist-pitch STUB. THROWS without PLAYLIST_API_TOKEN. Live pitching is
 * owner-side at handoff. NEVER constructed/invoked in a test.
 */
export class RealPlaylistPitch implements PlaylistPitch {
  private readonly apiToken: string;
  constructor(options: RealChannelOptions = {}) {
    this.apiToken = options.apiToken ?? process.env.PLAYLIST_API_TOKEN ?? "";
  }
  async pitch(req: PlaylistPitchRequest): Promise<PlaylistPitchResult> {
    requireToken(this.apiToken, "RealPlaylistPitch", "PLAYLIST_API_TOKEN");
    throw new Error(
      `RealPlaylistPitch live pitch to ${req.playlist} is not wired (owner-side at handoff).`,
    );
  }
}

/**
 * Real ad-channel STUB. THROWS without ADS_API_TOKEN. Live ad spend is
 * owner-side at handoff. NEVER constructed/invoked in a test.
 */
export class RealAdChannel implements AdChannel {
  private readonly apiToken: string;
  constructor(options: RealChannelOptions = {}) {
    this.apiToken = options.apiToken ?? process.env.ADS_API_TOKEN ?? "";
  }
  async spend(spendReq: AdSpendRequest): Promise<AdSpendResult> {
    requireToken(this.apiToken, "RealAdChannel", "ADS_API_TOKEN");
    throw new Error(
      `RealAdChannel live spend on ${spendReq.platform} is not wired (owner-side at handoff).`,
    );
  }
}
