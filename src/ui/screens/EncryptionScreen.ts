import { navigate } from '../../router';
import { showToast } from '../components/Toast';
import { getCurrentUser } from '../../firebase/auth';
import {
  fetchCryptoMeta,
  createCryptoMeta,
  saveCryptoMetaVerification,
} from '../../firebase/cryptoMeta';
import {
  deriveAesKeyFromPassphrase,
  createVerificationToken,
  verifyPassphrase,
} from '../../crypto/engine';
import { makeAad } from '../../crypto/codec';
import { setKey, clearKey } from '../../crypto/keyVault';
import {
  getEncryptionConfig,
  setEncryptionEnabled,
  setMigrationState,
  getEncryptionStatus,
} from '../../crypto/encryptionState';
import { migrateToEncrypted } from '../../firebase/migration';
import { syncNow } from '../../firebase/sync';

export async function renderEncryptionScreen() {
  const screen = document.getElementById('screen');
  if (!screen) return;

  const status = await getEncryptionStatus();
  const config = await getEncryptionConfig();

  screen.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;">
        <button id="enc-back-btn" class="btn btn-secondary btn-small" style="display:flex;align-items:center;gap:0.25rem;padding:0.4rem 0.75rem;">
          <i class="ti ti-chevron-left" style="font-size:1rem;"></i> More
        </button>
        <h1 style="font-size:1.5rem;font-weight:700;">Encryption (E2EE)</h1>
      </div>

      ${buildStatusCard(status, config)}
      ${buildInfoCard()}
    </div>
  `;

  document.getElementById('enc-back-btn')?.addEventListener('click', () => navigate('more'));

  if (status === 'off') {
    document.getElementById('enc-enable-btn')?.addEventListener('click', showEnableFlow);
  } else if (status === 'locked') {
    document.getElementById('enc-unlock-btn')?.addEventListener('click', showUnlockFlow);
  } else if (status === 'active') {
    document.getElementById('enc-lock-btn')?.addEventListener('click', handleLock);
  }
}

function buildStatusCard(
  status: 'off' | 'active' | 'locked',
  config: Awaited<ReturnType<typeof getEncryptionConfig>>,
): string {
  if (status === 'off') {
    return `
      <div class="card mb-2">
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
          <span style="font-size:1.5rem;">🔓</span>
          <div>
            <div style="font-weight:600;">Encryption is off</div>
            <div class="text-muted" style="font-size:0.875rem;">Sync data is stored in plaintext on Firebase</div>
          </div>
        </div>
        <button id="enc-enable-btn" class="btn btn-primary" style="width:100%;">Enable End-to-End Encryption</button>
      </div>
    `;
  }

  if (status === 'locked') {
    const migNote = config.migrationState !== 'complete'
      ? `<div class="text-muted" style="font-size:0.8rem;margin-top:0.5rem;">Migration not complete — enter passphrase to resume.</div>`
      : '';
    return `
      <div class="card mb-2">
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
          <span style="font-size:1.5rem;">🔒</span>
          <div>
            <div style="font-weight:600;">Locked — enter passphrase to sync</div>
            <div class="text-muted" style="font-size:0.875rem;">Sync is paused until you unlock.</div>
            ${migNote}
          </div>
        </div>
        <button id="enc-unlock-btn" class="btn btn-primary" style="width:100%;">Unlock</button>
      </div>
    `;
  }

  // active
  const migNote = config.migrationState === 'complete'
    ? `<div class="text-muted" style="font-size:0.8rem;">Migration complete.</div>`
    : `<div style="color:var(--warning);font-size:0.8rem;">Migration in progress or not started.</div>`;

  return `
    <div class="card mb-2">
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
        <span style="font-size:1.5rem;">🔐</span>
        <div>
          <div style="font-weight:600;">Encryption active</div>
          <div class="text-muted" style="font-size:0.875rem;">All synced data is end-to-end encrypted.</div>
          ${migNote}
        </div>
      </div>
      <button id="enc-lock-btn" class="btn btn-secondary" style="width:100%;">Lock (clear passphrase from memory)</button>
    </div>
  `;
}

function buildInfoCard(): string {
  return `
    <div class="card mb-2" style="border-left:3px solid var(--warning);padding-left:1rem;">
      <div style="font-weight:600;margin-bottom:0.5rem;">Important</div>
      <div style="font-size:0.875rem;color:var(--text-secondary);line-height:1.5;">
        SetLift uses end-to-end encryption. Your passphrase is <strong>never stored or recoverable</strong>.
        If you lose your passphrase, you will <strong>permanently lose access to your synced data</strong>.
        Your local data on this device is unaffected.
      </div>
    </div>
  `;
}

// ─── Enable flow ─────────────────────────────────────────────────────────────

function showEnableFlow() {
  const user = getCurrentUser();
  if (!user) {
    showToast('You must be signed in to enable encryption', 'error');
    return;
  }

  const screen = document.getElementById('screen');
  if (!screen) return;

  screen.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;">
        <button id="enc-setup-back" class="btn btn-secondary btn-small" style="display:flex;align-items:center;gap:0.25rem;padding:0.4rem 0.75rem;">
          <i class="ti ti-chevron-left" style="font-size:1rem;"></i> Back
        </button>
        <h1 style="font-size:1.5rem;font-weight:700;">Set Up Encryption</h1>
      </div>

      <div class="card mb-2" style="border-left:3px solid var(--danger);padding-left:1rem;">
        <div style="font-weight:600;color:var(--danger);margin-bottom:0.5rem;">⚠️ Warning</div>
        <div style="font-size:0.875rem;line-height:1.6;">
          IMPORTANT: SetLift uses end-to-end encryption. Your passphrase is <strong>never stored or recoverable</strong>.
          If you lose it, you will <strong>permanently lose access to your synced data</strong>.
          Your local data on this device is always kept in plaintext.
        </div>
      </div>

      <div class="card mb-2">
        <div class="mb-2">
          <label style="display:block;font-weight:500;margin-bottom:0.25rem;">Passphrase</label>
          <input type="password" id="enc-passphrase" class="input" placeholder="Choose a strong passphrase"
            style="width:100%;" autocomplete="new-password" />
        </div>
        <div class="mb-2">
          <label style="display:block;font-weight:500;margin-bottom:0.25rem;">Confirm Passphrase</label>
          <input type="password" id="enc-passphrase-confirm" class="input" placeholder="Repeat passphrase"
            style="width:100%;" autocomplete="new-password" />
        </div>
        <div style="display:flex;align-items:flex-start;gap:0.75rem;margin-bottom:1rem;">
          <input type="checkbox" id="enc-warning-check" style="margin-top:0.2rem;width:1.1rem;height:1.1rem;cursor:pointer;" />
          <label for="enc-warning-check" style="font-size:0.875rem;line-height:1.5;cursor:pointer;">
            I understand that if I lose my passphrase, my synced data cannot be recovered.
          </label>
        </div>
        <div id="enc-setup-error" style="color:var(--danger);font-size:0.875rem;margin-bottom:0.75rem;display:none;"></div>
        <button id="enc-setup-confirm" class="btn btn-primary" style="width:100%;">Enable Encryption</button>
      </div>
    </div>
  `;

  document.getElementById('enc-setup-back')?.addEventListener('click', () => renderEncryptionScreen());
  document.getElementById('enc-setup-confirm')?.addEventListener('click', () => handleSetupConfirm(user.uid));
}

async function handleSetupConfirm(uid: string) {
  const passEl = document.getElementById('enc-passphrase') as HTMLInputElement | null;
  const confirmEl = document.getElementById('enc-passphrase-confirm') as HTMLInputElement | null;
  const checkEl = document.getElementById('enc-warning-check') as HTMLInputElement | null;
  const errorEl = document.getElementById('enc-setup-error');

  const passphrase = passEl?.value ?? '';
  const confirm = confirmEl?.value ?? '';

  function showError(msg: string) {
    if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
  }

  if (!passphrase) return showError('Please enter a passphrase.');
  if (passphrase !== confirm) return showError('Passphrases do not match.');
  if (!checkEl?.checked) return showError('Please acknowledge the warning.');

  // Warn on leading/trailing whitespace
  if (passphrase !== passphrase.trim()) {
    showError('Your passphrase has leading or trailing spaces. Double-check this is intentional.');
    return;
  }

  const btn = document.getElementById('enc-setup-confirm') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = 'Setting up…'; }

  try {
    // Get or create crypto/meta
    let meta = await fetchCryptoMeta(uid);
    if (!meta) meta = await createCryptoMeta(uid);

    // Derive key
    const key = await deriveAesKeyFromPassphrase(passphrase, meta.salt, meta.iterations);

    // Create verification token
    const verifyAad = makeAad(uid, 'crypto', 'meta|verify');
    const { ivB64, ctB64 } = await createVerificationToken(key, verifyAad);
    await saveCryptoMetaVerification(uid, meta, ivB64, ctB64);

    // Persist state + load key
    await setEncryptionEnabled(true);
    await setMigrationState('none');
    setKey(key);

    // Kick off migration in the background
    renderMigrationProgress(uid, key);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showError(`Setup failed: ${msg}`);
    if (btn) { btn.disabled = false; btn.textContent = 'Enable Encryption'; }
  }
}

// ─── Migration progress UI ───────────────────────────────────────────────────

function renderMigrationProgress(uid: string, key: CryptoKey) {
  const screen = document.getElementById('screen');
  if (!screen) return;

  screen.innerHTML = `
    <div>
      <h1 style="font-size:1.5rem;font-weight:700;margin-bottom:1.5rem;">Encrypting Your Data</h1>

      <div class="card mb-2">
        <div id="mig-status" style="margin-bottom:1rem;">Scanning your data…</div>
        <div style="background:var(--bg-secondary);border-radius:8px;height:8px;overflow:hidden;">
          <div id="mig-bar" style="height:100%;width:0%;background:var(--accent);transition:width 0.3s;"></div>
        </div>
        <div id="mig-count" class="text-muted" style="font-size:0.8rem;margin-top:0.5rem;"></div>
      </div>

      <div class="card" style="border-left:3px solid var(--warning);padding-left:1rem;">
        <div style="font-size:0.875rem;color:var(--text-secondary);">
          Do not close the app. Your local data is safe — only the cloud copy is being updated.
        </div>
      </div>
    </div>
  `;

  migrateToEncrypted(uid, key, (progress) => {
    const statusEl = document.getElementById('mig-status');
    const barEl = document.getElementById('mig-bar') as HTMLElement | null;
    const countEl = document.getElementById('mig-count');

    if (progress.total === 0) {
      if (statusEl) statusEl.textContent = 'No existing data to migrate.';
    } else {
      const pct = Math.round((progress.done / progress.total) * 100);
      if (statusEl) statusEl.textContent = `Encrypting… ${pct}%`;
      if (barEl) barEl.style.width = `${pct}%`;
      if (countEl) countEl.textContent = `${progress.done} / ${progress.total} records`;
    }
  }).then(() => {
    showToast('Encryption enabled!', 'success');
    syncNow().catch(() => {});
    renderEncryptionScreen();
  }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Migration error: ${msg}`, 'error');
    renderEncryptionScreen();
  });
}

// ─── Unlock flow ─────────────────────────────────────────────────────────────

function showUnlockFlow() {
  const user = getCurrentUser();
  if (!user) {
    showToast('You must be signed in to unlock encryption', 'error');
    return;
  }

  const screen = document.getElementById('screen');
  if (!screen) return;

  screen.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;">
        <button id="enc-unlock-back" class="btn btn-secondary btn-small" style="display:flex;align-items:center;gap:0.25rem;padding:0.4rem 0.75rem;">
          <i class="ti ti-chevron-left" style="font-size:1rem;"></i> Back
        </button>
        <h1 style="font-size:1.5rem;font-weight:700;">Unlock Encryption</h1>
      </div>

      <div class="card mb-2">
        <div class="mb-2">
          <label style="display:block;font-weight:500;margin-bottom:0.25rem;">Passphrase</label>
          <input type="password" id="enc-unlock-passphrase" class="input" placeholder="Your passphrase"
            style="width:100%;" autocomplete="current-password" />
        </div>
        <div id="enc-unlock-error" style="color:var(--danger);font-size:0.875rem;margin-bottom:0.75rem;display:none;"></div>
        <button id="enc-unlock-confirm" class="btn btn-primary" style="width:100%;">Unlock</button>
      </div>
    </div>
  `;

  document.getElementById('enc-unlock-back')?.addEventListener('click', () => renderEncryptionScreen());
  document.getElementById('enc-unlock-confirm')?.addEventListener('click', () => handleUnlockConfirm(user.uid));
}

async function handleUnlockConfirm(uid: string) {
  const passEl = document.getElementById('enc-unlock-passphrase') as HTMLInputElement | null;
  const errorEl = document.getElementById('enc-unlock-error');

  const passphrase = passEl?.value ?? '';
  if (!passphrase) {
    if (errorEl) { errorEl.textContent = 'Enter your passphrase.'; errorEl.style.display = 'block'; }
    return;
  }

  const btn = document.getElementById('enc-unlock-confirm') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = 'Unlocking…'; }

  try {
    const meta = await fetchCryptoMeta(uid);
    if (!meta) throw new Error('No encryption metadata found. Re-enable encryption.');

    const key = await deriveAesKeyFromPassphrase(passphrase, meta.salt, meta.iterations);

    // Verify passphrase if we have a token
    if (meta.verifyIv && meta.verifyCt) {
      const verifyAad = makeAad(uid, 'crypto', 'meta|verify');
      const ok = await verifyPassphrase(key, verifyAad, meta.verifyIv, meta.verifyCt);
      if (!ok) {
        if (errorEl) { errorEl.textContent = 'Could not decrypt. Check passphrase.'; errorEl.style.display = 'block'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }
        return;
      }
    }

    setKey(key);

    // Resume migration if incomplete
    const config = await getEncryptionConfig();
    if (config.migrationState !== 'complete') {
      renderMigrationProgress(uid, key);
      return;
    }

    showToast('Unlocked! Syncing…', 'success');
    syncNow().catch(() => {});
    renderEncryptionScreen();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }
  }
}

// ─── Lock ─────────────────────────────────────────────────────────────────────

function handleLock() {
  clearKey();
  showToast('Locked — sync paused until unlocked', 'success');
  renderEncryptionScreen();
}
