import { u8ToB64, b64ToU8 } from './codec';

// TypeScript's lib.dom.d.ts types Uint8Array as Uint8Array<ArrayBufferLike>
// but WebCrypto APIs require ArrayBufferView<ArrayBuffer>. Cast helper:
function asBufferSource(u8: Uint8Array): Uint8Array<ArrayBuffer> {
  return u8 as unknown as Uint8Array<ArrayBuffer>;
}

export const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// ─── Salt generation ─────────────────────────────────────────────────────────

export function generateSalt(): string {
  return u8ToB64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

// ─── Key derivation ───────────────────────────────────────────────────────────
// Derive once per session; reuse the returned CryptoKey for all encrypt/decrypt.

export async function deriveAesKeyFromPassphrase(
  passphrase: string,
  saltB64: string,
  iterations: number,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: asBufferSource(b64ToU8(saltB64)),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────────────────

export async function encryptJson(opts: {
  key: CryptoKey;
  aad: Uint8Array;
  plaintextObj: unknown;
}): Promise<{ ivB64: string; ctB64: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(opts.plaintextObj));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv), additionalData: asBufferSource(opts.aad) },
    opts.key,
    asBufferSource(plaintext),
  );
  return { ivB64: u8ToB64(iv), ctB64: u8ToB64(new Uint8Array(ciphertext)) };
}

export async function decryptJson(opts: {
  key: CryptoKey;
  aad: Uint8Array;
  ivB64: string;
  ctB64: string;
}): Promise<unknown> {
  const iv = b64ToU8(opts.ivB64);
  const ct = b64ToU8(opts.ctB64);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv), additionalData: asBufferSource(opts.aad) },
    opts.key,
    asBufferSource(ct),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// ─── Passphrase verification token ───────────────────────────────────────────
// We encrypt a known sentinel with AAD bound to the crypto/meta doc.
// On unlock we re-encrypt nothing — instead we try decrypting the sentinel.

const SENTINEL = 'setlift-verify-ok';

export async function createVerificationToken(
  key: CryptoKey,
  aad: Uint8Array,
): Promise<{ ivB64: string; ctB64: string }> {
  return encryptJson({ key, aad, plaintextObj: SENTINEL });
}

export async function verifyPassphrase(
  key: CryptoKey,
  aad: Uint8Array,
  ivB64: string,
  ctB64: string,
): Promise<boolean> {
  try {
    const result = await decryptJson({ key, aad, ivB64, ctB64 });
    return result === SENTINEL;
  } catch {
    return false;
  }
}
