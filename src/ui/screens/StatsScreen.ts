import {
  getAllSessions,
  getEndedSessions,
  getDisplayUnit,
  setDisplayUnit,
  getThemeMode,
  setThemeMode,
  getSetting,
} from '../../data/queries';
import type { DisplayUnit, ThemeMode } from '../../data/models';
import { showToast } from '../components/Toast';
import { showModal } from '../components/Modal';
import { renderHeatmap } from '../components/Heatmap';
import { exportBackup, importBackup } from '../../data/backup';

export async function renderStatsScreen() {
  const screen = document.getElementById('screen');
  if (!screen) return;

  const sessions = await getAllSessions();
  const endedSessions = await getEndedSessions();

  // Count this month
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthCount = endedSessions.filter(s => s.endedAt && s.endedAt >= thisMonthStart.getTime()).length;

  const displayUnit = await getDisplayUnit();
  const themeMode = await getThemeMode();
  const lastBackup = await getSetting<number>('backup.lastExportedAt');

  screen.innerHTML = `
    <div>
      <h1 class="mb-2">Stats</h1>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Workout Stats</h3>
        <div class="mb-2">
          <div style="font-size: 2rem; font-weight: 600;">${endedSessions.length}</div>
          <div class="text-muted" style="font-size: 0.875rem;">Total Workouts</div>
        </div>
        <div>
          <div style="font-size: 1.5rem; font-weight: 600;">${thisMonthCount}</div>
          <div class="text-muted" style="font-size: 0.875rem;">This Month</div>
        </div>
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Activity Calendar</h3>
        ${renderHeatmap(sessions)}
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Settings</h3>

        <div class="mb-2">
          <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Display Units</label>
          <div class="flex gap-1">
            <button
              class="btn ${displayUnit === 'lbs' ? 'btn-primary' : 'btn-secondary'}"
              id="unit-lbs-btn"
              style="flex: 1;"
            >
              lbs
            </button>
            <button
              class="btn ${displayUnit === 'kg' ? 'btn-primary' : 'btn-secondary'}"
              id="unit-kg-btn"
              style="flex: 1;"
            >
              kg
            </button>
          </div>
        </div>

        <div class="mb-2">
          <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Theme</label>
          <div class="flex gap-1">
            <button
              class="btn btn-small ${themeMode === 'dark' ? 'btn-primary' : 'btn-secondary'}"
              id="theme-dark-btn"
            >
              Dark
            </button>
            <button
              class="btn btn-small ${themeMode === 'light' ? 'btn-primary' : 'btn-secondary'}"
              id="theme-light-btn"
            >
              Light
            </button>
            <button
              class="btn btn-small ${themeMode === 'system' ? 'btn-primary' : 'btn-secondary'}"
              id="theme-system-btn"
            >
              System
            </button>
          </div>
        </div>
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Backup & Data</h3>

        <div class="mb-2">
          ${lastBackup ? `<div class="text-muted" style="font-size: 0.875rem; margin-bottom: 0.5rem;">Last backup: ${new Date(lastBackup).toLocaleDateString()}</div>` : ''}
          <button class="btn btn-primary" id="export-btn" style="width: 100%; margin-bottom: 0.5rem;">
            Export Backup
          </button>
          <button class="btn btn-secondary" id="import-btn" style="width: 100%;">
            Import Backup
          </button>
        </div>

        <div class="text-muted" style="font-size: 0.75rem; line-height: 1.4;">
          ⚠️ This app stores data locally on your device. iOS may clear website storage in rare cases (low storage / long inactivity). Export a backup periodically.
        </div>
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-2">About</h3>
        <div class="text-muted" style="font-size: 0.875rem;">
          <div>Version: 1.0.0</div>
          <div>Offline-first workout logging PWA</div>
          <div>All data stored locally on your device</div>
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('unit-lbs-btn')?.addEventListener('click', () => handleUnitChange('lbs'));
  document.getElementById('unit-kg-btn')?.addEventListener('click', () => handleUnitChange('kg'));

  document.getElementById('theme-dark-btn')?.addEventListener('click', () => handleThemeChange('dark'));
  document.getElementById('theme-light-btn')?.addEventListener('click', () => handleThemeChange('light'));
  document.getElementById('theme-system-btn')?.addEventListener('click', () => handleThemeChange('system'));

  document.getElementById('export-btn')?.addEventListener('click', handleExport);
  document.getElementById('import-btn')?.addEventListener('click', handleImport);
}

async function handleUnitChange(unit: DisplayUnit) {
  await setDisplayUnit(unit);
  showToast(`Display units set to ${unit}`, 'success');
  renderStatsScreen();
}

async function handleThemeChange(mode: ThemeMode) {
  await setThemeMode(mode);
  showToast(`Theme set to ${mode}`, 'success');
  renderStatsScreen();
}

async function handleExport() {
  try {
    await exportBackup();
    showToast('Backup exported successfully', 'success');
    renderStatsScreen();
  } catch (error) {
    showToast('Export failed', 'error');
    console.error(error);
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
              setTimeout(() => {
                window.location.reload();
              }, 1000);
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
