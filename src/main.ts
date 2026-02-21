import './ui/styles/base.css';
import './ui/styles/theme.css';
import 'uplot/dist/uPlot.min.css';
import { initRouter } from './router';
import { registerServiceWorker } from './pwa/registerSW';
import { initializeDefaultExercises, deduplicateExercises } from './data/initDefaults';
import { onAuthStateChanged } from './firebase/auth';
import { initialSync, initAutoSync } from './firebase/sync';
import { applyTheme, getThemeMode } from './data/queries';

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

  // Seed local defaults up front so the app is immediately usable in local-only mode.
  await initializeDefaultExercises();
  // One-time cleanup: collapse duplicate exercises created by earlier bugs.
  await deduplicateExercises();

  // Wire up Firebase auth — sync is optional and enabled when signed in.
  onAuthStateChanged(async (user) => {
    if (user) {
      await initialSync(user.uid);
      // Re-run seeding/cleanup after pull so remote data and defaults stay coherent.
      await initializeDefaultExercises();
      await deduplicateExercises();
    }
  });

  // Auto-sync when coming back online (works whether just signed in or already was)
  initAutoSync();
}

init();
