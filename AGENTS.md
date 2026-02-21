# AGENTS.md

## Project Overview
Offline-first workout logging Progressive Web App optimized for iPhone usage.

- App type: Vite + TypeScript SPA (vanilla DOM, no framework)
- Data: IndexedDB (`idb`) with local-first behavior
- Charts: `uPlot`
- PWA: service worker + manifest in `public/`
- Optional cloud sync code exists under `src/firebase/`

## Primary Goals
- Keep workout logging fast and usable offline
- Preserve local data integrity (sessions, sets, templates, settings)
- Maintain mobile-first UX, especially Safari on iPhone

## Repository Map
- `src/main.ts`: app bootstrap
- `src/router.ts`: tab/screen routing
- `src/ui/screens/`: main screens (Workout, Templates, Progress, History, Stats)
- `src/ui/components/`: reusable UI components
- `src/data/`: IndexedDB schema, queries, seeds, defaults, PR logic
- `src/pwa/registerSW.ts`: service worker registration
- `src/firebase/`: auth/sync/queue/init (if Firebase features are enabled)
- `public/sw.js`: service worker implementation
- `docs/firebase-sync.md`: Firebase sync notes
- `scripts/setup-env.cjs`: build-time env setup

## Local Commands
- Install: `npm install`
- Dev server (LAN accessible): `npm run dev`
- Production build: `npm run build`
- Preview build: `npm run preview`

## Engineering Guardrails
- Preserve offline-first behavior; avoid introducing backend requirements for core logging flows.
- Treat IndexedDB schema/queries as high-risk areas; make migrations/backward compatibility explicit.
- Keep unit handling consistent: storage in lbs, UI may display lbs/kg.
- Ensure PWA behavior continues to work after first load (service worker + cached assets).
- Optimize for touch/mobile interactions and small screens.

## Current State Notes
- There is no dedicated test script in `package.json` yet.
- Build runs: `node scripts/setup-env.cjs && tsc && vite build`.
- GitHub Pages deployment is configured (`.github/workflows/deploy.yml`, `public/CNAME`).

## Recommended Agent Workflow
1. Read `README.md` for product behavior constraints.
2. Identify affected areas in `src/data/`, `src/ui/`, and `public/sw.js`.
3. Make minimal, focused changes.
4. Run `npm run build` to catch TypeScript/build regressions.
5. For UX changes, validate responsive behavior and iPhone-oriented flows.

## Out of Scope Unless Requested
- Re-platforming away from vanilla DOM
- Requiring mandatory accounts/backend for core usage
- Removing local backup/restore capabilities
