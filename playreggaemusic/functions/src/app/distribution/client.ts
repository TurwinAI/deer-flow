/**
 * Distributor (DSP aggregator) client (P2B03, F4) — TEST MODE ONLY.
 *
 * Delivering a release to DSPs (Spotify/Apple/etc.) goes through a distributor /
 * aggregator that accepts a DDEX ERN package. To keep every gate offline, the
 * capability is an INJECTABLE interface (`DistributorClient`). Tests inject
 * `FakeDistributorClient`; production wiring uses `DdexDistributorClient` (a thin
 * fetch-based stub that reads its base URL + API token from the environment and
 * defaults to a SANDBOX host). The real client is NEVER constructed or invoked in
 * the unit/emulator gates — exactly like the Polar `PolarSdkClient` pattern.
 *
 * Sandbox vs production base URL:
 *   - sandbox (default):   https://sandbox.distributor.example/ddex
 *   - production:          (operator-supplied at handoff)
 * A real token/host is an operator-side concern supplied at handoff (manifest §9
 * approval gate); never committed here. NO live publish happens in tests.
 */

/** Lifecycle of a delivery as reported by the distributor. */
export type DeliveryStatus = "accepted" | "delivered" | "rejected" | "pending";

/** Metadata accompanying a delivery (so the distributor can route it). */
export interface DeliveryMeta {
  /** Our release id (mirrored back for reconciliation). */
  releaseId: string;
  /** Release barcode (UPC/EAN). */
  upc: string;
  /** Release title (display only). */
  title: string;
}

/** Result of delivering an ERN package: the distributor's id + initial status. */
export interface DeliveryResult {
  deliveryId: string;
  status: DeliveryStatus;
}

/**
 * The capability the app needs from a distributor. Injectable so tests pass a
 * mock and production passes the real client. Narrow on purpose — this is what
 * lets every gate run with zero network.
 */
export interface DistributorClient {
  /** Submit an ERN XML package; returns the distributor's delivery id + status. */
  deliver(ernXml: string, meta: DeliveryMeta): Promise<DeliveryResult>;
  /** Poll the current status of a previously-submitted delivery. */
  status(deliveryId: string): Promise<DeliveryStatus>;
}

/** Default SANDBOX base URL so nothing live runs by accident. */
export const DISTRIBUTOR_SANDBOX_BASE_URL = "https://sandbox.distributor.example/ddex";

/** Options for the real client. Token + host come from the environment. */
export interface DdexDistributorClientOptions {
  /** Distributor API token. In production read from a secret; here, env only. */
  apiToken?: string;
  /** API base URL; defaults to the sandbox host. */
  baseUrl?: string;
  /** Injectable fetch (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

/**
 * Real DDEX distributor client. In production this POSTs the ERN package to the
 * configured (sandbox by default) base URL. It is NEVER invoked by the unit or
 * emulator gates — those use `FakeDistributorClient`. Constructing it needs no
 * network and no key; only `deliver()`/`status()` would reach out, and only when
 * an operator has supplied DISTRIBUTOR_API_TOKEN at handoff (approval gate).
 */
export class DdexDistributorClient implements DistributorClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DdexDistributorClientOptions = {}) {
    this.apiToken = options.apiToken ?? process.env.DISTRIBUTOR_API_TOKEN ?? "";
    this.baseUrl = options.baseUrl ?? process.env.DISTRIBUTOR_BASE_URL ?? DISTRIBUTOR_SANDBOX_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private requireToken(): string {
    if (!this.apiToken) {
      // Fail loud rather than silently hitting an unauthenticated endpoint.
      // An operator supplies DISTRIBUTOR_API_TOKEN at handoff (approval gate).
      throw new Error(
        "DdexDistributorClient requires DISTRIBUTOR_API_TOKEN (operator-supplied at handoff).",
      );
    }
    return this.apiToken;
  }

  async deliver(ernXml: string, meta: DeliveryMeta): Promise<DeliveryResult> {
    const token = this.requireToken();
    const response = await this.fetchImpl(`${this.baseUrl}/deliveries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/xml",
        "X-Release-Id": meta.releaseId,
      },
      body: ernXml,
    });
    if (!response.ok) {
      throw new Error(`Distributor delivery failed: ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as { deliveryId?: string; status?: string };
    if (!json.deliveryId || !json.status) {
      throw new Error("Distributor delivery response missing deliveryId/status");
    }
    return { deliveryId: json.deliveryId, status: json.status as DeliveryStatus };
  }

  async status(deliveryId: string): Promise<DeliveryStatus> {
    const token = this.requireToken();
    const response = await this.fetchImpl(`${this.baseUrl}/deliveries/${encodeURIComponent(deliveryId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Distributor status failed: ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as { status?: string };
    if (!json.status) {
      throw new Error("Distributor status response missing status");
    }
    return json.status as DeliveryStatus;
  }
}

/** A delivery the fake recorded, for test assertions. */
export interface RecordedDelivery {
  deliveryId: string;
  ernXml: string;
  meta: DeliveryMeta;
  status: DeliveryStatus;
}

/**
 * Deterministic test double. Records every delivery it received and returns a
 * synthetic delivery id. The initial status defaults to "accepted"; a later
 * `status()` call advances it to "delivered" (modelling the distributor moving
 * the release live), so a status-refresh path is exercisable. Used by every
 * unit/emulator test so no live distributor account, key, or network is needed.
 */
export class FakeDistributorClient implements DistributorClient {
  public readonly deliveries: RecordedDelivery[] = [];
  private counter = 0;

  constructor(
    private readonly initialStatus: DeliveryStatus = "accepted",
    private readonly refreshedStatus: DeliveryStatus = "delivered",
  ) {}

  async deliver(ernXml: string, meta: DeliveryMeta): Promise<DeliveryResult> {
    this.counter += 1;
    const deliveryId = `fake-delivery-${this.counter}`;
    this.deliveries.push({ deliveryId, ernXml, meta, status: this.initialStatus });
    return { deliveryId, status: this.initialStatus };
  }

  async status(deliveryId: string): Promise<DeliveryStatus> {
    const found = this.deliveries.find((d) => d.deliveryId === deliveryId);
    if (!found) {
      throw new Error(`Unknown delivery: ${deliveryId}`);
    }
    // Advance to the refreshed status to model the release going live.
    found.status = this.refreshedStatus;
    return this.refreshedStatus;
  }
}
