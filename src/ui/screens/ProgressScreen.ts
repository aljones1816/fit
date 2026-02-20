import {
  getAllExercises,
  getExerciseSets,
  getEndedSessions,
  getDisplayUnit,
  getAllBodyweightEntries,
  addBodyweightEntry,
} from '../../data/queries';
import type { Exercise, SetEntry, DisplayUnit } from '../../data/models';
import { calculateE1RM } from '../../data/pr';
import { showToast } from '../components/Toast';
import { showModal } from '../components/Modal';
import { formatWeight, parseEnteredWeight, lbsToKg } from '../../data/units';

let selectedExercise: Exercise | null = null;
let activeChartType: 'e1rm' | 'top' | 'volume' = 'e1rm';
let displayUnit: DisplayUnit = 'lbs';

export async function renderProgressScreen() {
  const screen = document.getElementById('screen');
  if (!screen) return;

  const exercises = await getAllExercises();
  displayUnit = await getDisplayUnit();

  screen.innerHTML = `
    <div>
      <h1 class="mb-2">Progress</h1>

      <div class="card mb-2">
        <div class="card-header" style="margin-bottom:0.75rem;">
          <h3 class="card-title">Bodyweight</h3>
          <button class="btn btn-primary btn-small" id="log-bodyweight-btn">+ Log</button>
        </div>
        <div id="bodyweight-chart"></div>
        <div id="bodyweight-list"></div>
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Exercise Progress</h3>

        ${exercises.length === 0
          ? '<p class="text-muted">No exercises yet. Add some from the Templates tab.</p>'
          : `
          <div style="position:relative;margin-bottom:1rem;" id="exercise-picker-wrap">
            <input
              type="text"
              id="exercise-search-input"
              placeholder="Search exercises…"
              autocomplete="off"
              value="${selectedExercise?.name ?? ''}"
              style="width:100%;padding:0.75rem 2.5rem 0.75rem 0.75rem;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-secondary);color:var(--text-primary);font-size:1rem;"
            />
            <span style="position:absolute;right:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-secondary);pointer-events:none;">▾</span>
            <div id="exercise-dropdown" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;z-index:200;max-height:260px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,0.3);"></div>
          </div>

          <div id="chart-type-selector" class="flex gap-1 mb-2" style="${selectedExercise ? '' : 'display:none;'}">
            <button class="btn btn-small ${activeChartType === 'e1rm' ? 'btn-primary' : 'btn-secondary'}" data-chart-type="e1rm">e1RM</button>
            <button class="btn btn-small ${activeChartType === 'top'  ? 'btn-primary' : 'btn-secondary'}" data-chart-type="top">Top Set</button>
            <button class="btn btn-small ${activeChartType === 'volume' ? 'btn-primary' : 'btn-secondary'}" data-chart-type="volume">Volume</button>
          </div>

          <div id="exercise-chart"></div>
        `}
      </div>
    </div>
  `;

  await renderBodyweightSection();

  document.getElementById('log-bodyweight-btn')?.addEventListener('click', handleLogBodyweight);

  document.querySelectorAll('[data-chart-type]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      activeChartType = (e.currentTarget as HTMLElement).dataset.chartType as typeof activeChartType;
      renderExerciseChart();
    });
  });

  // Wire up custom exercise combobox
  if (exercises.length > 0) {
    initExercisePicker(exercises);
  }

  // Restore previously selected exercise if any
  if (selectedExercise) {
    renderExerciseChart();
  }
}

function initExercisePicker(exercises: Exercise[]) {
  const input = document.getElementById('exercise-search-input') as HTMLInputElement | null;
  const dropdown = document.getElementById('exercise-dropdown') as HTMLDivElement | null;
  if (!input || !dropdown) return;

  const sorted = [...exercises].sort((a, b) => a.name.localeCompare(b.name));

  const showDropdown = (query: string) => {
    const q = query.toLowerCase();
    const matches = sorted.filter(ex => ex.name.toLowerCase().includes(q));

    dropdown.innerHTML = matches.length === 0
      ? `<div style="padding:0.75rem;color:var(--text-secondary);font-size:0.9rem;">No matches</div>`
      : matches.map(ex => `
          <div
            data-ex-id="${ex.id}"
            data-ex-name="${ex.name}"
            style="
              padding:0.75rem 1rem;
              cursor:pointer;
              font-size:0.95rem;
              border-bottom:0.5px solid var(--border-color);
              background:${selectedExercise?.id === ex.id ? 'var(--accent)' : 'transparent'};
              color:${selectedExercise?.id === ex.id ? '#fff' : 'var(--text-primary)'};
            "
          >${ex.name}</div>
        `).join('');

    dropdown.style.display = 'block';

    dropdown.querySelectorAll('[data-ex-id]').forEach(row => {
      row.addEventListener('mousedown', (e) => {
        // mousedown fires before blur so we can read the value
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        const id = el.dataset.exId!;
        const name = el.dataset.exName!;
        pickExercise(id, name, exercises);
      });
    });
  };

  input.addEventListener('focus', () => showDropdown(input.value));
  input.addEventListener('input', () => showDropdown(input.value));
  input.addEventListener('blur', () => {
    // Small delay so mousedown on a row can fire first
    setTimeout(() => { dropdown.style.display = 'none'; }, 150);
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!document.getElementById('exercise-picker-wrap')?.contains(e.target as Node)) {
      dropdown.style.display = 'none';
    }
  }, { once: false });
}

async function pickExercise(id: string, name: string, exercises: Exercise[]) {
  const dropdown = document.getElementById('exercise-dropdown') as HTMLDivElement | null;
  const input = document.getElementById('exercise-search-input') as HTMLInputElement | null;
  if (input) input.value = name;
  if (dropdown) dropdown.style.display = 'none';

  selectedExercise = exercises.find(ex => ex.id === id) || null;
  if (!selectedExercise) return;

  const sel = document.getElementById('chart-type-selector');
  if (sel) sel.style.display = 'flex';

  activeChartType = 'e1rm';
  document.querySelectorAll('[data-chart-type]').forEach(btn => {
    const el = btn as HTMLElement;
    el.className = `btn btn-small ${el.dataset.chartType === activeChartType ? 'btn-primary' : 'btn-secondary'}`;
  });

  renderExerciseChart();
}

// ─── Bodyweight ────────────────────────────────────────────────────────────

async function renderBodyweightSection() {
  const entries = await getAllBodyweightEntries();
  const sorted = entries.sort((a, b) => a.measuredAt - b.measuredAt);

  const chartContainer = document.getElementById('bodyweight-chart');
  const listContainer = document.getElementById('bodyweight-list');
  if (!chartContainer || !listContainer) return;

  if (sorted.length === 0) {
    chartContainer.innerHTML = '';
    listContainer.innerHTML = '<p class="text-muted" style="font-size:0.875rem;">No entries yet</p>';
    return;
  }

  // Chart
  if (sorted.length >= 2) {
    try {
      const uPlot = (await import('uplot')).default;
      chartContainer.innerHTML = '';

      const timestamps = sorted.map(e => e.measuredAt / 1000);
      const weights = sorted.map(e =>
        displayUnit === 'kg' ? Math.round(lbsToKg(e.weightLbs) * 10) / 10 : e.weightLbs
      );

      const opts: any = {
        width: chartContainer.clientWidth || 340,
        height: 180,
        scales: { x: { time: true } },
        series: [
          {},
          {
            label: `Bodyweight (${displayUnit})`,
            stroke: '#4a9eff',
            width: 2,
            fill: 'rgba(74,158,255,0.08)',
          },
        ],
        axes: [{}, { label: displayUnit }],
        cursor: { show: false },
        legend: { show: false },
      };

      new uPlot(opts, [timestamps, weights], chartContainer);
    } catch {
      chartContainer.innerHTML = '';
    }
  } else {
    chartContainer.innerHTML = '<p class="text-muted" style="font-size:0.875rem;">Log at least 2 entries to see a chart</p>';
  }

  // Recent list (last 5, newest first)
  const recent = [...sorted].reverse().slice(0, 5);
  listContainer.innerHTML = `
    <div style="margin-top:0.75rem;">
      ${recent.map(entry => `
        <div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:0.5px solid var(--border-color);">
          <span style="font-size:0.875rem;color:var(--text-secondary);">${new Date(entry.measuredAt).toLocaleDateString()}</span>
          <span style="font-weight:500;">${formatWeight(entry.weightLbs, displayUnit)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function handleLogBodyweight() {
  const body = document.createElement('div');
  body.innerHTML = `
    <input
      type="number"
      inputmode="decimal"
      id="bodyweight-input"
      placeholder="Enter weight (${displayUnit})"
      step="${displayUnit === 'kg' ? '0.1' : '0.5'}"
      style="width:100%;"
    />
  `;

  showModal({
    title: 'Log Bodyweight',
    body,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Save',
        className: 'btn btn-primary',
        onClick: async () => {
          const input = document.getElementById('bodyweight-input') as HTMLInputElement;
          const value = input?.value;
          if (!value) { showToast('Please enter a weight', 'error'); return; }
          const weightLbs = parseEnteredWeight(value, displayUnit);
          await addBodyweightEntry(weightLbs);
          showToast('Bodyweight logged', 'success');
          renderProgressScreen();
        },
      },
    ],
  });

  setTimeout(() => document.getElementById('bodyweight-input')?.focus(), 100);
}

// ─── Exercise chart ────────────────────────────────────────────────────────

async function renderExerciseChart() {
  const chartContainer = document.getElementById('exercise-chart');
  if (!chartContainer || !selectedExercise) return;

  // Update button active states
  document.querySelectorAll('[data-chart-type]').forEach(btn => {
    const el = btn as HTMLElement;
    el.className = `btn btn-small ${el.dataset.chartType === activeChartType ? 'btn-primary' : 'btn-secondary'}`;
  });

  chartContainer.innerHTML = '<div class="text-muted" style="font-size:0.875rem;">Loading…</div>';

  try {
    const uPlot = (await import('uplot')).default;

    const sets = await getExerciseSets(selectedExercise.id);
    const sessions = await getEndedSessions();

    // Group filled sets by session
    const sessionMap = new Map<string, SetEntry[]>();
    sets.forEach(set => {
      if (set.reps !== undefined && set.weightLbs !== undefined) {
        if (!sessionMap.has(set.sessionId)) sessionMap.set(set.sessionId, []);
        sessionMap.get(set.sessionId)!.push(set);
      }
    });

    const dataPoints: Array<{ timestamp: number; value: number }> = [];

    for (const session of sessions) {
      const ss = sessionMap.get(session.id);
      if (!ss || ss.length === 0) continue;

      let value = 0;
      if (activeChartType === 'e1rm') {
        value = ss.reduce((max, s) => Math.max(max, calculateE1RM(s.weightLbs!, s.reps!)), 0);
      } else if (activeChartType === 'top') {
        value = Math.max(...ss.map(s => s.weightLbs!));
        if (displayUnit === 'kg') value = Math.round(lbsToKg(value) * 10) / 10;
      } else {
        value = ss.reduce((sum, s) => sum + s.reps! * s.weightLbs!, 0);
        if (displayUnit === 'kg') value = Math.round(lbsToKg(value) * 10) / 10;
      }

      dataPoints.push({ timestamp: session.endedAt! / 1000, value });
    }

    dataPoints.sort((a, b) => a.timestamp - b.timestamp);

    if (dataPoints.length === 0) {
      chartContainer.innerHTML = '<p class="text-muted">No data yet for this exercise</p>';
      return;
    }

    chartContainer.innerHTML = '';

    const unitLabel = displayUnit;
    const seriesLabel =
      activeChartType === 'e1rm' ? `Est. 1RM (${unitLabel})`
      : activeChartType === 'top' ? `Top Set (${unitLabel})`
      : `Volume (${unitLabel})`;

    const opts: any = {
      width: chartContainer.clientWidth || 340,
      height: 240,
      scales: { x: { time: true } },
      series: [
        {},
        { label: seriesLabel, stroke: '#4a9eff', width: 2, fill: 'rgba(74,158,255,0.08)' },
      ],
      axes: [{}, { label: seriesLabel }],
      cursor: { show: false },
      legend: { show: false },
    };

    new uPlot(opts, [dataPoints.map(d => d.timestamp), dataPoints.map(d => d.value)], chartContainer);
  } catch (err) {
    console.error(err);
    chartContainer.innerHTML = '<p class="text-muted">Error loading chart</p>';
  }
}
