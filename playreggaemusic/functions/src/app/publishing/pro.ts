/**
 * PRO / MLC affiliation (P2B06, F8 Publishing admin).
 *
 * To collect performance + mechanical royalties a writer must be affiliated with
 * a Performing Rights Organization (ASCAP/BMI/SESAC) and registered with the MLC
 * (mechanical). This module records those affiliations and registers them through
 * a pluggable `ProRegistrar` adapter — exactly the Polar / distributor pattern:
 *   - `FakeProRegistrar` is used by every gate (deterministic, no network),
 *   - `RealProRegistrar` reads creds from the environment and THROWS without them;
 *     it is NEVER constructed or invoked in a test. Live PRO/MLC registration is
 *     an OWNER-SIDE concern supplied at handoff (manifest §9 approval gate).
 *
 * The affiliation record itself is SENSITIVE (carries member/IPI ids) and is
 * stored in the admin-only `pro_affiliations/{writerId}` collection
 * (firestore.rules denies all client access; the admin SDK bypasses rules).
 *
 * Application layer: MAY import harness/* (getDb).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../../harness/persistence/firestore";

const PRO_AFFILIATIONS = "pro_affiliations";

/** The collection bodies a writer may affiliate with. */
export type Pro = "ASCAP" | "BMI" | "SESAC" | "MLC";

/**
 * A writer's affiliation with a PRO/MLC. SENSITIVE — stored admin-only in
 * `pro_affiliations/{writerId}`. `ipi` (Interested Party Information) and
 * `memberId` identify the writer to the collection body.
 */
export interface ProAffiliation {
  writerId: string;
  pro: Pro;
  /** Interested Party Information number (optional until assigned). */
  ipi?: string;
  /** The writer's member id at the PRO/MLC (optional until assigned). */
  memberId?: string;
}

/** The confirmation a registrar returns after registering an affiliation. */
export interface ProRegistrationConfirmation {
  writerId: string;
  pro: Pro;
  /** The registrar's confirmation id (e.g. a submission/reference number). */
  confirmationId: string;
  /** ISO-8601 timestamp the registration was confirmed. */
  registeredAt: string;
}

/**
 * The capability the app needs from a PRO/MLC registrar. Injectable so tests
 * pass `FakeProRegistrar` and production passes `RealProRegistrar`. Narrow on
 * purpose — this is what lets every gate run with zero network.
 */
export interface ProRegistrar {
  register(affiliation: ProAffiliation): Promise<ProRegistrationConfirmation>;
}

/**
 * Deterministic test double. Records every affiliation it received and returns a
 * synthetic confirmation id. Used by every gate so no live PRO/MLC account, key,
 * or network is needed.
 */
export class FakeProRegistrar implements ProRegistrar {
  public readonly registered: ProAffiliation[] = [];
  private counter = 0;

  async register(affiliation: ProAffiliation): Promise<ProRegistrationConfirmation> {
    this.counter += 1;
    this.registered.push({ ...affiliation });
    return {
      writerId: affiliation.writerId,
      pro: affiliation.pro,
      confirmationId: `fake-pro-${affiliation.pro.toLowerCase()}-${this.counter}`,
      registeredAt: new Date().toISOString(),
    };
  }
}

/** Options for the real registrar. Token comes from the environment. */
export interface RealProRegistrarOptions {
  /** PRO/MLC API token. In production read from a secret; here, env only. */
  apiToken?: string;
}

/**
 * Real PRO/MLC registrar STUB. Constructing it needs no network and no key; only
 * `register()` would reach out, and only when an operator has supplied
 * PRO_API_TOKEN at handoff (approval gate). It THROWS without creds — fail loud
 * rather than silently calling an unauthenticated endpoint. It is NEVER invoked
 * by the unit or emulator gates — those use `FakeProRegistrar`.
 */
export class RealProRegistrar implements ProRegistrar {
  private readonly apiToken: string;

  constructor(options: RealProRegistrarOptions = {}) {
    this.apiToken = options.apiToken ?? process.env.PRO_API_TOKEN ?? "";
  }

  async register(affiliation: ProAffiliation): Promise<ProRegistrationConfirmation> {
    if (!this.apiToken) {
      throw new Error(
        "RealProRegistrar requires PRO_API_TOKEN (operator-supplied at handoff). " +
          "Live PRO/MLC registration is owner-side; no live call is made in tests.",
      );
    }
    // A live integration would POST `affiliation` to the PRO/MLC API here.
    // Deliberately not implemented: live registration is owner-side at handoff.
    throw new Error(
      `RealProRegistrar live registration for ${affiliation.writerId} (${affiliation.pro}) ` +
        "is not wired (owner-side at handoff).",
    );
  }
}

function db(override?: Firestore): Firestore {
  return override ?? getDb();
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * Register a writer's PRO/MLC affiliation: run it through the injected registrar
 * (Fake in tests), then persist the affiliation to the admin-only
 * `pro_affiliations/{writerId}` collection. Returns the registrar confirmation.
 * The affiliation record never leaves the admin-only collection.
 */
export async function registerProAffiliation(
  affiliation: ProAffiliation,
  registrar: ProRegistrar,
  store?: Firestore,
): Promise<ProRegistrationConfirmation> {
  const confirmation = await registrar.register(affiliation);
  await db(store)
    .collection(PRO_AFFILIATIONS)
    .doc(affiliation.writerId)
    .set(pruneUndefined({ ...affiliation }));
  return confirmation;
}

/** Read a writer's PRO/MLC affiliation (admin SDK). Returns null if absent. */
export async function getProAffiliation(
  writerId: string,
  store?: Firestore,
): Promise<ProAffiliation | null> {
  const snap = await db(store).collection(PRO_AFFILIATIONS).doc(writerId).get();
  return snap.exists ? (snap.data() as ProAffiliation) : null;
}
