import './ui/styles/base.css';
import './ui/styles/theme.css';
import 'uplot/dist/uPlot.min.css';
import { initRouter } from './router';
import { registerServiceWorker } from './pwa/registerSW';
import { initializeDefaultExercises } from './data/initDefaults';

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
  // Seed default exercises on first load
  await initializeDefaultExercises();

  // Initialize router and tabs
  initRouter();

  // Register service worker in production
  if (import.meta.env.PROD) {
    registerServiceWorker();
  }
}

init();
