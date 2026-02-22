import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from './init';
import { generateSalt, PBKDF2_ITERATIONS } from '../crypto/engine';

export interface CryptoMeta {
  v: number;
  kdf: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: string; // base64(16 bytes) — not secret
  createdAt: number;
  // Verification token — encrypted sentinel to confirm correct passphrase
  verifyIv?: string;
  verifyCt?: string;
}

export async function fetchCryptoMeta(uid: string): Promise<CryptoMeta | null> {
  if (!firestore) return null;
  const ref = doc(firestore, 'users', uid, 'crypto', 'meta');
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as CryptoMeta) : null;
}

export async function createCryptoMeta(uid: string): Promise<CryptoMeta> {
  if (!firestore) throw new Error('Firestore not configured');
  const meta: CryptoMeta = {
    v: 1,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: generateSalt(),
    createdAt: Date.now(),
  };
  const ref = doc(firestore, 'users', uid, 'crypto', 'meta');
  await setDoc(ref, meta);
  return meta;
}

export async function saveCryptoMetaVerification(
  uid: string,
  meta: CryptoMeta,
  verifyIv: string,
  verifyCt: string,
): Promise<void> {
  if (!firestore) throw new Error('Firestore not configured');
  const updated: CryptoMeta = { ...meta, verifyIv, verifyCt };
  const ref = doc(firestore, 'users', uid, 'crypto', 'meta');
  await setDoc(ref, updated);
}
