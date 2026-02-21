# Firebase Sync Architecture

## Overview

SetLift uses Firebase Auth (Email/Password) and Firestore for optional cloud backup and multi-device sync. The app is fully **offline-first**: it works without any network connection. Sync is only enabled when the user is signed in.

## Firestore Structure

All user data is namespaced under the user's UID:

```
/users/{uid}/exercises/{exerciseId}
/users/{uid}/templates/{templateId}
/users/{uid}/sessions/{sessionId}
/users/{uid}/sets/{setId}
/users/{uid}/bodyweight_entries/{entryId}
```

These collection names mirror the local IndexedDB store names.

### Synced Collections

| Collection | Key fields |
|---|---|
| `exercises` | `id`, `name`, `createdAt`, `updatedAt` |
| `templates` | `id`, `name`, `exerciseIds`, `createdAt`, `updatedAt` |
| `sessions` | `id`, `templateId`, `startedAt`, `endedAt`, `bodyweightLbs` |
| `sets` | `id`, `sessionId`, `exerciseId`, `setIndex`, `reps`, `weightLbs` |
| `bodyweight_entries` | `id`, `measuredAt`, `weightLbs` |

### Sync Metadata Fields

Each Firestore document has two additional fields (stripped before writing back to local IDB):

| Field | Type | Description |
|---|---|---|
| `_updatedAt` | `number` (ms) | Timestamp of the last write. Used for incremental pull queries and conflict resolution. |
| `_deleted` | `boolean` | Soft-delete tombstone. When `true`, the document is deleted locally on next pull. |

## Conflict Resolution

**Strategy: last-write-wins on `_updatedAt`.**

- Every mutation immediately writes to local IDB and enqueues a `sync_queue` entry with the current timestamp.
- On push (`flushQueue`), the latest local copy is read and written to Firestore with the queue item's timestamp as `_updatedAt`.
- On pull (`pullChanges`), remote documents with `_updatedAt > lastPulledAt` are fetched. If a local pending queue entry exists for the same entity with a **newer or equal timestamp**, the remote value is skipped (local wins).
- This ensures that rapid local edits during an offline period are not overwritten by a stale remote value once connectivity is restored.

## Sync Flow

### Normal sync (`syncNow`)

1. **Flush queue** — read all pending `sync_queue` items, batch-write to Firestore, clear queue.
2. **Pull changes** — query each collection for `_updatedAt > lastPulledAt`, apply to local IDB, record new `lastPulledAt`.

### First sign-in (`initialSync`)

If `sync.lastPulledAt` is not set (never synced before):
1. **Initial push** — upload all local entities to Firestore with `{ merge: true }`.
2. **Pull changes** — pull everything from Firestore (catches any remote data from another device).

### Auto-sync triggers

- **On sign-in** — `initialSync` runs.
- **On `window.online`** — `syncNow` runs automatically (e.g. phone reconnects to Wi-Fi).
- **Manual** — "Sync Now" button in the Stats screen.

## Offline Queue

Changes made while offline are persisted in the local `sync_queue` IndexedDB store. Each entry records:

```ts
{
  id: string;          // queue item ID
  entityType: string;  // collection name
  entityId: string;    // entity's own ID
  action: 'put' | 'delete';
  timestamp: number;   // ms since epoch
}
```

If multiple writes arrive for the same entity before sync, earlier entries are replaced (de-duplicated by `entityId`), keeping only the latest action. This prevents unnecessary Firestore writes.

## Local Developer Setup

1. Copy your Firebase web config into `secrets.txt` at the project root (JS snippet, JSON, or `KEY=value` format — all are supported).
2. Run `node scripts/setup-env.cjs` to generate `.env.local` with `VITE_FIREBASE_*` variables.
   - This runs automatically as part of `npm run build`.
3. `secrets.txt` and `.env.local` are gitignored — never commit them.

See `.env.local.example` for the required variable names.
