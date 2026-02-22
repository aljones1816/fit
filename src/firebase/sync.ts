import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from './init';
import { getCurrentUser } from './auth';
import {
  getQueue,
  removeFromQueue,
  setSyncInProgress,
} from './queue';
import { getDB } from '../data/db';
import { getSetting, setSetting } from '../data/queries';
import { getEncryptionConfig, setEncryptionEnabled, setMigrationState } from '../crypto/encryptionState';
import { getKey } from '../crypto/keyVault';
import { fetchCryptoMeta } from './cryptoMeta';
import { encryptJson } from '../crypto/engine';
import { makeAad } from '../crypto/codec';
import { decryptDoc } from './migration';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'locked';

let _status: SyncStatus = 'idle';
let _lastSyncedAt: number | null = null;
let _lastError: string | null = null;
let _statusListeners: Array<() => void> = [];

export function getSyncStatus() {
  return { status: _status, lastSyncedAt: _lastSyncedAt, lastError: _lastError };
}

export function onSyncStatusChange(cb: () => void): () => void {
  _statusListeners.push(cb);
  return () => { _statusListeners = _statusListeners.filter(l => l !== cb); };
}

function setStatus(s: SyncStatus, err?: string) {
  _status = s;
  _lastError = err ?? null;
  if (s !== 'syncing') _lastSyncedAt = Date.now();
  _statusListeners.forEach(cb => cb());
}

// Firestore collection names — match IDB store names
const COLLECTIONS = [
  'exercises',
  'templates',
  'sessions',
  'sets',
  'bodyweight_entries',
] as const;

type CollectionName = typeof COLLECTIONS[number];

function userCol(uid: string, col: CollectionName) {
  if (!firestore) {
    throw new Error('Cloud sync is not configured for this build.');
  }
  return collection(firestore, 'users', uid, col);
}

// Firestore rejects undefined values — strip them before every write
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// ─── Push (local → Firestore) ────────────────────────────────────────────────

async function flushQueue(uid: string): Promise<void> {
  if (!firestore || !isFirebaseConfigured) return;
  const queue = await getQueue();
  if (queue.length === 0) return;

  const config = await getEncryptionConfig();
  const key = config.enabled ? getKey() : null;
  // If encryption is enabled but key is locked, skip push — will retry when unlocked
  if (config.enabled && !key) return;

  const db = await getDB();
  const batch = writeBatch(firestore);
  const now = Date.now();

  for (const item of queue) {
    const ref = doc(firestore, 'users', uid, item.entityType, item.entityId);

    if (item.action === 'delete') {
      if (key) {
        // Encrypted tombstone — ct is empty JSON null
        const aad = makeAad(uid, item.entityType, item.entityId);
        const { ivB64, ctB64 } = await encryptJson({ key, aad, plaintextObj: null });
        batch.set(ref, { v: 1, updatedAt: item.timestamp, deleted: true, iv: ivB64, ct: ctB64 });
      } else {
        batch.set(ref, { _deleted: true, _updatedAt: item.timestamp });
      }
    } else {
      let data: Record<string, unknown> | undefined;
      try {
        const store = item.entityType as CollectionName;
        // @ts-expect-error dynamic store access
        data = await db.get(store, item.entityId);
      } catch {
        // entity may have been deleted locally after it was queued
      }

      if (data) {
        if (key) {
          const aad = makeAad(uid, item.entityType, item.entityId);
          const { ivB64, ctB64 } = await encryptJson({ key, aad, plaintextObj: stripUndefined(data) });
          batch.set(ref, { v: 1, updatedAt: item.timestamp, deleted: false, iv: ivB64, ct: ctB64 });
        } else {
          batch.set(ref, stripUndefined({ ...data, _deleted: false, _updatedAt: item.timestamp }));
        }
      } else {
        // Entity gone locally — treat as delete
        if (key) {
          const aad = makeAad(uid, item.entityType, item.entityId);
          const { ivB64, ctB64 } = await encryptJson({ key, aad, plaintextObj: null });
          batch.set(ref, { v: 1, updatedAt: now, deleted: true, iv: ivB64, ct: ctB64 });
        } else {
          batch.set(ref, { _deleted: true, _updatedAt: item.timestamp });
        }
      }
    }
  }

  await batch.commit();

  for (const item of queue) {
    await removeFromQueue(item.id);
  }
}

// ─── Pull (Firestore → local) ────────────────────────────────────────────────

async function pullChanges(uid: string): Promise<void> {
  if (!firestore || !isFirebaseConfigured) return;

  const config = await getEncryptionConfig();
  const key = config.enabled ? getKey() : null;
  // If encryption enabled but locked, skip pull
  if (config.enabled && !key) return;

  const lastPulledAt = await getSetting<number>('sync.lastPulledAt') ?? 0;
  const db = await getDB();

  const queue = await getQueue();
  const pendingByEntityId = new Map(queue.map(q => [q.entityId, q.timestamp]));

  setSyncInProgress(true);
  try {
    for (const col of COLLECTIONS) {
      // Query field differs: encrypted docs use 'updatedAt', plaintext use '_updatedAt'
      const tsField = (config.enabled && key) ? 'updatedAt' : '_updatedAt';
      const q = query(userCol(uid, col), where(tsField, '>', lastPulledAt));
      const snap = await getDocs(q);

      for (const docSnap of snap.docs) {
        const remote = docSnap.data() as Record<string, unknown>;
        const entityId = docSnap.id;

        // Determine timestamps — support both doc formats
        const remoteTs = (
          (remote.updatedAt as number) ??
          (remote._updatedAt as number) ??
          0
        );

        const localTs = pendingByEntityId.get(entityId);
        if (localTs && localTs >= remoteTs) continue;

        const isEncrypted = typeof remote.ct === 'string' && typeof remote.iv === 'string';

        if (isEncrypted && key) {
          // Decrypt and apply
          if (remote.deleted) {
            await db.delete(col, entityId);
          } else {
            const payload = await decryptDoc(uid, col, entityId, key, remote);
            if (payload) {
              // @ts-expect-error dynamic store access
              await db.put(col, payload);
            }
            // else: decryption failed — skip, don't corrupt local data
          }
        } else if (!isEncrypted && !config.enabled) {
          // Plaintext mode — strip sync metadata before writing locally
          if (remote._deleted) {
            await db.delete(col, entityId);
          } else {
            const { _deleted: _d, _updatedAt: _u, ...localData } = remote;
            // @ts-expect-error dynamic store access
            await db.put(col, localData);
          }
        }
        // Mismatched mode (encrypted doc but key locked, or plaintext doc when E2EE on):
        // skip — data will be re-pulled after state is consistent
      }
    }
  } finally {
    setSyncInProgress(false);
  }

  await setSetting('sync.lastPulledAt', Date.now());
}

// ─── Initial full push (first sign-in with existing local data) ──────────────

async function initialPush(uid: string): Promise<void> {
  if (!firestore || !isFirebaseConfigured) return;

  const config = await getEncryptionConfig();
  const key = config.enabled ? getKey() : null;
  if (config.enabled && !key) return; // locked — skip initial push

  const db = await getDB();
  const now = Date.now();
  const batch = writeBatch(firestore);

  for (const col of COLLECTIONS) {
    const items: unknown[] = await db.getAll(col);
    for (const item of items as Array<Record<string, unknown>>) {
      const id = item.id as string;
      if (!id) continue;
      const ref = doc(firestore, 'users', uid, col, id);
      if (key) {
        const aad = makeAad(uid, col, id);
        const { ivB64, ctB64 } = await encryptJson({ key, aad, plaintextObj: stripUndefined(item) });
        batch.set(ref, { v: 1, updatedAt: now, deleted: false, iv: ivB64, ct: ctB64 }, { merge: true });
      } else {
        batch.set(ref, stripUndefined({ ...item, _deleted: false, _updatedAt: now }), { merge: true });
      }
    }
  }

  await batch.commit();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function syncNow(): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return;
  const user = getCurrentUser();
  if (!user) return;
  if (!navigator.onLine) return;
  if (_status === 'syncing') return;

  // If encryption enabled but locked, surface that state
  const config = await getEncryptionConfig();
  if (config.enabled && !getKey()) {
    setStatus('locked');
    return;
  }

  setStatus('syncing');
  try {
    await flushQueue(user.uid);
    await pullChanges(user.uid);
    setStatus('idle');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus('error', msg);
    console.error('[sync]', msg);
  }
}

// Called once on first sign-in to upload any existing local data
export async function initialSync(uid: string): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return;
  if (!navigator.onLine) return;

  // ── New-device detection ──────────────────────────────────────────────────
  // If this device has no local encryption state, check whether Firestore
  // already has a crypto/meta doc (meaning the user set up E2EE on another
  // device). If so, adopt the encrypted+locked state before proceeding.
  const localConfig = await getEncryptionConfig();
  if (!localConfig.enabled) {
    const remoteMeta = await fetchCryptoMeta(uid).catch(() => null);
    if (remoteMeta) {
      // Account has E2EE — mark this device as encrypted+locked+migrated
      await setEncryptionEnabled(true);
      await setMigrationState('complete');
      setStatus('locked');
      return;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const config = await getEncryptionConfig();
  if (config.enabled && !getKey()) {
    setStatus('locked');
    return;
  }

  setStatus('syncing');
  try {
    const lastPulledAt = await getSetting<number>('sync.lastPulledAt');
    if (!lastPulledAt) {
      await initialPush(uid);
    }
    await pullChanges(uid);
    setStatus('idle');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus('error', msg);
  }
}

// Fire-and-forget sync — call after mutations. Silently queues if offline.
export function trySyncNow(): void {
  syncNow();
}

// Wire up auto-sync on coming back online
export function initAutoSync(): void {
  if (!isFirebaseConfigured || !firestore) return;
  window.addEventListener('online', () => {
    syncNow().catch(() => {});
  });
}
