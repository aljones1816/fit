You are Claude Code working in my repo for the SetLift PWA.

Goal: integrate Firebase (Auth + Firestore) for **user auth** and **syncing workout logs**. The app remains **offline-first**: it must work fully without network, then sync when online. We are only syncing workout logs (no photos).

Critical constraints:
- Do NOT assume you know the exact data model. We have added/changed data structures/features beyond the original spec. You must inspect the current codebase to discover the local data shape and storage.
- Firebase web config + identifiers are stored in **@secrets.txt** at the project root. The contents may be copied directly from the Firebase console and can be in whatever format Firebase provides. You must parse this file robustly (support common formats such as a JS config snippet, JSON-like blocks, or key/value lines). Do not ask me to reformat it unless absolutely necessary.
- **NEVER commit `secrets.txt` to version control.** Ensure it is gitignored. If `.gitignore` does not already exclude it, add an entry for it.
- **Before running any git commands** (commit, push, checkout, branch, reset, etc.), you must STOP and ask me for permission, describing exactly what command(s) you want to run and why. (You may run non-git commands like npm install/build as needed.)

Assumptions:
- Firebase project exists, Email/Password auth enabled, Firestore database created. No need to change Firebase console settings right now.
- App is hosted on GitHub Pages; do not use Firebase Hosting.

Tasks:
1) Repo reconnaissance
   - Identify where local persistence is implemented (IndexedDB layer / DB wrapper / data access layer).
   - Identify the canonical “source of truth” for workout log data locally.
   - Identify all entities that constitute “workout logs” in THIS repo (templates/exercises/sessions/sets/caches/settings/etc).
   - Identify existing export/import, migrations, and settings handling.

2) Add Firebase client setup
   - Add Firebase SDK deps as needed: `firebase/app`, `firebase/auth`, `firebase/firestore`.
   - Create `src/firebase/init.ts` (or similar) that loads/parses config from `@secrets.txt` at runtime/buildtime in a safe way.
   - Prefer Vite env vars long-term, but do not require me to reformat `secrets.txt` now. Implement a parsing layer that extracts:
     - apiKey, authDomain, projectId, storageBucket (optional), messagingSenderId, appId
   - Ensure `secrets.txt` is never bundled into the production artifact as a raw file. Extract needed fields at build time or copy values into env vars via a documented developer step. If you choose env vars, create a `.env.local.example` and document it; keep `secrets.txt` ignored.

3) Authentication UI + state
   - Implement Email/Password sign up + sign in + sign out.
   - Add a simple Auth screen/modal accessible from Settings (or a dedicated Auth route).
   - When signed out, app still works locally (offline). When signed in, sync is enabled.
   - Persist auth state; do not block workout screens from loading.

4) Firestore structure + conflict strategy (do not assume entities)
   - Namespace all user data by UID under `/users/{uid}/...`.
   - Choose an approach that fits the current local model:
     A) doc-per-record mirroring local entities, OR
     B) snapshot doc (backup-style), OR
     C) hybrid (recommended): per-record incremental sync + periodic snapshot.
   - Implement a simple conflict strategy (e.g., last-write-wins using `updatedAt`), and write a short `docs/firebase-sync.md` explaining:
     - collections/doc layout
     - fields added (updatedAt, deleted, deviceId, etc.)
     - conflict resolution rules

5) Sync engine (core requirement)
   - Implement a sync module that:
     - Detects local changes (create/update/delete) and pushes to Firestore when signed in + online.
     - Pulls remote changes and applies them locally.
     - Does not block UI.
   - Must handle offline:
     - Queue outbound changes while offline, flush when back online.
   - Add “Sync now” in Settings + a small status indicator (idle/syncing/error + last sync time).
   - Preserve existing import/export backup behavior.

6) Safety + DX
   - Add `.gitignore` protection for secrets (`secrets.txt`, `.env.local`, etc.).
   - Add README instructions for local setup and testing auth/sync.
   - Optional: add a debug panel behind a flag showing uid, last sync, queue size, last error.

Process requirements:
- Start by scanning the repo and produce a short plan:
  - what local entities/stores exist
  - where you’ll hook change tracking
  - proposed Firestore structure + conflict strategy
- Then implement.
- If you want to run any git commands, ask me first with the exact commands.

Begin now by inspecting the codebase and summarizing your findings + plan.
