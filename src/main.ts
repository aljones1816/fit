import './ui/styles/base.css';
import './ui/styles/theme.css';
import 'uplot/dist/uPlot.min.css';
import { initRouter } from './router';
import { registerServiceWorker } from './pwa/registerSW';
import { initializeDefaultExercises, deduplicateExercises } from './data/initDefaults';
import { onAuthStateChanged } from './firebase/auth';
import { initialSync, initAutoSync } from './firebase/sync';
import { applyTheme, getThemeMode } from './data/queries';
import { showAuthPrompt, closeAuthPrompt } from './ui/components/AuthPrompt';

// Select-all on focus for number inputs — tap to replace, not tap to position cursor
document.addEventListener('focus', e => {
  const el = e.target as HTMLElement;
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'number') {
    (el as HTMLInputElement).select();
  }
}, true); // capture phase so it fires before any other focus handlers

// iOS Safari fires a click after focus which can drop the selection — re-select on click too
document.addEventListener('click', e => {
  const el = e.target as HTMLElement;
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'number') {
    (el as HTMLInputElement).select();
  }
});

// Initialize the app
async function init() {
  // Apply saved theme before rendering
  const themeMode = await getThemeMode();
  applyTheme(themeMode);

  // Initialize router and tabs
  initRouter();

  // Register service worker in production
  if (import.meta.env.PROD) {
    registerServiceWorker();
  }

  const appEl = document.getElementById('app')!;

  // Wire up Firebase auth — gate the app behind sign-in
  onAuthStateChanged(async (user) => {
    if (user) {
      appEl.style.visibility = 'visible';
      closeAuthPrompt();
      await initialSync(user.uid);
      // Seed defaults AFTER sync so Firestore data arrives first.
      // If the user already has exercises (from sync), this is a no-op.
      await initializeDefaultExercises();
      // One-time cleanup: collapse duplicate exercises created by earlier bugs.
      await deduplicateExercises();
    } else {
      appEl.style.visibility = 'hidden';
      showAuthPrompt();
    }
  });

  // Auto-sync when coming back online (works whether just signed in or already was)
  initAutoSync();
}

init();
