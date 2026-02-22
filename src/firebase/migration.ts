import {
  collection,
  doc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { firestore } from './init';
import { encryptJson, decryptJson } from '../crypto/engine';
import { makeAad } from '../crypto/codec';
import { setMigrationState } from '../crypto/encryptionState';
import { setSetting } from '../data/queries';

const COLLECTIONS = [
  'exercises',
  'templates',
  'sessions',
  'sets',
  'bodyweight_entries',
] as const;

type ColName = typeof COLLECTIONS[number];

// A doc is already encrypted if it has the wrapper fields
function isEncryptedDoc(data: Record<string, unknown>): boolean {
  return typeof data.ct === 'string' && typeof data.iv === 'string' && data.v === 1;
}

export type MigrationProgress = {
  total: number;
  done: number;
};

/**
 * Migrate all plaintext Firestore docs to encrypted wrapper format.
 * Safe to call again after a partial migration — already-encrypted docs are skipped.
 */
export async function migrateToEncrypted(
  uid: string,
  key: CryptoKey,
  onProgress?: (p: MigrationProgress) => void,
): Promise<void> {
  if (!firestore) throw new Error('Firestore not configured');

  // First pass: count total docs to migrate
  const allDocs: Array<{ col: ColName; id: string; data: Record<string, unknown> }> = [];
  for (const col of COLLECTIONS) {
    const colRef = collection(firestore, 'users', uid, col);
    const snap = await getDocs(colRef);
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as Record<string, unknown>;
      if (!isEncryptedDoc(data)) {
        allDocs.push({ col, id: docSnap.id, data });
      }
    }
  }

  const total = allDocs.length;
  let done = 0;
  onProgress?.({ total, done });

  if (total === 0) {
    await setMigrationState('complete', Date.now());
    return;
  }

  // Process in batches of 500 (Firestore limit)
  const BATCH_SIZE = 400;
  for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
    const chunk = allDocs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(firestore);

    for (const { col, id, data } of chunk) {
      const aad = makeAad(uid, col, id);
      // Strip legacy sync metadata before encrypting — it will be in wrapper
      const { _deleted, _updatedAt, ...payload } = data as Record<string, unknown>;
      const { ivB64, ctB64 } = await encryptJson({ key, aad, plaintextObj: payload });

      const ref = doc(firestore, 'users', uid, col, id);
      batch.set(ref, {
        v: 1,
        updatedAt: (_updatedAt as number) ?? Date.now(),
        deleted: (_deleted as boolean) ?? false,
        iv: ivB64,
        ct: ctB64,
      });
    }

    await batch.commit();
    done += chunk.length;
    onProgress?.({ total, done });
  }

  await setMigrationState('complete', Date.now());
  // Reset lastPulledAt so the next pull fetches all encrypted docs fresh
  await setSetting('sync.lastPulledAt', 0);
}

/**
 * Decrypt an encrypted Firestore doc wrapper back to its plaintext payload.
 * Returns null if decryption fails (wrong key / corrupt data).
 */
export async function decryptDoc(
  uid: string,
  col: string,
  docId: string,
  key: CryptoKey,
  data: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    const aad = makeAad(uid, col, docId);
    const payload = await decryptJson({
      key,
      aad,
      ivB64: data.iv as string,
      ctB64: data.ct as string,
    });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
