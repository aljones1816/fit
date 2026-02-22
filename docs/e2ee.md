# SetLift — End-to-End Encryption (E2EE)

## Threat Model

E2EE here means:

- The user's **passphrase-derived key** is never sent to Firebase.
- Firestore documents contain only ciphertext and minimal metadata (timestamps/tombstones).
- Decryption happens **only on the client** after the user provides their passphrase.
- Firebase/Google/admins cannot read workout data.
- Firebase Auth is still used for identity and access control.
- Firestore rules still enforce per-user access (`/users/{uid}/...`).

**Out of scope:** Device-level security, metadata analysis (e.g. number of workouts), replay attacks.

---

## Key Derivation

- Algorithm: **PBKDF2** with SHA-256
- Iterations: 210,000 (stored in `crypto/meta` for future tunability)
- Salt: 16 random bytes, base64-encoded, stored in `crypto/meta` (not secret)
- Output: AES-GCM 256-bit `CryptoKey` (non-extractable)
- The key is derived **once per session** and held in memory only. It is never persisted.

---

## Encryption

- Algorithm: **AES-GCM** with 256-bit key
- IV: 12 random bytes per record, stored alongside ciphertext
- Additional Authenticated Data (AAD): `${uid}|${collection}|${docId}` (UTF-8)
  — binding ciphertext to its document identity so moving a doc across paths fails decryption
- Payload: `JSON.stringify(recordData)` → encrypted bytes → base64

---

## Firestore Schema

### Encrypted document (per record)

```json
{
  "v": 1,
  "updatedAt": 1740000000000,
  "deleted": false,
  "iv": "<base64 12 bytes>",
  "ct": "<base64 ciphertext>"
}
```

Plain fields (not encrypted): `v`, `updatedAt`, `deleted`, `iv`, `ct`.
Everything else (entity data) is inside `ct`.

### Plaintext document (legacy / E2EE off)

```json
{
  "id": "...",
  "...": "entity fields",
  "_deleted": false,
  "_updatedAt": 1740000000000
}
```

### Crypto metadata (`/users/{uid}/crypto/meta`)

```json
{
  "v": 1,
  "kdf": "PBKDF2",
  "hash": "SHA-256",
  "iterations": 210000,
  "salt": "<base64 16 bytes>",
  "createdAt": 1740000000000,
  "verifyIv": "<base64>",
  "verifyCt": "<base64>"
}
```

`verifyIv` / `verifyCt` is an AES-GCM-encrypted sentinel (`"setlift-verify-ok"`) used to validate the passphrase on unlock without needing to decrypt real data.

---

## Modes

| Mode | Description |
|------|-------------|
| **Off** | Sync uses plaintext docs (`_updatedAt` / `_deleted`). |
| **Active** | Key is in memory. Writes are encrypted; reads are decrypted. |
| **Locked** | Encryption is enabled but key is cleared. Sync is paused. |

---

## Migration (plaintext → encrypted)

When a user enables E2EE and already has plaintext data in Firestore:

1. All plaintext docs are enumerated across all 5 synced collections.
2. Each doc is encrypted and written back with the encrypted wrapper format.
3. Legacy sync fields (`_deleted`, `_updatedAt`) are stripped from the payload and mapped to `deleted` / `updatedAt` in the wrapper.
4. Writes use Firestore batched writes (up to 400 docs per batch).
5. Migration state is persisted locally (`encryption.migrationState`): `none` → `partial` → `complete`.
6. After completion, `sync.lastPulledAt` is reset to 0 so the next pull fetches all fresh encrypted docs.
7. If the app is closed mid-migration, re-opening and unlocking resumes from the beginning (safe — already-encrypted docs are skipped).

---

## Passphrase Safety

- The passphrase is **never** stored in Firestore, IndexedDB, or localStorage.
- The derived key is held in a module-level variable and cleared on `pagehide`.
- Explicit lock (from Settings) also clears the key.
- Sign-out clears the key.
- Incorrect passphrase: AES-GCM authentication tag validation fails → user sees "Could not decrypt. Check passphrase."

**Lost passphrase = permanent loss of access to synced data.**
Local IndexedDB data is always in plaintext and is unaffected.

---

## Limitations

- **Lost passphrase = permanent data loss** for synced records. No recovery mechanism.
- "Change passphrase" is not yet implemented (would require re-encrypting all remote docs).
- Local data in IndexedDB is always plaintext (by design — local threat model is separate).
- If encryption is enabled, the `updatedAt` Firestore field name differs from the plaintext `_updatedAt`. Mixed-mode pulls are handled by skipping mismatched docs.

---

## Developer Testing Checklist

1. Create account; sync plaintext records (baseline). Verify Firestore shows plaintext fields.
2. Enable E2EE:
   - `crypto/meta` created with salt + verification token.
   - Migration progress screen shown; docs converted to `{v,updatedAt,deleted,iv,ct}`.
3. Lock and unlock:
   - Tap "Lock" → `SyncStatus` becomes `locked`.
   - Re-enter passphrase → key loaded, sync resumes.
4. Verify wrong passphrase shows "Could not decrypt" error, no data corrupted.
5. Sign out / sign in on same device:
   - Encryption remains enabled (persisted in IDB `settings`).
   - App shows "Locked" state; requires passphrase to sync.
6. Sign in on a second device:
   - Encryption state detected (enabled, migration complete).
   - App shows locked state; after passphrase unlock, pulls encrypted docs and populates local DB.
7. Verify Firestore console shows `ct` / `iv` fields for all migrated docs.
8. Verify app works offline during migration (local data unchanged).
