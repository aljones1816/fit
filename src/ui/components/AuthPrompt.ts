import { signIn, signUp } from '../../firebase/auth';
import { initialSync } from '../../firebase/sync';
import { showToast } from './Toast';

type AuthMode = 'signin' | 'signup';

let _overlay: HTMLElement | null = null;

export function showAuthPrompt(): void {
  if (_overlay) return;
  _overlay = buildOverlay();
  document.body.appendChild(_overlay);
  _overlay.classList.add('auth-prompt--visible');
}

export function closeAuthPrompt(): void {
  if (!_overlay) return;
  _overlay.classList.remove('auth-prompt--visible');
  const el = _overlay;
  _overlay = null;
  setTimeout(() => el.remove(), 340);
}

function buildOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'auth-prompt-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'auth-prompt-sheet';
  overlay.appendChild(sheet);

  renderInto(sheet, 'signin');
  return overlay;
}

function renderInto(sheet: HTMLElement, mode: AuthMode): void {
  const isSignUp = mode === 'signup';

  sheet.innerHTML = `
    <div class="auth-handle"></div>

    <div class="auth-icon-wrap">
      <div class="auth-app-icon">🏋️</div>
      <div class="auth-app-name">SetLift</div>
      <div class="auth-app-subtitle">
        ${isSignUp ? 'Create an account to sync your workouts.' : 'Sign in to sync your workouts across devices.'}
      </div>
    </div>

    <div class="auth-fields">
      <div class="auth-field-row">
        <input
          type="email"
          id="auth-email"
          class="auth-field"
          placeholder="Email"
          autocomplete="${isSignUp ? 'email' : 'username'}"
          inputmode="email"
        />
      </div>
      <div class="auth-field-divider"></div>
      <div class="auth-field-row">
        <input
          type="password"
          id="auth-password"
          class="auth-field"
          placeholder="Password"
          autocomplete="${isSignUp ? 'new-password' : 'current-password'}"
        />
      </div>
    </div>

    <div id="auth-error" class="auth-error-msg"></div>

    <button id="auth-submit" class="btn btn-primary auth-submit-btn">
      ${isSignUp ? 'Create Account' : 'Sign In'}
    </button>

    <div class="auth-switch-row">
      ${isSignUp
        ? `Already have an account? <button class="auth-switch-btn" data-mode="signin">Sign in</button>`
        : `Don't have an account? <button class="auth-switch-btn" data-mode="signup">Create one</button>`
      }
    </div>
  `;

  // Switch mode
  sheet.querySelector<HTMLButtonElement>('.auth-switch-btn')?.addEventListener('click', () => {
    const next = (sheet.querySelector('.auth-switch-btn') as HTMLButtonElement).dataset.mode as AuthMode;
    const emailVal = (sheet.querySelector<HTMLInputElement>('#auth-email'))?.value ?? '';
    renderInto(sheet, next);
    const emailEl = sheet.querySelector<HTMLInputElement>('#auth-email');
    if (emailEl && emailVal) emailEl.value = emailVal;
  });

  // Submit
  sheet.querySelector('#auth-submit')?.addEventListener('click', () => handleSubmit(sheet, mode));
  sheet.querySelector<HTMLInputElement>('#auth-password')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit(sheet, mode);
  });

}

async function handleSubmit(sheet: HTMLElement, mode: AuthMode): Promise<void> {
  const emailEl = sheet.querySelector<HTMLInputElement>('#auth-email');
  const passwordEl = sheet.querySelector<HTMLInputElement>('#auth-password');
  const errorEl = sheet.querySelector<HTMLElement>('#auth-error');
  const btn = sheet.querySelector<HTMLButtonElement>('#auth-submit');

  const email = emailEl?.value.trim() ?? '';
  const password = passwordEl?.value ?? '';

  if (errorEl) errorEl.textContent = '';

  if (!email || !password) {
    if (errorEl) errorEl.textContent = 'Please enter your email and password.';
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = mode === 'signup' ? 'Creating...' : 'Signing in...'; }

  try {
    const user = mode === 'signup' ? await signUp(email, password) : await signIn(email, password);
    closeAuthPrompt();
    showToast(mode === 'signup' ? 'Account created!' : 'Signed in!', 'success');
    await initialSync(user.uid);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (errorEl) errorEl.textContent = friendlyError(msg);
    if (btn) {
      btn.disabled = false;
      btn.textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
    }
  }
}

function friendlyError(msg: string): string {
  if (msg.includes('email-already-in-use')) return 'That email is already registered. Try signing in.';
  if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
    return 'Incorrect email or password.';
  }
  if (msg.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (msg.includes('invalid-email')) return 'Please enter a valid email address.';
  if (msg.includes('network-request-failed')) return 'No internet connection.';
  return 'Something went wrong. Please try again.';
}
