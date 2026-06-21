/**
 * Polar.sh client (B06) — TEST MODE ONLY.
 *
 * Polar is the Merchant of Record for digital downloads. To keep unit/emulator
 * gates fully offline, the checkout API is expressed as an INJECTABLE interface
 * (`PolarClient`). Production wiring uses `PolarSdkClient` (a thin fetch-based
 * client that reads its base URL + access token from the environment); tests
 * inject `FakePolarClient` so NO live key and NO outbound request is ever
 * required to build or test.
 *
 * Sandbox vs production base URL (Polar publishes both):
 *   - sandbox (default):   https://sandbox-api.polar.sh
 *   - production:          https://api.polar.sh
 * We default to the SANDBOX host. A real key/host is an operator-side concern
 * supplied at handoff (manifest §9 approval gate); never committed here.
 */

/** Polar API base URLs. Default to sandbox so nothing live runs by accident. */
export const POLAR_SANDBOX_BASE_URL = "https://sandbox-api.polar.sh";
export const POLAR_PRODUCTION_BASE_URL = "https://api.polar.sh";

/** Input to create a checkout for one Polar product/price. */
export interface CreateCheckoutInput {
  /** Polar product id (NOT the Firestore product id). */
  productId: string;
  /** Optional Polar price id, when the product has multiple prices. */
  priceId?: string;
  /** URL Polar redirects the buyer to after a successful payment. */
  successUrl?: string;
  /** Arbitrary metadata mirrored back on the order/webhook (e.g. our productId). */
  metadata?: Record<string, string>;
}

/** Result of creating a checkout: a hosted URL + the checkout id. */
export interface CheckoutResult {
  checkoutUrl: string;
  checkoutId: string;
}

/**
 * The capability the app needs from Polar. Injectable so tests pass a mock and
 * production passes the real SDK client. Keeping it this narrow is what lets
 * every gate run with zero network.
 */
export interface PolarClient {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
}

/** Options for the real client. Token + host come from the environment. */
export interface PolarSdkClientOptions {
  /** Polar access token. In production read from a secret; here, env only. */
  accessToken?: string;
  /** API base URL; defaults to the sandbox host. */
  baseUrl?: string;
  /** Injectable fetch (defaults to global fetch). Lets non-network tests stub it. */
  fetchImpl?: typeof fetch;
}

/**
 * Real Polar client. In production this calls the Polar checkout API at the
 * configured (sandbox by default) base URL. It is NEVER invoked by the unit or
 * emulator gates — those use `FakePolarClient`. Constructing it requires no
 * network and no key; only `createCheckout()` would reach out, and only when an
 * operator has supplied a live token at handoff.
 */
export class PolarSdkClient implements PolarClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PolarSdkClientOptions = {}) {
    this.accessToken = options.accessToken ?? process.env.POLAR_ACCESS_TOKEN ?? "";
    this.baseUrl = options.baseUrl ?? process.env.POLAR_BASE_URL ?? POLAR_SANDBOX_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    if (!this.accessToken) {
      // Fail loud rather than silently hitting an unauthenticated endpoint.
      // An operator supplies POLAR_ACCESS_TOKEN at handoff (approval gate).
      throw new Error(
        "PolarSdkClient requires POLAR_ACCESS_TOKEN (operator-supplied at handoff).",
      );
    }
    const body: Record<string, unknown> = {
      products: [input.productId],
    };
    if (input.priceId) body.product_price_id = input.priceId;
    if (input.successUrl) body.success_url = input.successUrl;
    if (input.metadata) body.metadata = input.metadata;

    const response = await this.fetchImpl(`${this.baseUrl}/v1/checkouts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Polar checkout failed: ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as { id?: string; url?: string };
    if (!json.id || !json.url) {
      throw new Error("Polar checkout response missing id/url");
    }
    return { checkoutId: json.id, checkoutUrl: json.url };
  }
}

/**
 * Deterministic test double. Records the calls it received and returns a
 * synthetic checkout URL. Used by every unit/emulator test so no live Polar
 * account, key, or network is involved.
 */
export class FakePolarClient implements PolarClient {
  public readonly calls: CreateCheckoutInput[] = [];

  constructor(
    private readonly result: CheckoutResult = {
      checkoutUrl: "https://sandbox.polar.sh/checkout/fake-checkout",
      checkoutId: "checkout_fake_123",
    },
  ) {}

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    this.calls.push(input);
    return this.result;
  }
}
