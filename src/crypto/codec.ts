// ─── Base64 helpers ──────────────────────────────────────────────────────────

export function u8ToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function b64ToU8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── AAD construction ─────────────────────────────────────────────────────────
// Binds ciphertext to its document identity so moving a doc between paths fails
// decryption.

export function makeAad(uid: string, collection: string, docId: string): Uint8Array {
  return new TextEncoder().encode(`${uid}|${collection}|${docId}`);
}
