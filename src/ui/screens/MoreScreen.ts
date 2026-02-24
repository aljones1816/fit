import {
  getDisplayUnit,
  setDisplayUnit,
  getThemeMode,
  setThemeMode,
  getSetting,
  getGoalWeightLbs,
  getAutoStartTimer,
  setAutoStartTimer,
} from '../../data/queries';
import type { DisplayUnit, ThemeMode } from '../../data/models';
import { lbsToKg } from '../../data/units';
import { showToast } from '../components/Toast';
import { showModal, closeModal } from '../components/Modal';
import { exportBackup, importBackup } from '../../data/backup';
import { getCurrentUser, signIn, signUp, signOut, resetPassword, sendVerificationEmail } from '../../firebase/auth';
import { isFirebaseConfigured } from '../../firebase/init';
import { navigate } from '../../router';
import { getEncryptionStatus } from '../../crypto/encryptionState';
import { clearKey } from '../../crypto/keyVault';

export async function renderMoreScreen() {
  const screen = document.getElementById('screen');
  if (!screen) return;

  const [displayUnit, themeMode, lastBackup, goalLbs, user, encStatus, autoStartTimer] = await Promise.all([
    getDisplayUnit(),
    getThemeMode(),
    getSetting<number>('backup.lastExportedAt'),
    getGoalWeightLbs(),
    Promise.resolve(getCurrentUser()),
    getEncryptionStatus(),
    getAutoStartTimer(),
  ]);

  const goalDisplay = goalLbs != null
    ? `Goal: ${displayUnit === 'kg' ? lbsToKg(goalLbs).toFixed(1) : goalLbs.toFixed(1)} ${displayUnit}`
    : 'No goal set';

  const syncSubtitle = !isFirebaseConfigured
    ? 'Cloud sync not configured'
    : user
      ? user.emailVerified
        ? `Signed in as ${user.email ?? user.uid}`
        : `${user.email ?? user.uid} — email not verified`
      : 'Sign in to enable cloud sync';

  screen.innerHTML = `
    <div>
      <h1 class="mb-2">More</h1>

      <div class="section-header mb-1">Account</div>
      <div class="card mb-2" style="padding:0;">
        <div class="more-row" id="more-profile-row">
          <span class="more-row-icon"><i class="ti ti-target"></i></span>
          <div class="more-row-body">
            <div class="more-row-title">Profile &amp; Goal Weight</div>
            <div class="more-row-subtitle">${goalDisplay}</div>
          </div>
          <span class="more-row-chevron"><i class="ti ti-chevron-right"></i></span>
        </div>
        ${isFirebaseConfigured ? `
        <div class="more-row-divider"></div>
        <div class="more-row" id="more-sync-row">
          <span class="more-row-icon"><i class="ti ti-cloud"></i></span>
          <div class="more-row-body">
            <div class="more-row-title">Account &amp; Sync</div>
            <div class="more-row-subtitle">${syncSubtitle}</div>
          </div>
          <span class="more-row-chevron"><i class="ti ti-chevron-right"></i></span>
        </div>
        <div class="more-row-divider"></div>
        <div class="more-row" id="more-encryption-row">
          <span class="more-row-icon"><i class="ti ti-lock"></i></span>
          <div class="more-row-body">
            <div class="more-row-title">Encryption (E2EE)</div>
            <div class="more-row-subtitle">${encStatus === 'off' ? 'Off — data stored in plaintext' : encStatus === 'active' ? 'Active — sync is encrypted' : 'Locked — enter passphrase to sync'}</div>
          </div>
          <span class="more-row-chevron"><i class="ti ti-chevron-right"></i></span>
        </div>
        ` : ''}
      </div>

      <div class="section-header mb-1">Data</div>
      <div class="card mb-2" style="padding:0;">
        <div class="more-row" id="more-export-row">
          <span class="more-row-icon"><i class="ti ti-download"></i></span>
          <div class="more-row-body">
            <div class="more-row-title">Export Backup</div>
            ${lastBackup ? `<div class="more-row-subtitle">Last export: ${new Date(lastBackup).toLocaleDateString()}</div>` : '<div class="more-row-subtitle">Never exported</div>'}
          </div>
        </div>
        <div class="more-row-divider"></div>
        <div class="more-row" id="more-import-row">
          <span class="more-row-icon"><i class="ti ti-upload"></i></span>
          <div class="more-row-body">
            <div class="more-row-title">Import Backup</div>
            <div class="more-row-subtitle">Replaces all local data</div>
          </div>
        </div>
      </div>

      <div class="section-header mb-1">Settings</div>
      <div class="card mb-2">
        <div class="mb-2">
          <label style="display:block;font-weight:500;margin-bottom:0.5rem;">Display Units</label>
          <div class="flex gap-1">
            <button class="btn ${displayUnit === 'lbs' ? 'btn-primary' : 'btn-secondary'}" id="unit-lbs-btn" style="flex:1;">lbs</button>
            <button class="btn ${displayUnit === 'kg'  ? 'btn-primary' : 'btn-secondary'}" id="unit-kg-btn"  style="flex:1;">kg</button>
          </div>
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:0.5rem;">Theme</label>
          <div class="flex gap-1">
            <button class="btn btn-small ${themeMode === 'dark'   ? 'btn-primary' : 'btn-secondary'}" id="theme-dark-btn">Dark</button>
            <button class="btn btn-small ${themeMode === 'light'  ? 'btn-primary' : 'btn-secondary'}" id="theme-light-btn">Light</button>
            <button class="btn btn-small ${themeMode === 'system' ? 'btn-primary' : 'btn-secondary'}" id="theme-system-btn">System</button>
          </div>
        </div>
        <div class="mt-2">
          <label style="display:block;font-weight:500;margin-bottom:0.5rem;">Auto-start Rest Timer</label>
          <div class="flex gap-1">
            <button class="btn btn-small ${autoStartTimer ? 'btn-primary' : 'btn-secondary'}" id="autotimer-on-btn">On</button>
            <button class="btn btn-small ${!autoStartTimer ? 'btn-primary' : 'btn-secondary'}" id="autotimer-off-btn">Off</button>
          </div>
        </div>
      </div>

      <div class="section-header mb-1">About</div>
      <div class="card mb-2">
        <div class="text-muted" style="font-size:0.875rem;">
          <div>SetLift · Version 1.0.0</div>
          <div>Offline-first workout logging</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('more-profile-row')?.addEventListener('click', () => navigate('profile'));
  document.getElementById('more-sync-row')?.addEventListener('click', () => handleSyncRow(user));
  document.getElementById('more-encryption-row')?.addEventListener('click', () => navigate('encryption'));

  document.getElementById('more-export-row')?.addEventListener('click', handleExport);
  document.getElementById('more-import-row')?.addEventListener('click', handleImport);

  document.getElementById('unit-lbs-btn')?.addEventListener('click', () => handleUnitChange('lbs'));
  document.getElementById('unit-kg-btn')?.addEventListener('click', () => handleUnitChange('kg'));

  document.getElementById('theme-dark-btn')?.addEventListener('click', () => handleThemeChange('dark'));
  document.getElementById('theme-light-btn')?.addEventListener('click', () => handleThemeChange('light'));
  document.getElementById('theme-system-btn')?.addEventListener('click', () => handleThemeChange('system'));

  document.getElementById('autotimer-on-btn')?.addEventListener('click', () => handleAutoTimerChange(true));
  document.getElementById('autotimer-off-btn')?.addEventListener('click', () => handleAutoTimerChange(false));
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function handleSyncRow(user: ReturnType<typeof getCurrentUser>) {
  if (!user) {
    showAuthModal('signin');
  } else if (!user.emailVerified) {
    showModal({
      title: 'Verify Your Email',
      body: `A verification email was sent to ${user.email}. Check your inbox and click the link to verify your account.`,
      buttons: [
        {
          text: 'Resend Email',
          className: 'btn btn-primary',
          closeOnClick: false,
          onClick: async () => {
            try {
              await sendVerificationEmail();
              showToast('Verification email sent', 'success');
              return true;
            } catch {
              showToast('Failed to send — try again later', 'error');
              return false;
            }
          },
        },
        { text: 'Sign Out', className: 'btn btn-secondary', closeOnClick: false, onClick: () => { closeModal(); handleSignOut(); } },
      ],
    });
  } else {
    handleSignOut();
  }
}

function showAuthModal(mode: 'signin' | 'signup') {
  const isSignUp = mode === 'signup';
  const title = isSignUp ? 'Create Account' : 'Sign In';

  const content = document.createElement('div');
  content.innerHTML = `
    <div style="margin-bottom:0.75rem;">
      <label style="display:block;font-weight:500;margin-bottom:0.25rem;">Email</label>
      <input type="email" id="auth-email" class="input" placeholder="you@example.com" style="width:100%;"
        autocomplete="${isSignUp ? 'email' : 'username'}" />
    </div>
    <div style="margin-bottom:0.25rem;">
      <label style="display:block;font-weight:500;margin-bottom:0.25rem;">Password</label>
      <input type="password" id="auth-password" class="input" placeholder="${isSignUp ? 'Choose a password' : 'Your password'}"
        style="width:100%;" autocomplete="${isSignUp ? 'new-password' : 'current-password'}" />
    </div>
    ${!isSignUp ? `
    <div style="text-align:right;margin-top:0.35rem;">
      <a id="forgot-pw-link" href="#" style="font-size:0.8rem;color:var(--accent);">Forgot password?</a>
    </div>` : ''}
    <div id="auth-error" style="color:var(--danger);font-size:0.8rem;margin-top:0.5rem;display:none;"></div>
  `;

  showModal({
    title,
    body: content,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: title,
        className: 'btn btn-primary',
        closeOnClick: false,

        onClick: async () => {
          const emailEl = document.getElementById('auth-email') as HTMLInputElement | null;
          const passwordEl = document.getElementById('auth-password') as HTMLInputElement | null;
          const errorEl = document.getElementById('auth-error');
          const email = emailEl?.value.trim() ?? '';
          const password = passwordEl?.value ?? '';
          if (!email || !password) {
            if (errorEl) { errorEl.textContent = 'Email and password are required.'; errorEl.style.display = 'block'; }
            return false;
          }
          try {
            if (isSignUp) {
              await signUp(email, password);
              const verificationSent = await sendVerificationEmail().then(() => true).catch(() => false);
              showToast(
                verificationSent
                  ? 'Account created! Check your email to verify your address.'
                  : 'Account created!',
                'success',
              );
            } else {
              await signIn(email, password);
              showToast('Signed in! Syncing your data…', 'success');
            }
            closeModal();
            renderMoreScreen();
            return true;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (errorEl) { errorEl.textContent = friendlyAuthError(msg); errorEl.style.display = 'block'; }
            return false;
          }
        },
      },
    ],
  });

  if (!isSignUp) {
    setTimeout(() => {
      document.getElementById('forgot-pw-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal();
        showForgotPasswordModal();
      });
    }, 50);
  }
}

function showForgotPasswordModal() {
  const content = document.createElement('div');
  content.innerHTML = `
    <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:0.75rem;">
      Enter your email and we'll send you a link to reset your password.
    </p>
    <div style="margin-bottom:0.25rem;">
      <label style="display:block;font-weight:500;margin-bottom:0.25rem;">Email</label>
      <input type="email" id="reset-email" class="input" placeholder="you@example.com"
             style="width:100%;" autocomplete="email" />
    </div>
    <div id="reset-error" style="color:var(--danger);font-size:0.8rem;margin-top:0.5rem;display:none;"></div>
  `;

  showModal({
    title: 'Reset Password',
    body: content,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Send Reset Email',
        className: 'btn btn-primary',
        onClick: async () => {
          const emailEl = document.getElementById('reset-email') as HTMLInputElement | null;
          const errorEl = document.getElementById('reset-error');
          const email = emailEl?.value.trim() ?? '';

          if (!email) {
            if (errorEl) { errorEl.textContent = 'Please enter your email.'; errorEl.style.display = 'block'; }
            return false;
          }

          try {
            await resetPassword(email);
            showToast('Check your email for a reset link', 'success', 5000);
            return true;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (errorEl) { errorEl.textContent = friendlyAuthError(msg); errorEl.style.display = 'block'; }
            return false;
          }
        },
      },
    ],
  });

  setTimeout(() => {
    (document.getElementById('reset-email') as HTMLInputElement | null)?.focus();
  }, 100);
}

function handleSignOut() {
  showModal({
    title: 'Sign Out',
    body: 'Sign out? Your local data will remain on this device.',
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Sign Out',
        className: 'btn btn-danger',
        onClick: async () => {
          clearKey();
          await signOut();
          showToast('Signed out', 'success');
          renderMoreScreen();
        },
      },
    ],
  });
}

function friendlyAuthError(msg: string): string {
  if (msg.includes('email-already-in-use')) return 'That email is already registered.';
  if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) return 'Incorrect email or password.';
  if (msg.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (msg.includes('invalid-email')) return 'Please enter a valid email address.';
  if (msg.includes('network-request-failed')) return 'No internet connection.';
  return msg;
}

// ─── Backup ──────────────────────────────────────────────────────────────────

async function handleExport() {
  try {
    await exportBackup();
    showToast('Backup exported successfully', 'success');
    renderMoreScreen();
  } catch {
    showToast('Export failed', 'error');
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
              setTimeout(() => window.location.reload(), 1000);
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

// ─── Settings ────────────────────────────────────────────────────────────────

async function handleUnitChange(unit: DisplayUnit) {
  await setDisplayUnit(unit);
  showToast(`Display units set to ${unit}`, 'success');
  renderMoreScreen();
}

async function handleThemeChange(mode: ThemeMode) {
  await setThemeMode(mode);
  showToast(`Theme set to ${mode}`, 'success');
  renderMoreScreen();
}

async function handleAutoTimerChange(enabled: boolean) {
  await setAutoStartTimer(enabled);
  renderMoreScreen();
}
