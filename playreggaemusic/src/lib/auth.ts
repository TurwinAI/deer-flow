/**
 * Authentication + admin gate (B07).
 *
 * Wraps Firebase Auth and exposes an `isAdmin` check backed by a custom claim
 * (`admin === true`) that the operator sets on the owner account at handoff.
 *
 * FIXTURES / DEV MODE: when `VITE_USE_FIXTURES === "1"`, live Firebase Auth is
 * bypassed with a stub admin user so component tests and the Playwright E2E can
 * run completely offline. The bypass is gated STRICTLY on that env flag — there
 * is no hardcoded production bypass. A production build that does not set the
 * flag always goes through real Firebase Auth.
 */
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseApp } from "./firebase";
import { fixturesEnabled } from "./fixtures";

/** The shape the admin UI needs from the current session. */
export interface AdminSession {
  uid: string;
  email: string | null;
  isAdmin: boolean;
}

/** Stub admin used ONLY in fixtures mode (never reachable in a live build). */
const FIXTURE_ADMIN: AdminSession = {
  uid: "fixture-owner",
  email: "owner@playreggaemusic.ai",
  isAdmin: true,
};

/**
 * Resolve the current admin session.
 *
 * Fixtures mode → the stub admin (offline). Otherwise → the live Firebase user,
 * reading the `admin` custom claim from a fresh ID-token result.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  if (fixturesEnabled()) return FIXTURE_ADMIN;
  const user = getAuth(getFirebaseApp()).currentUser;
  if (!user) return null;
  return toSession(user);
}

async function toSession(user: User): Promise<AdminSession> {
  const result = await user.getIdTokenResult();
  return {
    uid: user.uid,
    email: user.email,
    isAdmin: result.claims.admin === true,
  };
}

/**
 * Subscribe to admin-session changes. In fixtures mode this fires once with the
 * stub admin and never touches Firebase; in prod it relays Firebase Auth state.
 * Returns an unsubscribe function.
 */
export function watchAdminSession(cb: (session: AdminSession | null) => void): () => void {
  if (fixturesEnabled()) {
    cb(FIXTURE_ADMIN);
    return () => {};
  }
  const auth = getAuth(getFirebaseApp());
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cb(null);
      return;
    }
    void toSession(user).then(cb);
  });
}

/** Sign in with email/password (live mode only — a no-op stub in fixtures). */
export async function signIn(email: string, password: string): Promise<AdminSession> {
  if (fixturesEnabled()) return FIXTURE_ADMIN;
  const auth = getAuth(getFirebaseApp());
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return toSession(cred.user);
}

/** Sign out (live mode only — a no-op in fixtures). */
export async function signOutAdmin(): Promise<void> {
  if (fixturesEnabled()) return;
  await signOut(getAuth(getFirebaseApp()));
}
