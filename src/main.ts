import './ui/styles/base.css';
import './ui/styles/theme.css';
import 'uplot/dist/uPlot.min.css';
import { initRouter } from './router';
import { registerServiceWorker } from './pwa/registerSW';
import { initializeDefaultExercises } from './data/initDefaults';

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
