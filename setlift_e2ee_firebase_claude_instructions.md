# SetLift — End-to-End Encryption (E2EE) for Firebase Sync (Claude Code Instructions)

You are Claude Code working inside the SetLift repo.

## Goal

Implement **true end-to-end encryption (E2EE)** for all user-synced workout log data stored in **Firestore** such that:
- Firestore stores **only ciphertext** for protected data.
- **Firebase/Google/admins cannot read user workout data**.
- Encryption is **opt-in**, enabled **after** a user creates/signs into an account.
- If the user already has **existing synced plaintext workout logs**, the app must **migrate them to encrypted form** after opt-in.
- Offline-first UX remains: the app works fully without network; sync never blocks workout logging.
- Add strong warning: **losing passphrase = permanent data loss**.

## Hard Constraints

- Do **not** assume the exact local data model. Inspect current codebase and determine what constitutes “workout logs” for sync.
- Do not introduce heavy dependencies. Use **WebCrypto** (`window.crypto.subtle`).
- Encryption must be **authenticated** (AEAD). Use **AES-GCM**.
- Key derivation must be solid. Use **PBKDF2 + SHA-256** (WebCrypto supported).
- Do not run any git commands without asking me first.
- Never commit secrets files (e.g., `secrets.txt`, `.env.local`).

---

## 0) Threat Model & Definition of “True E2EE”

E2EE here means:
- The user’s **passphrase-derived key** is never sent to Firebase.
- Firestore documents contain ciphertext and minimal metadata (timestamps/tombstones).
- Decryption happens **only on the client** after the user provides passphrase.
- Firebase Auth is still used for identity and access control.
- Firestore rules still enforce per-user access (`/users/{uid}/...`).

---

## 1) Firestore Storage Format for Encrypted Records

You must store encrypted data under user namespace: `/users/{uid}/...`.

### Encrypted doc shape (per record)
For each synced entity record (whatever your current sync entities are), store:

```json
{
  "v": 1,
  "updatedAt": 1740000000000,
  "deleted": false,
  "iv": "base64(12 bytes)",
  "ct": "base64(ciphertext bytes)"
}
```

**Plain fields** (not encrypted):
- `v`: schema version for crypto wrapper
- `updatedAt`: for conflict resolution + incremental sync
- `deleted`: tombstone sync
- `iv`: random per-record IV
- `ct`: ciphertext (encrypted JSON payload)

Everything else (record data) goes inside `ct` as JSON.

### AAD binding (required)
Use AES-GCM Additional Authenticated Data to bind ciphertext to document identity:
- AAD string example: `uid|collectionName|docId` (UTF-8 bytes)
- Decrypt must fail if ciphertext is moved between docs.

---

## 2) Crypto Metadata Document (per user)

Create/maintain:

`/users/{uid}/crypto/meta`

Example:

```json
{
  "v": 1,
  "kdf": "PBKDF2",
  "hash": "SHA-256",
  "iterations": 210000,
  "salt": "base64(16 bytes)",
  "createdAt": 1740000000000
}
```

Notes:
- `salt` is random and **not secret**.
- `iterations` may be tuned for iPhone performance (keep configurable in meta).
- On first enablement, create this doc if missing.

---

## 3) Key Derivation + Encryption Primitives (WebCrypto)

Implement a `src/crypto/` module (or similar) with:

### Required functions
- `deriveAesKeyFromPassphrase(passphrase: string, saltB64: string, iterations: number): Promise<CryptoKey>`
- `encryptJson({ key, aad, plaintextObj }): Promise<{ ivB64, ctB64 }>`
- `decryptJson({ key, aad, ivB64, ctB64 }): Promise<any>`
- base64 helpers for Uint8Array <-> base64
- `normalizePassphrase` (optional): avoid accidental whitespace mistakes; prefer warning on leading/trailing spaces rather than auto-trimming.

### Crypto specifics
- PBKDF2: SHA-256, iterations from meta, salt 16 bytes
- AES-GCM: 256-bit key, 12-byte random IV, include AAD
- JSON.stringify is fine; no need for canonicalization.

### Performance
- Derive key **once per unlock session**, reuse in memory.
- Never derive key per record.

---

## 4) UX: Opt-in Encryption Flow (after account creation)

### Where to expose
In `More` / `Settings` (whatever exists), add:
- **“Encryption (E2EE)”** section with:
  - Status: Off / On / Locked (needs passphrase)
  - Action: “Enable encryption” when Off
  - Action: “Lock” (clear in-memory key) when On
  - Optional: “Change passphrase” (defer if too complex)

### Enable encryption: required UX steps
When user taps “Enable encryption”:
1. Require they are **signed in** (Firebase Auth)
2. Show setup screen:
   - Passphrase input
   - Confirm passphrase input
   - Warning + checkbox:
     > IMPORTANT: SetLift uses end-to-end encryption. Your passphrase is never stored or recoverable. If you lose it, you will permanently lose access to your synced data.
3. On confirm:
   - Create `/users/{uid}/crypto/meta` if missing (generate salt)
   - Derive key
   - Set local flag `encryption.enabled = true`
   - Start **migration** of existing remote plaintext records to encrypted records (see below)
4. Provide progress UI:
   - “Encrypting your existing data… X/Y”
   - Must be cancellable or at least non-blocking. If canceled mid-way, keep `encryption.enabled = true` but mark `encryption.migrationState = partial` and resume later.

### Important: “Opt-in after account creation”
Users can sync without E2EE initially (plaintext), then opt-in later.
Your code must support:
- plaintext mode (legacy)
- encrypted mode (E2EE enabled)

---

## 5) Migration Requirement (encrypt existing synced plaintext)

When a user enables E2EE and they already have data in Firestore (plaintext documents), you must convert them to encrypted wrapper format.

### Determine plaintext vs encrypted docs
A document is considered encrypted if it has:
- `ct` and `iv` fields and wrapper version `v`

Plaintext docs are those that do not match encrypted wrapper schema.

### Migration strategy
Implement a migration routine that runs:
- immediately after enabling encryption
- and on app start if `encryption.enabled` and `migrationState != complete`

Process:
1. Enumerate all user collections used for sync (inspect current sync adapter).
2. For each document:
   - If already encrypted, skip
   - Else:
     - Read plaintext doc data
     - Build AAD for this doc
     - Encrypt plaintext JSON payload into `{iv, ct}`
     - Write back encrypted wrapper with:
       - `updatedAt`: preserve existing if present, else `Date.now()`
       - `deleted`: preserve tombstone semantics if used, else false
       - `v`: 1
       - `iv`, `ct`
     - (Optional) `migratedAt` (not required)
3. Persist migration progress state locally:
   - `encryption.migrationState = complete`
   - `encryption.migratedAt = timestamp`
4. After migration, ensure sync logic reads/writes encrypted docs only.

### Write safety & resilience
- Use batched writes where feasible, respecting Firestore limits.
- Make it resumable: if app closes mid-migration, resume later.
- Migration must not block workout logging; run in background/idle with progress visible in Settings.

---

## 6) Sync Layer Changes (don’t assume data shapes)

Modify Firestore sync adapter:

### When encryption is OFF
- Preserve existing behavior: sync plaintext documents (legacy mode).

### When encryption is ON (and key unlocked)
- All outgoing writes are encrypted wrapper docs.
- Incoming docs are decrypted and applied to local storage.
- Conflict resolution uses `updatedAt` (wrapper field).
- Decrypt failures:
  - If widespread, treat as “locked/incorrect passphrase”
  - Allow retry; do not wipe remote data automatically.

### When encryption is ON but key is LOCKED
- Pause sync; show status “Locked — enter passphrase to sync”.
- App still functions locally.

### Local caching
Keep local IndexedDB as source of truth for UX speed.
- Decrypt incoming docs and store plaintext locally.
- Encrypt only when writing to Firestore.

---

## 7) Passphrase Handling & Safety

- Never store passphrase in Firestore.
- Never log passphrases.
- Prefer not to persist passphrase locally at all.
- Store only:
  - `encryption.enabled` boolean
  - `encryption.migrationState` and progress
  - `encryption.locked` state
  - optional `deviceId` for debugging/sync metadata

UX messaging:
- Clear warning: lost passphrase = permanent data loss.
- Incorrect passphrase:
  - “Could not decrypt. Check passphrase.”
  - retry allowed

---

## 8) Firestore Rules Reminder (not implemented here)

Assume rules restrict access to user namespace:
- `/users/{uid}/{document=**}` only if `request.auth.uid == uid`

Your code should use `/users/{uid}/...` paths accordingly.

---

## 9) Testing Plan (must document and support)

Add a developer checklist (docs):

1. Create account; sync plaintext records (baseline).
2. Enable E2EE:
   - crypto/meta created
   - migration converts docs to encrypted wrapper
3. Sign out/in on same device:
   - requires passphrase to sync
4. Sign in on second device:
   - after passphrase unlock, can decrypt and populate local DB
5. Verify Firestore console shows ciphertext for migrated docs.
6. Verify app works offline during migration.
7. Verify wrong passphrase does not corrupt data.

---

## 10) Deliverables

- `src/crypto/*` implementing PBKDF2 + AES-GCM
- UI:
  - Enable E2EE setup + warning checkbox
  - Unlock flow for E2EE users
  - Migration progress status (X/Y + resume)
  - Sync status reflects Locked/Encrypting
- Firestore adapter updated for plaintext + encrypted modes
- `docs/e2ee.md` describing:
  - threat model
  - schemas
  - limitations (lost passphrase = permanent data loss)

---

## 11) Start Here

1) Scan repo and identify:
- current sync collections and document shapes
- where to hook encryption/decryption
- how local change tracking works

2) Propose the exact migration plan for THIS repo’s collections, including progress tracking approach.

Then implement incrementally.

Do not commit without permission.
