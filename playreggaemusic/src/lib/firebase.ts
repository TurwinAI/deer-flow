/**
 * Firebase web app initialization (B06). The public catalog reads Firestore via
 * the web SDK. Config comes from Vite env vars (VITE_FIREBASE_*) supplied by the
 * operator at deploy time; none are committed. The Firestore handle is created
 * lazily so importing this module never forces an init (and component tests,
 * which mock `src/lib/catalog`, never touch it).
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

function firebaseConfig() {
  const env = import.meta.env;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

let cachedApp: FirebaseApp | undefined;
let cachedDb: Firestore | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  cachedApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig());
  return cachedApp;
}

/** Lazily create and cache the Firestore handle. */
export function getDb(): Firestore {
  if (cachedDb) return cachedDb;
  cachedDb = getFirestore(getFirebaseApp());
  return cachedDb;
}
