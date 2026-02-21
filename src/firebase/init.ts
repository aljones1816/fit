import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredFields = Object.values(firebaseConfig);
export const isFirebaseConfigured = requiredFields.every(
  value => typeof value === 'string' && value.trim().length > 0,
);

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;
let auth: Auth | null = null;

if (isFirebaseConfigured) {
  // Initialise once; reuse if HMR re-runs this module
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  firestore = getFirestore(app);
  auth = getAuth(app);
} else {
  console.info('[firebase] Missing VITE_FIREBASE_* config; running in local-only mode.');
}

export { app, firestore, auth };
