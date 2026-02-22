// In-memory key store — key is never persisted.
// Cleared on page unload and on explicit lock.

let _key: CryptoKey | null = null;

export function setKey(key: CryptoKey): void {
  _key = key;
}

export function getKey(): CryptoKey | null {
  return _key;
}

export function clearKey(): void {
  _key = null;
}

export function isKeyLoaded(): boolean {
  return _key !== null;
}

// Call once at app startup — ensures key is wiped if the tab is closed.
export function registerKeyCleanupOnUnload(): void {
  window.addEventListener('pagehide', () => { _key = null; });
}
