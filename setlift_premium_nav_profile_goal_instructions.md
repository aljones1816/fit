# SetLift Premium Navigation + Profile + Goal Weight Upgrade (Claude Instructions)

You are working inside the **SetLift** PWA codebase.

**Top priorities (in order):**
1. **Performance & responsiveness** (workout flows must remain instant/snappy)
2. **Clean premium design** (polished, modern, consistent)
3. **Maintainability** (small, understandable modules; minimal dependencies)
4. **Offline-first** behavior preserved (Firebase sync must never block the UI)

**Hard constraints:**
- Do **not** break existing offline functionality.
- Do **not** assume the exact data shape; inspect current code.
- Avoid “dev default” UI (unstyled lists, raw inputs). Add tasteful polish without introducing lag.
- Avoid heavy UI frameworks. Keep bundles small. Prefer CSS + tiny utilities.
- Do not run **any git commands** without asking me first.

---

## 0) Premium UX & Performance Principles

### A. Performance rules (must follow)
- Workout screen must do **zero heavy queries** during logging. Any derived stats or aggregation must run:
  - on session end, or
  - in the Progress/Stats tabs, or
  - in a background/idle task (best effort)
- Use **dynamic imports** for non-critical features:
  - chart libraries
  - heatmap rendering helpers (if any)
  - advanced animations
- Avoid layout thrash:
  - batch DOM updates
  - use `requestAnimationFrame` for animation loops
  - avoid measuring layout repeatedly
- Use CSS animations where possible (GPU-friendly transforms/opacity only).
- Provide a “Reduced Motion” behavior honoring:
  - `prefers-reduced-motion: reduce`

### B. Premium design rules (must follow)
- Use a consistent design language:
  - 8px spacing scale (8/12/16/24/32)
  - consistent typography scale (title / section / body / caption)
  - consistent component shapes (radius 12–16)
- Buttons and inputs should feel native and tappable:
  - min hit target 44px
  - clear focus/active states
- Use subtle depth:
  - soft shadows, not harsh borders
  - prefer 1px hairline dividers for lists
- Visual hierarchy:
  - section headers
  - cards for primary content
  - muted secondary info

### C. “Premium but fast” polish checklist
- Micro-interactions:
  - pressed state (scale 0.98) for buttons
  - subtle haptic (if available) for key actions like “End workout” and timer complete
- Transitions:
  - 120–180ms ease-out for screen changes and card expansion
  - no full-screen heavy animations
- Skeleton/loading states:
  - only where needed (e.g., sync status), keep minimal and non-blocking

---

## 1) Bottom Navigation Refactor (max 5 tabs)

Refactor the bottom tray to **at most 5** items:

- `workout`
- `templates`
- `progress` (rename existing `history` → `progress`)
- `stats`
- `more`

### Required changes
- Rename route `history` → `progress`
- Ensure all chart/analysis views live under `progress`
- Add route `more`
- Keep the bottom tray stable and uncluttered

### Premium tab bar design
- Fixed bottom bar with safe-area padding (iOS)
- Rounded top corners (subtle) OR flat with hairline divider
- Icons above labels
- Active tab:
  - slightly brighter icon/label
  - subtle underline/pill indicator (no heavy animation)
- Inactive tab:
  - muted color

---

## 2) Replace Emoji Icons with Modern SVG Icons (Tabler)

Use Tabler icons (consistent, modern, lightweight).

Install:
```
npm install @tabler/icons
```

Replace emojis with:

- Workout → dumbbell
- Templates → clipboard-list
- Progress → chart-line
- Stats → calendar-stats (or chart-bar)
- More → dots (or menu-2)

Icon rules:
- 22–24px
- stroke: `currentColor`
- no inline SVG strings scattered around; centralize in an `icons.ts` module
- allow easy future swapping

**Performance note:** import only the icons you use (tree-shaking) and avoid large icon bundles.

---

## 3) “More” Screen (Premium list UI)

Create `more` route as a simple, premium list grouped into sections:

### Section: Account
- “Profile” (routes to profile screen)
- “Account & Sync” (routes to sync settings/status)

### Section: Data
- “Backup & Restore”

### Section: App
- “Settings” (theme/units/etc)
- “About”

Design:
- list items as rows with:
  - icon
  - title
  - optional subtitle (e.g., “Signed in” / “Last backup 8 days ago”)
  - chevron
- use subtle dividers and card container
- keep it fast: no heavy state

---

## 4) Profile Screen (Goal Weight)

Add new route: `profile`

### Fields (v1)
- Goal Weight (numeric)
  - respects lbs/kg display
  - stored internally as `goalWeightLbs`
  - synced under `/users/{uid}/profile` (or existing profile/settings mechanism)

Optional placeholders (do not implement unless already present):
- Goal type (cut/bulk/maintain)
- Goal date

### Premium UI behaviors
- Use a card form layout (not raw inputs)
- Inline helper text:
  - “Set a goal to visualize progress on your bodyweight chart.”
- Clear button (x) to remove goal
- Save model:
  - either save on blur/change with debounced write
  - or explicit “Save” button (prefer whichever pattern exists already)

---

## 5) Progress Screen Enhancements (Bodyweight + Goal)

Your `progress` screen includes:
- e1RM charts (exercise progress)
- bodyweight chart

We enhance bodyweight chart with goal progress and premium visuals.

### A) Goal line
If goal exists:
- draw a horizontal goal line at goalWeight
- label “Goal: XXX lb” (or kg)
- keep it subtle:
  - thin stroke
  - low-contrast label
  - never overpower the data series

### B) Progress chip (above chart)
Add a small chip above the chart:

- If current > goal:
  - `↓ X.X lb to goal`
- If current < goal:
  - `↑ X.X lb to goal`
- If within ±0.5 lb:
  - `At goal`

Chip styling:
- small pill
- muted background
- text in accent color
- no heavy animation

---

## 6) Advanced Polish (Premium + performant)

### A) 7‑day trend overlay (optional toggle)
Add a toggle: “Show trend”
- computes 7‑day rolling average
- displayed as a second line series (subtle dashed)

Performance:
- compute trend only when:
  - bodyweight tab is visible
  - data changes
- memoize results

### B) Percent-to-goal indicator (simple, useful)
If goal exists and there is at least one prior weight entry:
- define startWeight = first weight after goal was set (or earliest available)
- compute progress:

```
progress = (currentWeight - startWeight) / (goalWeight - startWeight)
```

- clamp 0..1
- display as:
  - `68% toward goal`

If denominator is ~0 (goal equals start):
- hide % indicator and show “Goal set”

### C) Proximity-based emphasis (subtle)
Do NOT recolor the whole chart. Instead:
- Adjust only the latest data point style based on proximity:
  - within 5 lb: slightly brighter
  - within 2 lb: more prominent
  - within 0.5 lb: success tone
- Also adjust the progress chip tone (subtle)

### D) “New entry” micro animation
When a new bodyweight entry is logged:
- animate the last point:
  - scale from 0.9 → 1.0
  - opacity 0.6 → 1.0
  - 150ms ease-out
- honor `prefers-reduced-motion` (disable animation)

### E) Empty states that feel premium
If no bodyweight entries:
- show a clean empty state:
  - short message
  - “Log bodyweight” CTA button
- no giant illustrations

---

## 7) Data Layer Notes (goal + bodyweight)

Before implementing:
- Inspect how bodyweight entries are stored now.
- Identify existing user settings/profile store.
- Add only what is necessary:
  - `goalWeightLbs`
  - maybe `goalSetAt` (timestamp) if needed for “startWeight since goal”
- Ensure Firebase sync mirrors this properly without blocking UI.

---

## 8) Acceptance Criteria

### Performance
- Workout logging remains instantaneous; no noticeable lag.
- Progress charts load quickly; chart code is lazy-loaded.
- No new heavy dependencies added.

### UX
- Bottom nav has 5 tabs max.
- `history` is replaced by `progress` and content is consolidated.
- “More” houses Profile/Backup/Sync/Settings.
- Profile goal weight sets/clears successfully.
- Bodyweight chart shows goal line + progress chip.
- Advanced polish features exist:
  - trend toggle
  - percent to goal
  - subtle proximity emphasis
  - tasteful micro animation (with reduced-motion support)

### Safety
- Firebase sync continues to work.
- No secrets committed.
- No git commands run without asking me first.

---

## 9) Implementation Order (recommended)

1. Audit routes + tab tray + current screens.
2. Create icon module; swap emojis → SVG icons.
3. Refactor routes: `history` → `progress`, add `more`.
4. Implement premium More screen.
5. Implement Profile screen + goal weight persistence.
6. Enhance bodyweight chart with goal line + progress chip.
7. Add advanced polish (trend overlay, % indicator, proximity emphasis, micro animation).
8. Smoke test performance on iPhone Safari (especially workout screen).
9. Summarize changes: routes, files, data fields, any migrations.

---

## 10) Deliverables

- Updated navigation and routes
- Modern icon integration (Tabler)
- More screen
- Profile screen with goal weight
- Bodyweight chart enhancements + advanced polish
- Documentation updates (brief) in README or docs

Do not commit without permission.
