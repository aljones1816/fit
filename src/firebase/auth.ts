import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './init';

export type { User };

export function getCurrentUser(): User | null {
  if (!isFirebaseConfigured || !auth) return null;
  return auth.currentUser;
}

export async function signUp(email: string, password: string): Promise<User> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Cloud sync is not configured for this build.');
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Cloud sync is not configured for this build.');
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOut(): Promise<void> {
  if (!isFirebaseConfigured || !auth) return;
  await firebaseSignOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  if (!isFirebaseConfigured || !auth) throw new Error('Cloud sync is not configured.');
  await sendPasswordResetEmail(auth, email);
}

export async function sendVerificationEmail(): Promise<void> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in.');
  await sendEmailVerification(user);
}

export function onAuthStateChanged(callback: (user: User | null) => void): () => void {
  if (!isFirebaseConfigured || !auth) {
    callback(null);
    return () => {};
  }
  return firebaseOnAuthStateChanged(auth, callback);
}
