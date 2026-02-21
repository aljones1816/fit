// Standalone sync queue — no dependency on queries.ts to avoid circular imports.
// queries.ts → queue.ts ← sync.ts
import { getDB, SyncQueueItem } from '../data/db';
import { generateId } from '../data/db';

// When true (during a pull), writes via queries.ts won't re-queue
let syncInProgress = false;

export function setSyncInProgress(value: boolean) {
  syncInProgress = value;
}

export function isSyncInProgress(): boolean {
  return syncInProgress;
}

export async function queueChange(
  entityType: SyncQueueItem['entityType'],
  entityId: string,
  action: 'put' | 'delete',
): Promise<void> {
  if (syncInProgress) return;

  const db = await getDB();

  // If there's already a queued item for this entity, replace it with the latest action
  const existing = await db.getAllFromIndex('sync_queue', 'entityId', entityId);
  for (const item of existing) {
    await db.delete('sync_queue', item.id);
  }

  await db.add('sync_queue', {
    id: generateId(),
    entityType,
    entityId,
    action,
    timestamp: Date.now(),
  });
}

export async function getQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAll('sync_queue');
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('sync_queue', id);
}

export async function getQueueSize(): Promise<number> {
  const db = await getDB();
  return (await db.count('sync_queue'));
}
