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
import { setSetting, getSetting } from '../data/queries';

export type SyncStatus = 'idle' | 'syncing' | 'error';

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

  const db = await getDB();
  const batch = writeBatch(firestore);

  for (const item of queue) {
    const ref = doc(firestore, 'users', uid, item.entityType, item.entityId);

    if (item.action === 'delete') {
      batch.set(ref, { _deleted: true, _updatedAt: item.timestamp });
    } else {
      // Read the latest local copy of the entity and push it
      let data: Record<string, unknown> | undefined;
      try {
        const store = item.entityType as CollectionName;
        // @ts-expect-error dynamic store access
        data = await db.get(store, item.entityId);
      } catch {
        // entity may have been deleted locally after it was queued
      }

      if (data) {
        batch.set(ref, stripUndefined({ ...data, _deleted: false, _updatedAt: item.timestamp }));
      } else {
        // Entity gone locally — treat as delete
        batch.set(ref, { _deleted: true, _updatedAt: item.timestamp });
      }
    }
  }

  await batch.commit();

  // Remove all flushed items from the queue
  for (const item of queue) {
    await removeFromQueue(item.id);
  }
}

// ─── Pull (Firestore → local) ────────────────────────────────────────────────

async function pullChanges(uid: string): Promise<void> {
  if (!firestore || !isFirebaseConfigured) return;
  const lastPulledAt = await getSetting<number>('sync.lastPulledAt') ?? 0;
  const db = await getDB();

  // Build a map of pending local queue items so we can skip stale remote data
  const queue = await getQueue();
  const pendingByEntityId = new Map(queue.map(q => [q.entityId, q.timestamp]));

  setSyncInProgress(true);
  try {
    for (const col of COLLECTIONS) {
      const q = query(userCol(uid, col), where('_updatedAt', '>', lastPulledAt));
      const snap = await getDocs(q);

      for (const docSnap of snap.docs) {
        const remote = docSnap.data() as Record<string, unknown>;
        const entityId = docSnap.id;
        const remoteTs = (remote._updatedAt as number) ?? 0;

        // Skip if local has a more recent pending change
        const localTs = pendingByEntityId.get(entityId);
        if (localTs && localTs >= remoteTs) continue;

        if (remote._deleted) {
          await db.delete(col, entityId);
        } else {
          // Strip sync metadata before writing locally
          const { _deleted: _d, _updatedAt: _u, ...localData } = remote;
          // @ts-expect-error dynamic store access
          await db.put(col, localData);
        }
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
  const db = await getDB();
  const now = Date.now();
  const batch = writeBatch(firestore);

  for (const col of COLLECTIONS) {
    const items: unknown[] = await db.getAll(col);
    for (const item of items as Array<Record<string, unknown>>) {
      const id = item.id as string;
      if (!id) continue;
      const ref = doc(firestore, 'users', uid, col, id);
      batch.set(ref, stripUndefined({ ...item, _deleted: false, _updatedAt: now }), { merge: true });
    }
  }

  await batch.commit();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function syncNow(): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return;
  const user = getCurrentUser();
  if (!user) return;
  if (!navigator.onLine) return; // offline — queue already holds changes, will flush on reconnect
  if (_status === 'syncing') return;

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
  setStatus('syncing');
  try {
    const lastPulledAt = await getSetting<number>('sync.lastPulledAt');
    if (!lastPulledAt) {
      // First time — push everything local, then pull to get any remote data
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
