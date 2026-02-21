import {
  getAllSessions,
  getEndedSessions,
  getDisplayUnit,
  setDisplayUnit,
  getThemeMode,
  setThemeMode,
  getSetting,
} from '../../data/queries';
import type { DisplayUnit, ThemeMode } from '../../data/models';
import { showToast } from '../components/Toast';
import { showModal } from '../components/Modal';
import { renderHeatmap } from '../components/Heatmap';
import { exportBackup, importBackup } from '../../data/backup';
import { getCurrentUser, signIn, signUp, signOut } from '../../firebase/auth';
import { getSyncStatus } from '../../firebase/sync';
import { isFirebaseConfigured } from '../../firebase/init';

export async function renderStatsScreen() {
  const screen = document.getElementById('screen');
  if (!screen) return;

  const sessions = await getAllSessions();
  const endedSessions = await getEndedSessions();

  // Count this month
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthCount = endedSessions.filter(s => s.endedAt && s.endedAt >= thisMonthStart.getTime()).length;

  const displayUnit = await getDisplayUnit();
  const themeMode = await getThemeMode();
  const lastBackup = await getSetting<number>('backup.lastExportedAt');

  const user = getCurrentUser();
  const syncStatus = getSyncStatus();

  screen.innerHTML = `
    <div>
      <h1 class="mb-2">Stats</h1>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Workout Stats</h3>
        <div class="mb-2">
          <div style="font-size: 2rem; font-weight: 600;">${endedSessions.length}</div>
          <div class="text-muted" style="font-size: 0.875rem;">Total Workouts</div>
        </div>
        <div>
          <div style="font-size: 1.5rem; font-weight: 600;">${thisMonthCount}</div>
          <div class="text-muted" style="font-size: 0.875rem;">This Month</div>
        </div>
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Activity Calendar</h3>
        ${renderHeatmap(sessions)}
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Account</h3>
        ${!isFirebaseConfigured
          ? renderSyncUnavailableUI()
          : user
            ? renderSignedInUI(user.email ?? user.uid, syncStatus)
            : renderSignedOutUI()}
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Settings</h3>

        <div class="mb-2">
          <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Display Units</label>
          <div class="flex gap-1">
            <button
              class="btn ${displayUnit === 'lbs' ? 'btn-primary' : 'btn-secondary'}"
              id="unit-lbs-btn"
              style="flex: 1;"
            >
              lbs
            </button>
            <button
              class="btn ${displayUnit === 'kg' ? 'btn-primary' : 'btn-secondary'}"
              id="unit-kg-btn"
              style="flex: 1;"
            >
              kg
            </button>
          </div>
        </div>

        <div class="mb-2">
          <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Theme</label>
          <div class="flex gap-1">
            <button
              class="btn btn-small ${themeMode === 'dark' ? 'btn-primary' : 'btn-secondary'}"
              id="theme-dark-btn"
            >
              Dark
            </button>
            <button
              class="btn btn-small ${themeMode === 'light' ? 'btn-primary' : 'btn-secondary'}"
              id="theme-light-btn"
            >
              Light
            </button>
            <button
              class="btn btn-small ${themeMode === 'system' ? 'btn-primary' : 'btn-secondary'}"
              id="theme-system-btn"
            >
              System
            </button>
          </div>
        </div>
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Backup & Data</h3>

        <div class="mb-2">
          ${lastBackup ? `<div class="text-muted" style="font-size: 0.875rem; margin-bottom: 0.5rem;">Last backup: ${new Date(lastBackup).toLocaleDateString()}</div>` : ''}
          <button class="btn btn-primary" id="export-btn" style="width: 100%; margin-bottom: 0.5rem;">
            Export Backup
          </button>
          <button class="btn btn-secondary" id="import-btn" style="width: 100%;">
            Import Backup
          </button>
        </div>

        <div class="text-muted" style="font-size: 0.75rem; line-height: 1.4;">
          Data is stored locally on your device. Sign in above to enable automatic cloud backup and sync across devices.
        </div>
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-2">About</h3>
        <div class="text-muted" style="font-size: 0.875rem;">
          <div>Version: 1.0.0</div>
          <div>Offline-first workout logging PWA</div>
        </div>
      </div>
    </div>
  `;

  // Auth event listeners
  document.getElementById('sync-sign-in-btn')?.addEventListener('click', handleShowSignIn);
  document.getElementById('sync-sign-up-btn')?.addEventListener('click', handleShowSignUp);
  document.getElementById('sync-sign-out-btn')?.addEventListener('click', handleSignOut);

  // Settings event listeners
  document.getElementById('unit-lbs-btn')?.addEventListener('click', () => handleUnitChange('lbs'));
  document.getElementById('unit-kg-btn')?.addEventListener('click', () => handleUnitChange('kg'));

  document.getElementById('theme-dark-btn')?.addEventListener('click', () => handleThemeChange('dark'));
  document.getElementById('theme-light-btn')?.addEventListener('click', () => handleThemeChange('light'));
  document.getElementById('theme-system-btn')?.addEventListener('click', () => handleThemeChange('system'));

  document.getElementById('export-btn')?.addEventListener('click', handleExport);
  document.getElementById('import-btn')?.addEventListener('click', handleImport);

}

function renderSignedOutUI(): string {
  return `
    <p class="text-muted" style="font-size: 0.875rem; margin-bottom: 0.75rem;">
      Sign in to sync your workouts across devices and back up your data to the cloud.
    </p>
    <div class="flex gap-1">
      <button class="btn btn-primary" id="sync-sign-in-btn" style="flex: 1;">Sign In</button>
      <button class="btn btn-secondary" id="sync-sign-up-btn" style="flex: 1;">Create Account</button>
    </div>
  `;
}

function renderSyncUnavailableUI(): string {
  return `
    <p class="text-muted" style="font-size: 0.875rem; margin-bottom: 0;">
      Cloud sync is not configured in this build. The app is running in local-only mode.
    </p>
  `;
}

function renderSignedInUI(
  email: string,
  syncStatus: ReturnType<typeof getSyncStatus>,
): string {
  return `
    <div style="font-size: 0.875rem; margin-bottom: 0.75rem;">
      <span class="text-muted">Signed in as</span>
      <span style="margin-left: 0.25rem; font-weight: 500;">${email}</span>
    </div>
    ${syncStatus.lastSyncedAt ? `
      <div class="text-muted" style="font-size: 0.8rem; margin-bottom: 0.75rem;">
        Last synced ${formatRelativeTime(syncStatus.lastSyncedAt)}
      </div>
    ` : ''}
    <button class="btn btn-secondary" id="sync-sign-out-btn" style="width: 100%;">Sign Out</button>
  `;
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function showAuthModal(mode: 'signin' | 'signup') {
  const isSignUp = mode === 'signup';
  const title = isSignUp ? 'Create Account' : 'Sign In';

  const content = document.createElement('div');
  content.innerHTML = `
    <div style="margin-bottom: 0.75rem;">
      <label style="display: block; font-weight: 500; margin-bottom: 0.25rem;">Email</label>
      <input
        type="email"
        id="auth-email"
        class="input"
        placeholder="you@example.com"
        style="width: 100%;"
        autocomplete="${isSignUp ? 'email' : 'username'}"
      />
    </div>
    <div style="margin-bottom: 0.25rem;">
      <label style="display: block; font-weight: 500; margin-bottom: 0.25rem;">Password</label>
      <input
        type="password"
        id="auth-password"
        class="input"
        placeholder="${isSignUp ? 'Choose a password' : 'Your password'}"
        style="width: 100%;"
        autocomplete="${isSignUp ? 'new-password' : 'current-password'}"
      />
    </div>
    <div id="auth-error" style="color: var(--danger); font-size: 0.8rem; margin-top: 0.5rem; display: none;"></div>
  `;

  showModal({
    title,
    body: content.innerHTML,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: title,
        className: 'btn btn-primary',
        onClick: async () => {
          const emailEl = document.getElementById('auth-email') as HTMLInputElement | null;
          const passwordEl = document.getElementById('auth-password') as HTMLInputElement | null;
          const errorEl = document.getElementById('auth-error');

          const email = emailEl?.value.trim() ?? '';
          const password = passwordEl?.value ?? '';

          if (!email || !password) {
            if (errorEl) { errorEl.textContent = 'Email and password are required.'; errorEl.style.display = 'block'; }
            return;
          }

          try {
            if (isSignUp) {
              await signUp(email, password);
              showToast('Account created! Syncing your data...', 'success');
            } else {
              await signIn(email, password);
              showToast('Signed in! Syncing your data...', 'success');
            }
            renderStatsScreen();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const friendly = friendlyAuthError(msg);
            if (errorEl) { errorEl.textContent = friendly; errorEl.style.display = 'block'; }
            // Re-throw so the modal stays open — but modal closes automatically, so we just show a toast too
            showToast(friendly, 'error');
          }
        },
      },
    ],
  });
}

function friendlyAuthError(msg: string): string {
  if (msg.includes('email-already-in-use')) return 'That email is already registered.';
  if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
    return 'Incorrect email or password.';
  }
  if (msg.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (msg.includes('invalid-email')) return 'Please enter a valid email address.';
  if (msg.includes('network-request-failed')) return 'No internet connection.';
  return msg;
}

async function handleShowSignIn() {
  showAuthModal('signin');
}

async function handleShowSignUp() {
  showAuthModal('signup');
}

async function handleSignOut() {
  showModal({
    title: 'Sign Out',
    body: 'Sign out? Your local data will remain on this device. Sign back in to re-enable sync.',
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Sign Out',
        className: 'btn btn-danger',
        onClick: async () => {
          await signOut();
          showToast('Signed out', 'success');
          renderStatsScreen();
        },
      },
    ],
  });
}

async function handleUnitChange(unit: DisplayUnit) {
  await setDisplayUnit(unit);
  showToast(`Display units set to ${unit}`, 'success');
  renderStatsScreen();
}

async function handleThemeChange(mode: ThemeMode) {
  await setThemeMode(mode);
  showToast(`Theme set to ${mode}`, 'success');
  renderStatsScreen();
}

async function handleExport() {
  try {
    await exportBackup();
    showToast('Backup exported successfully', 'success');
    renderStatsScreen();
  } catch (error) {
    showToast('Export failed', 'error');
    console.error(error);
  }
}

function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    showModal({
      title: 'Import Backup',
      body: 'Replace your data with this backup? This cannot be undone.',
      buttons: [
        { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
        {
          text: 'Import',
          className: 'btn btn-danger',
          onClick: async () => {
            const success = await importBackup(file);
            if (success) {
              showToast('Backup imported successfully', 'success');
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            } else {
              showToast('Invalid backup file', 'error');
            }
          },
        },
      ],
    });
  };

  input.click();
}
