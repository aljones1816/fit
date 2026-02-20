# Offline Workout Log PWA — Build Spec for Claude Code (Alan)

This document is **instructions for Claude Code** to build an **offline‑first**, **super fast**, **iPhone‑friendly** workout logging **Progressive Web App (PWA)**.

**Key constraints**
- Offline first: **all data stored locally on device** (IndexedDB).
- No accounts, no backend, no sharing of stored data between users.
- Hosted on **GitHub Pages** (project site) and served on custom domain **`fit.alanjones.dev`**.
- iPhone-first UX: fast load, large tap targets, minimal friction during a workout.
- Backups: **manual export/import** to/from Files/iCloud Drive.
- Units: **store weights in lbs**, default display **lbs**, optional display **kg**.
- Rounding: inputs round to nearest **0.5 lb**; kg display rounds to **0.25 kg**.
- “Previous” values come from **last time that exercise was done anywhere**.
- Free-form sets during workout; default set count = last time exercise was done; blank set discards.
- Timer: default 90s, **+30s / −30s**, in-app alert (sound + vibrate + visual).
- Progress graphs: default **estimated 1RM**, plus top set weight and volume per workout.
- Bodyweight: optional, **very simple** logging.
- Calendar heatmap: day green if a workout **ended** that day.
- “End workout” warns about empty sets and offers discard.

---

## 0) High-level product design

### Tabs / routes
Keep it simple and fast with 4 primary tabs:

1. **Workout** (today / active session)
2. **Templates** (create/edit workout templates, manage exercises)
3. **Progress** (graphs, bodyweight, exercise analytics)
4. **Stats** (count + heatmap calendar + settings incl. units + backup)

### Core entities
- **Exercise**: name, createdAt, updatedAt, deleted? (soft delete optional)
- **Template**: name (“Upper A”), ordered list of exercise IDs
- **Session**: templateId (optional), startedAt, endedAt, notes (optional), bodyweight (optional)
- **SetEntry**: sessionId, exerciseId, setIndex, reps, weightLbs
- **ExerciseLast** (cache): for quick workout screen “previous sets”

### Performance principles
- App shell cached by Service Worker (SW) with **cache-first**.
- Workout screen uses only:
  - Active session data + `exercise_last` cache
  - No heavy queries during logging
- Progress tab lazy-loads chart code (only used outside workouts).

---

## 1) Tech stack decision (lightweight, modern, supportable)

Use:
- **Vite + TypeScript** (fast dev/build; modern; minimal overhead)
- **Vanilla DOM + small utilities** (no big frameworks)
- **IndexedDB via `idb`** (tiny wrapper, reliable)
- **uPlot** for graphs (fast + small)
- No React/Next/etc (avoid bundle bloat)
- PWA: custom service worker + web manifest

### NPM packages (expected)
- `idb`
- `uplot`
- (optional) `date-fns` (or write tiny date helpers yourself)

---

## 2) Repository structure

Create a new repo, e.g. `offline-workout-pwa`:

```
/
  index.html
  public/
    manifest.webmanifest
    icons/
      icon-192.png
      icon-512.png
      maskable-512.png
  src/
    main.ts
    router.ts
    ui/
      components/
        Tabs.ts
        Toast.ts
        Modal.ts
        Timer.ts
        SetRow.ts
        Heatmap.ts
        Charts.ts
      screens/
        WorkoutScreen.ts
        TemplatesScreen.ts
        ProgressScreen.ts
        StatsScreen.ts
      styles/
        base.css
        theme.css
    data/
      db.ts
      models.ts
      queries.ts
      backup.ts
      units.ts
      pr.ts
    pwa/
      sw.ts
      registerSW.ts
  scripts/
    generate-icons.md (notes only)
  vite.config.ts
  tsconfig.json
  package.json
```

---

## 3) Data model (TypeScript interfaces)

### `src/data/models.ts`
Define:

```ts
export type Id = string;

export interface Exercise {
  id: Id;
  name: string;
  createdAt: number; // ms epoch
  updatedAt: number;
}

export interface Template {
  id: Id;
  name: string;
  exerciseIds: Id[]; // ordered
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: Id;
  templateId?: Id;
  startedAt: number;
  endedAt?: number; // present when finished
  notes?: string;
  bodyweightLbs?: number; // optional
}

export interface SetEntry {
  id: Id;
  sessionId: Id;
  exerciseId: Id;
  setIndex: number; // 0..n-1
  reps?: number;    // undefined means blank/discard
  weightLbs?: number;
}

export interface ExerciseLast {
  exerciseId: Id;
  lastEndedAt: number;
  sets: Array<{ reps: number; weightLbs: number }>; // only filled sets
}
```

IDs: use `crypto.randomUUID()`.

---

## 4) IndexedDB schema

Use `idb` and define object stores with indexes.

### `src/data/db.ts`
Database name: `offline_workout_log`
Version: `1`

Object stores:
- `exercises` (key: `id`, index: `name` optional)
- `templates` (key: `id`)
- `sessions` (key: `id`, indexes: `endedAt`, `startedAt`, `templateId`)
- `sets` (key: `id`, indexes: `sessionId`, `exerciseId`, compound index: [`sessionId`,`exerciseId`])
- `exercise_last` (key: `exerciseId`)
- `settings` (key: `key`) — store theme/unit/timer defaults

Settings keys (suggested):
- `units.display` = `'lbs' | 'kg'` (default `'lbs'`)
- `theme.mode` = `'dark' | 'light' | 'system'` (default `'dark'`)
- `timer.defaultSeconds` = `90`
- `backup.lastExportedAt` = timestamp number (optional)

---

## 5) Units + rounding rules

### `src/data/units.ts`
Rules:
- Store **all weights in lbs** in DB.
- Display units:
  - default `'lbs'`
  - if `'kg'`, convert on display: `kg = lbs * 0.45359237`
- Rounding:
  - input weight lbs is rounded to nearest **0.5 lb**
  - kg display rounded to nearest **0.25 kg**
- Keep conversions stable:
  - When user enters in kg mode, convert kg -> lbs and store lbs (rounded to 0.5 lb).
  - When user displays kg, convert stored lbs -> kg and display rounded.

Helpers:
- `roundTo(value, step)`
- `lbsToKg`, `kgToLbs`
- `formatWeight(weightLbs, displayUnit)`
- `parseEnteredWeight(value, displayUnit) => storedLbs`

---

## 6) Workout logging UX details (Workout tab)

### Screen goals
- **Fast**
- Minimal taps
- Big touch targets
- Always shows “previous” context for each exercise

### Active session state
Store active session ID in memory and also persist in `settings` key `session.activeId` so a reload resumes.

#### Start workout
From Templates tab:
- Tap template -> “Start”
- Create session with `startedAt = now`, `templateId = template.id`
- Build initial set rows **per exercise**:
  - Find `exercise_last` for that exercise:
    - set count default = `max( last.sets.length, 1 )`
  - Create SetEntry rows with `setIndex` values and empty reps/weight
- Navigate to Workout screen

#### Free-form sets
- Each exercise section lists set rows: `Set #`, `Prev`, `Now (reps, weight)`
- Provide:
  - `+ Set` adds a new SetEntry with next setIndex
  - Trash icon deletes that set row (removes SetEntry record)
- “Blank means discard”:
  - If reps or weight is blank, treat it as blank.
  - On “End workout”, if there are blank rows, prompt to discard them (delete blank SetEntry rows) or go back and fill.

#### Previous sets display
For each exercise section:
- Read from `exercise_last`.
- Show previous sets list aligned by set index where possible.
- If previous had fewer sets, show “—” for missing.
- If previous had more sets, show “+X more last time” in a small note.

#### End workout button
- Prominent button at bottom.
- On press:
  - Validate blank rows:
    - if any SetEntry row has `reps` missing OR `weightLbs` missing, show modal:
      - “You have empty sets. Discard empty sets and finish?”
      - Buttons: “Discard & Finish” / “Go Back”
  - If proceed:
    - delete empty rows
    - set `session.endedAt = now`
    - compute summary stats:
      - volume total
      - PRs (see below)
    - update `exercise_last` for each exercise in session
    - clear `session.activeId`
    - show completion toast

---

## 7) PR / stats + “Text workout” feature

User wants: ability to **text someone** a workout summary with PRs and workout count.

Implement with **Web Share API**:
- On session completion screen or Stats tab, show `Share` button:
  - If `navigator.share` available:
    - share text payload
  - Else:
    - copy to clipboard + show toast (“Copied. Paste into Messages.”)

### PR detection
Define PRs as:
- **Highest estimated 1RM** for that exercise ever (based on best set)
- Or highest top set weight for that exercise (optional)

Use Epley:
- `e1rm = weight * (1 + reps/30)`
Store PR cache per exercise to avoid heavy scans:
- `exercise_pr` store:
  - `{exerciseId, bestE1rm, bestE1rmSet, bestTopSetWeight, updatedAt}`
Update PR cache when ending workout.

### Share text template (example)
```
Workout: Upper A ✅
Total volume: 12,450 lb
PRs:
- Bench Press: new e1RM 225 lb (+5)
- Row: top set 185x6

Workouts this month: 8
```

Keep it short and SMS-friendly.

---

## 8) Timer component

### Requirements
- Default 90s
- +30s / −30s buttons
- Visual: progress ring/bar + color change at 0
- Alert: in-app sound + vibration

Implement `Timer` component:
- States: idle, running, finished
- Use `setInterval` or `requestAnimationFrame` for smooth progress
- When hits zero:
  - Play short beep (use WebAudio oscillator or a tiny embedded audio file)
  - `navigator.vibrate?.([200,100,200])` (works on some devices/browsers; best effort)
  - Flash timer background color for ~1s
- Place timer as a collapsible panel pinned bottom or top of Workout screen.

---

## 9) Progress graphs

### Data prep
Progress tab can be slower; okay to query.

Implement per-exercise analytics:
- Choose exercise from dropdown
- Build time series by session ended date:
  - Best set (max e1rm) that day
  - Best top set weight that day
  - Volume per workout session

Graph defaults to e1RM.

### Chart library
Use `uPlot`:
- Fast, small bundle
- Lazy-load it only when Progress tab opens (dynamic import)

### Bodyweight logging
Very simple:
- In Stats tab or Progress tab: “Log Bodyweight”
  - input weight (respects units toggle)
  - store as `bodyweightLbs` in a separate store `bodyweight` or reuse Sessions? Prefer separate store:

Store: `bodyweight_entries`
- key: `id`
- fields: `measuredAt`, `weightLbs`

Graph bodyweight as optional.

---

## 10) Stats + heatmap calendar

Heatmap like GitHub commits:
- Year view (last 365 days) or month view (pick one; start with last 180 days)
- Each day cell green if **any session ended that day**.
- Intensity can be based on number of sessions ended that day (0..3+), but simplest is binary.

Implementation:
- Query sessions with `endedAt` in range.
- Bucket by local date string `YYYY-MM-DD` in user timezone.
- Render grid: weeks columns, weekdays rows.
- Accessible: tap cell shows tooltip (date + # workouts).

Also display:
- Total workouts all-time (count of ended sessions)
- This month count
- Streak (optional later)

---

## 11) Settings

In Stats tab, include:
- Units toggle: lbs / kg
- Theme:
  - default dark
  - allow light
  - allow system
- Backup:
  - Export
  - Import
  - show “Last backup” (from setting)
- About:
  - Version string
  - Data storage note
  - “Install instructions” link (optional)

Theme implementation:
- default `data-theme="dark"`
- if system, watch `matchMedia('(prefers-color-scheme: dark)')`

---

## 12) Backup export/import

### Export
- Read all stores:
  - exercises, templates, sessions, sets, exercise_last, settings, exercise_pr, bodyweight_entries
- Create JSON with:
  - `schemaVersion`
  - `exportedAt`
  - `data` object of arrays
- Create blob and trigger download:
  - filename: `workout-log-backup-YYYY-MM-DD.json`
- Set `backup.lastExportedAt` in settings

### Import (Replace)
- File picker (`<input type="file" accept="application/json">`)
- Parse JSON
- Validate schemaVersion supported
- Confirm modal: “Replace your data with this backup?”
- If confirm:
  - Clear all stores
  - Bulk insert from backup
  - Clear `session.activeId` (avoid weird restores)
  - Reload UI

### Safety
- If parsing fails: show toast “Invalid backup file.”
- If schemaVersion unknown: show message “Backup is from a newer app version.”

---

## 13) PWA: Service worker + manifest

### Manifest (`public/manifest.webmanifest`)
- name, short_name
- start_url: `./` (important for GitHub Pages project sites)
- display: `standalone`
- background_color, theme_color (dark)
- icons including maskable

### Service worker strategy
- Precache app shell:
  - HTML, CSS, JS bundle, manifest, icons
- Cache-first for app shell, with fallback.
- For navigation requests:
  - serve `index.html` from cache (SPA routing)

**Important for project pages**:
- Ensure `start_url` and SW scope work under:
  - `https://fit.alanjones.dev/` (root) once custom domain is set
  - and also under `https://<user>.github.io/<repo>/` during testing
- Use **relative URLs** (`./`) and avoid absolute `/` paths in assets.
- In Vite config, set `base: './'`.

---

## 14) GitHub Pages + custom domain steps (split responsibilities)

### Claude Code should do (in repo)
1. Add `vite.config.ts` with `base: './'`.
2. Add a `public/CNAME` file containing:
   ```
   fit.alanjones.dev
   ```
   (GitHub Pages will use this when you configure the domain.)
3. Add a GitHub Action workflow for Pages deployment (recommended) OR document manual deploy.

Recommended: GitHub Pages via Actions:
- Use `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`
- Build output is Vite `dist/`.

### Alan (you) will do (in GitHub UI + DNS)
1. In repo Settings → Pages:
   - Source: GitHub Actions (or `gh-pages` branch if you prefer)
2. Set Custom domain to `fit.alanjones.dev`
3. Enforce HTTPS (after DNS resolves)

DNS (in your domain provider):
- Create `CNAME` record:
  - Host: `fit`
  - Target: `<your-github-username>.github.io`
- Wait for DNS propagation, then confirm Pages shows “DNS check successful”.

---

## 15) Development workflow

### Local dev
- `npm install`
- `npm run dev`
- Test on iPhone:
  - iPhone on same Wi‑Fi
  - Vite dev server host `--host` to expose LAN
  - Open `http://<mac-ip>:5173/` in Safari

### Production build
- `npm run build`
- `npm run preview`

### PWA install test
- Once deployed to GitHub Pages:
  - open in iPhone Safari
  - Share → Add to Home Screen
  - Open from icon
  - Verify airplane mode still loads

---

## 16) Implementation tasks checklist (Claude Code execution plan)

### Phase A — scaffolding
- Initialize Vite + TS
- Add base styles (dark default)
- Implement simple router + tabs
- Add toast + modal utilities

### Phase B — data layer
- Implement IndexedDB with idb
- CRUD for exercises/templates
- Session + sets storage
- `exercise_last` update on session end
- Settings store (units/theme/timer/active session)

### Phase C — Workout screen (fast path)
- Start workout from template
- Render exercise sections with:
  - previous sets from cache
  - editable current set rows
  - +Set / delete set
- Timer component integrated
- End workout flow with empty-set prompt + discard

### Phase D — Stats + heatmap + share
- Workout counts, month counts
- Heatmap grid for last 180/365 days
- Share summary (Web Share API + clipboard fallback)
- PR cache update + PR display in share message

### Phase E — Progress graphs
- Lazy-load uPlot in Progress tab
- Per-exercise selector
- e1RM series + top set + volume toggle
- Bodyweight entries + simple graph

### Phase F — Backup/import
- Export JSON (download)
- Import replace flow
- Show last backup timestamp + nag banner

### Phase G — PWA polish
- Manifest + icons + SW cache
- Offline behavior test
- Lighthouse PWA checks (optional)
- iOS UI tweaks (safe areas, big tap targets)

---

## 17) UX requirements (workout screen details)

- Keep the workout screen **single scroll**; avoid nested scroll.
- Each exercise card:
  - header with exercise name and “+ Set”
  - table-like rows:
    - Set #
    - Prev (readonly)
    - Reps input
    - Weight input
  - Inputs:
    - numeric keypad
    - stepper buttons optional (later)
- Weight entry behavior:
  - if units=lbs: increments 0.5
  - if units=kg: allow 0.25 kg increments, convert/store lbs rounded to 0.5
- Blank rules:
  - If reps blank OR weight blank => row considered empty.
  - Empty rows get greyed; on end workout prompt to discard.

---

## 18) Edge cases

- App reload during active workout:
  - restore `session.activeId`
  - load sets and continue
- Deleting an exercise:
  - if used historically, do not hard-delete; use a “hidden” flag or prevent delete
- Template edits:
  - only affect future sessions; never rewrite history
- Time zones:
  - “day green” uses local date at end time; use user’s locale/timezone

---

## 19) Acceptance criteria (done when…)

1. Fresh install → create exercises & templates → start workout → log sets → end workout.
2. Starting same exercise later shows previous sets from last occurrence anywhere.
3. Timer works with +30/−30 and alerts in-app.
4. Stats show total workouts and heatmap turns days green on ended workouts.
5. Progress tab shows e1RM chart by default with toggle to top set and volume.
6. Units toggle:
   - default lbs; switching to kg changes display
   - data stored remains lbs; exporting/importing preserves lbs
7. Export creates JSON; import replace restores fully on a clean device.
8. Deployed on GitHub Pages; custom domain configured; offline works after first load.

---

## 20) Notes about iOS PWA limitations (inform the user in-app)

Add a small note under Backup:
- “This app stores data locally on your device. iOS may clear website storage in rare cases (low storage / long inactivity). Export a backup periodically.”

---

## 21) Deliverables Claude Code must produce

- Working PWA with all features above
- Clear README with:
  - local dev
  - deploy to GitHub Pages
  - iPhone install steps
  - backup/restore steps
- No backend services
- Bundle kept small; avoid heavy dependencies

---

## 22) README section: Custom domain + Pages (explicit split)

Claude should write in README:

**You (Alan) do in DNS provider**
- Add CNAME `fit` → `<github-username>.github.io`

**You (Alan) do in GitHub UI**
- Settings → Pages → set Custom domain `fit.alanjones.dev`
- Enforce HTTPS

**Repo already includes**
- `public/CNAME` with `fit.alanjones.dev`
- Pages deployment workflow

---

## 23) Implementation hints (keep it snappy)

- Use event delegation, minimal re-renders (update only the set row being edited).
- Use `DocumentFragment` for list rendering.
- Debounce any expensive computations.
- Keep `WorkoutScreen` data in memory; write-through to IndexedDB on each change (or batch every 1–2s).
- Avoid “read whole DB” queries in workout mode.
- Precompute exercise dropdown lists once.

---

End of spec.
