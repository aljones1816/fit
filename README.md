# Offline Workout Log PWA

An **offline-first**, **iPhone-optimized** Progressive Web App for logging workouts. No accounts, no backend—all data stored locally on your device.

## Features

- **Offline-First**: Works completely offline after first load. All data stored in IndexedDB.
- **Workout Logging**: Fast, friction-free set tracking with previous workout context
- **50+ Pre-loaded Exercises**: Common barbell, dumbbell, bodyweight, and machine exercises included by default
- **Templates**: Create reusable workout templates with exercises
- **Progress Tracking**: View estimated 1RM, top sets, and volume over time with interactive charts
- **Rest Timer**: Configurable timer with sound and vibration alerts
- **Activity Heatmap**: GitHub-style calendar showing workout frequency
- **Bodyweight Tracking**: Optional bodyweight logging
- **Backup/Restore**: Manual export/import to JSON files
- **Units**: Display weights in lbs or kg (all data stored in lbs)
- **Dark/Light Theme**: System-aware theming

## Tech Stack

- **Vite** + **TypeScript** - Fast dev/build
- **Vanilla DOM** - No framework bloat
- **IndexedDB** (via `idb`) - Local data storage
- **uPlot** - Lightweight, fast charts
- **Service Worker** - Offline caching

## Local Development

### Prerequisites

- Node.js 18+ and npm

### Install & Run

```bash
# Install dependencies
npm install

# Run dev server (with network access for iPhone testing)
npm run dev

# The dev server will be accessible at:
# - Local: http://localhost:5173
# - Network: http://<your-ip>:5173
```

### iPhone Testing

1. Ensure your iPhone and computer are on the same Wi-Fi network
2. Run `npm run dev`
3. Note the network IP address from the terminal (e.g., `http://192.168.1.x:5173`)
4. Open that URL in Safari on your iPhone

### Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment to GitHub Pages

This app is configured to deploy to **GitHub Pages** with a custom domain at `fit.alanjones.dev`.

### What's Already Set Up (in this repo)

✅ `public/CNAME` file with `fit.alanjones.dev`
✅ Vite config with `base: './'` for correct asset paths
✅ GitHub Actions workflow (`.github/workflows/deploy.yml`)
✅ Service worker for offline support

### What You (Alan) Need to Do

#### 1. In Your DNS Provider (e.g., Cloudflare, Namecheap)

Add a **CNAME record**:
- **Host**: `fit`
- **Target**: `alanjones.github.io` (replace `alanjones` with your GitHub username)
- **TTL**: Auto or 3600

#### 2. In GitHub Repository Settings

1. Go to **Settings** → **Pages**
2. Under **Source**, select: **GitHub Actions**
3. Under **Custom domain**, enter: `fit.alanjones.dev`
4. Wait for DNS check to succeed (may take a few minutes)
5. Enable **Enforce HTTPS** (after DNS resolves)

#### 3. Push to Main Branch

```bash
git add .
git commit -m "Initial deployment"
git push origin main
```

The GitHub Action will automatically build and deploy to Pages.

#### 4. Verify Deployment

- Visit `https://fit.alanjones.dev` (after DNS propagates)
- The app should load and work offline

## PWA Installation on iPhone

1. Open `https://fit.alanjones.dev` in **Safari** (not Chrome)
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add**
5. Open the app from your home screen

The app will work offline after the first load.

## PWA Icons

Icon placeholders are in `public/icons/`. To add real icons:

1. Create or generate icons:
   - `icon-192.png` - 192x192px
   - `icon-512.png` - 512x512px
   - `maskable-512.png` - 512x512px (with safe zone)

2. Tools:
   - [RealFaviconGenerator](https://realfavicongenerator.net/)
   - [Favicon.io](https://favicon.io/)

## Usage

### First Time Setup

1. On first launch, the app automatically creates **50+ common exercises** (e.g., "Barbell Bench Press", "Barbell Back Squat", "Dumbbell Row", etc.)
2. Go to **Templates** tab
3. Create a template (e.g., "Upper A") and select exercises from the list
4. Tap **Start** on the template to begin a workout

**Note**: You can still add your own custom exercises anytime using the "+ Add Exercise" button.

### During a Workout

1. The **Workout** tab shows your active session
2. For each exercise:
   - Enter reps and weight for each set
   - "Previous" column shows your last performance
   - Use **+ Set** to add more sets
   - Use **🗑** to delete a set
3. Use the **timer** for rest periods
4. Tap **End Workout** when done
   - Empty sets will be discarded

### Viewing Progress

- **Progress** tab: Select an exercise to view e1RM, top set, or volume over time
- **Stats** tab: See total workouts, monthly stats, and activity heatmap

### Backup Your Data

⚠️ **Important**: iOS may clear local storage if your device runs low on space or the app is unused for a long time.

1. Go to **Stats** → **Backup & Data**
2. Tap **Export Backup** regularly (e.g., weekly)
3. Save the JSON file to iCloud Drive or Files app
4. To restore: Tap **Import Backup** and select your JSON file

## Data Structure

All data is stored in IndexedDB:

- **Exercises**: Exercise definitions
- **Templates**: Workout templates with ordered exercises
- **Sessions**: Workout sessions (startedAt, endedAt, notes, bodyweight)
- **Sets**: Individual set entries (reps, weight in lbs)
- **exercise_last**: Cache of last workout for each exercise (for "Previous" column)
- **exercise_pr**: PR tracking (best e1RM, top set weight)
- **bodyweight_entries**: Optional bodyweight log
- **settings**: User preferences (units, theme, timer default)

## Key Design Decisions

- **No Backend**: Everything is local. No sync, no accounts.
- **Weights Stored in lbs**: Even if you display in kg, storage is always lbs (0.5 lb precision).
- **e1RM Formula**: Epley formula: `weight × (1 + reps/30)`
- **Previous Sets**: Pulled from `exercise_last` cache (updated when ending a workout)
- **Blank Sets**: Rows with missing reps or weight are discarded on workout end
- **Timer**: Default 90s, adjustable ±30s, with sound + vibration + visual alert

## Browser Compatibility

- **Best on iPhone Safari** (PWA install supported)
- Works on desktop Chrome, Firefox, Edge
- Requires modern browser with IndexedDB and Service Worker support

## License

MIT

---

## Notes

- **Offline Storage Warning**: Displayed in Stats tab. Export backups regularly.
- **No Sharing**: This is a single-user app. No workout sharing or social features.
- **Custom Domain**: DNS propagation can take up to 24 hours (usually faster).

Enjoy your workouts! 💪
