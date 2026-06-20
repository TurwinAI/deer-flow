/**
 * Firestore access. Lazily initializes firebase-admin exactly once and returns
 * a shared `Firestore` handle. When `FIRESTORE_EMULATOR_HOST` is set the admin
 * SDK auto-connects to the local emulator — we only have to make sure a
 * projectId is present so the SDK does not fail to bootstrap.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedDb: Firestore | undefined;

/** Lazily initialize firebase-admin and return the shared Firestore client. */
export function getDb(): Firestore {
  if (cachedDb !== undefined) {
    return cachedDb;
  }
  if (getApps().length === 0) {
    initializeApp({
      projectId: process.env.GCLOUD_PROJECT ?? "playreggaemusic-dev",
    });
  }
  cachedDb = getFirestore();
  return cachedDb;
}
