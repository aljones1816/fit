import {
  getAllExercises,
  getExerciseSets,
  getEndedSessions,
  getDisplayUnit,
  getAllBodyweightEntries,
  addBodyweightEntry,
  updateBodyweightEntry,
  getGoalWeightLbs,
  getSessionSets,
  getTemplate,
  getExercise,
  updateSetEntry,
  deleteSetEntry,
  createSetEntry,
  deleteSession,
  deleteBodyweightEntry,
  getAllExercisePRs,
} from '../../data/queries';
import type { Exercise, SetEntry, DisplayUnit, BodyweightEntry, Session, ExercisePR } from '../../data/models';
import { calculateE1RM, findBestE1RM } from '../../data/pr';
import { lbsToKg, formatWeight, parseEnteredWeight, formatVolume } from '../../data/units';
import { showModal } from '../components/Modal';
import { showToast } from '../components/Toast';
import { trySyncNow } from '../../firebase/sync';

// ─── Module state ─────────────────────────────────────────────────────────────

let activeTopView: 'charts' | 'history' = 'charts';
let selectedExercise: Exercise | null = null;
let activeChartType: 'e1rm' | 'top' | 'volume' = 'e1rm';
let displayUnit: DisplayUnit = 'lbs';

// History sub-state (reused from HistoryScreen logic)
let activeHistoryView: 'workouts' | 'weight' = 'workouts';
let expandedSessionId: string | null = null;
const sessionSetsCache = new Map<string, SetEntry[]>();

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function renderProgressScreen() {
  const screen = document.getElementById('screen');
  if (!screen) return;

  const exercises = await getAllExercises();
  displayUnit = await getDisplayUnit();

  screen.innerHTML = `
    <div>
      <h1 class="mb-2">Progress</h1>

      <div class="seg-control mb-2">
        <button class="seg-btn ${activeTopView === 'charts'  ? 'active' : ''}" data-top-view="charts">Charts</button>
        <button class="seg-btn ${activeTopView === 'history' ? 'active' : ''}" data-top-view="history">History</button>
      </div>

      <div id="progress-content"></div>
    </div>
  `;

  document.querySelectorAll('[data-top-view]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const view = (btn as HTMLElement).dataset.topView as typeof activeTopView;
      if (view === activeTopView) return;
      activeTopView = view;
      updateTopSegment();
      await renderProgressContent(exercises);
    });
  });

  await renderProgressContent(exercises);
}

function updateTopSegment() {
  document.querySelectorAll('[data-top-view]').forEach(btn => {
    const el = btn as HTMLElement;
    el.classList.toggle('active', el.dataset.topView === activeTopView);
  });
}

async function renderProgressContent(exercises: Exercise[]) {
  const container = document.getElementById('progress-content');
  if (!container) return;

  if (activeTopView === 'charts') {
    await renderChartsView(container, exercises);
  } else {
    await renderHistoryView(container);
  }
}

// ─── Charts view ──────────────────────────────────────────────────────────────

async function renderChartsView(container: HTMLElement, exercises: Exercise[]) {
  container.innerHTML = `
    <div class="card mb-2">
      <div class="card-header" style="margin-bottom:0.75rem;">
        <h3 class="card-title">Bodyweight</h3>
        <button class="btn btn-primary btn-small" id="log-weight-btn">Log Today</button>
      </div>
      <div id="bw-chip-area"></div>
      <div id="bodyweight-chart"></div>
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
          <button class="btn btn-small ${activeChartType === 'e1rm'   ? 'btn-primary' : 'btn-secondary'}" data-chart-type="e1rm">e1RM</button>
          <button class="btn btn-small ${activeChartType === 'top'    ? 'btn-primary' : 'btn-secondary'}" data-chart-type="top">Top Set</button>
          <button class="btn btn-small ${activeChartType === 'volume' ? 'btn-primary' : 'btn-secondary'}" data-chart-type="volume">Volume</button>
        </div>

        <div id="exercise-chart"></div>
      `}
    </div>
  `;

  await renderBodyweightSection();

  document.getElementById('log-weight-btn')?.addEventListener('click', handleLogTodayWeight);

  document.querySelectorAll('[data-chart-type]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      activeChartType = (e.currentTarget as HTMLElement).dataset.chartType as typeof activeChartType;
      renderExerciseChart();
    });
  });

  if (exercises.length > 0) {
    initExercisePicker(exercises);
  }

  if (selectedExercise) {
    renderExerciseChart();
  }
}

// ─── Bodyweight chart ─────────────────────────────────────────────────────────

async function renderBodyweightSection() {
  const entries = await getAllBodyweightEntries();
  const sorted = entries.sort((a, b) => a.measuredAt - b.measuredAt);

  const chartContainer = document.getElementById('bodyweight-chart');
  const chipArea = document.getElementById('bw-chip-area');
  if (!chartContainer) return;

  if (sorted.length === 0) {
    chartContainer.innerHTML = '<p class="text-muted" style="font-size:0.875rem;">No entries yet. Tap "Log Today" to start tracking.</p>';
    return;
  }

  try {
    const uPlot = (await import('uplot')).default;
    chartContainer.innerHTML = '';

    const goalLbs = await getGoalWeightLbs();

    const toDisplay = (lbs: number) =>
      displayUnit === 'kg' ? Math.round(lbsToKg(lbs) * 10) / 10 : lbs;

    const goalDisplay = goalLbs != null ? toDisplay(goalLbs) : null;
    const currentDisplay = toDisplay(sorted[sorted.length - 1].weightLbs);

    // Progress chip
    if (chipArea) {
      if (goalDisplay != null) {
        const diff = currentDisplay - goalDisplay;
        const absDiff = Math.abs(diff).toFixed(1);
        let chipText: string;
        let chipClass: string;
        if (Math.abs(diff) <= 0.5) {
          chipText = 'At goal';
          chipClass = 'bw-chip bw-chip--success';
        } else if (diff > 0) {
          chipText = `↓ ${absDiff} ${displayUnit} to goal`;
          chipClass = 'bw-chip';
        } else {
          chipText = `↑ ${absDiff} ${displayUnit} to goal`;
          chipClass = 'bw-chip';
        }
        chipArea.innerHTML = `<span class="${chipClass}">${chipText}</span>`;
      } else {
        chipArea.innerHTML = '';
      }
    }

    const timestamps = sorted.map(e => e.measuredAt / 1000);
    const weights = sorted.map(e => toDisplay(e.weightLbs));

    const style = getComputedStyle(document.documentElement);
    const textColor = style.getPropertyValue('--text-secondary').trim() || '#888';
    const gridColor = style.getPropertyValue('--border-color').trim() || '#333';
    const warningColor = style.getPropertyValue('--warning').trim() || '#ff9f0a';

    const drawHook = goalDisplay != null ? (u: any) => {
      const ctx: CanvasRenderingContext2D = u.ctx;
      const yPx = u.valToPos(goalDisplay, 'y', true);
      ctx.save();
      ctx.strokeStyle = warningColor + 'aa';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(u.bbox.left, yPx);
      ctx.lineTo(u.bbox.left + u.bbox.width, yPx);
      ctx.stroke();
      ctx.fillStyle = warningColor + 'cc';
      const dpr = window.devicePixelRatio || 1;
      ctx.font = `${Math.round(13 * dpr)}px -apple-system, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Goal: ${goalDisplay} ${displayUnit}`, u.bbox.left + 4 * dpr, yPx - 4 * dpr);
      ctx.restore();
    } : null;

    const opts: any = {
      width: chartContainer.clientWidth || 340,
      height: 200,
      scales: {
        x: { time: true },
        y: {
          range: (_u: any, dataMin: number, dataMax: number) => {
            let lo = dataMin;
            let hi = dataMax;
            if (goalDisplay != null) {
              lo = Math.min(lo, goalDisplay);
              hi = Math.max(hi, goalDisplay);
            }
            const pad = Math.max((hi - lo) * 0.1, 1);
            return [lo - pad, hi + pad];
          },
        },
      },
      series: [
        {},
        {
          label: `Bodyweight (${displayUnit})`,
          stroke: '#4a9eff',
          width: 2,
          fill: 'rgba(74,158,255,0.08)',
          points: { show: true, size: 5, fill: '#4a9eff' },
        },
      ],
      axes: [
        { stroke: textColor, grid: { stroke: gridColor } },
        { label: displayUnit, stroke: textColor, grid: { stroke: gridColor } },
      ],
      cursor: { show: false },
      legend: { show: false },
      hooks: drawHook ? { draw: [drawHook] } : {},
    };

    new uPlot(opts, [timestamps, weights], chartContainer);
  } catch {
    chartContainer.innerHTML = '';
  }
}


async function handleLogTodayWeight() {
  const entries = await getAllBodyweightEntries();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayEntry = entries.find(e => {
    const d = new Date(e.measuredAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
  });

  const existingDisplay = todayEntry
    ? (displayUnit === 'kg' ? (todayEntry.weightLbs * 0.45359237).toFixed(1) : todayEntry.weightLbs.toFixed(1))
    : '';

  const body = document.createElement('div');
  body.innerHTML = `
    <input
      type="number"
      inputmode="decimal"
      id="log-weight-input"
      placeholder="${existingDisplay || '0'}"
      value="${existingDisplay}"
      step="${displayUnit === 'kg' ? '0.1' : '0.5'}"
      style="width:100%;padding:0.75rem;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-secondary);color:var(--text-primary);font-size:1.25rem;text-align:center;"
    />
    <div class="text-muted" style="font-size:0.8rem;margin-top:0.5rem;text-align:center;">${displayUnit}</div>
  `;

  showModal({
    title: todayEntry ? "Update Today's Weight" : "Log Today's Weight",
    body,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: todayEntry ? 'Update' : 'Save',
        className: 'btn btn-primary',
        onClick: async () => {
          const input = document.getElementById('log-weight-input') as HTMLInputElement;
          const val = parseFloat(input.value);
          if (!val || val <= 0) { showToast('Enter a valid weight', 'error'); return; }
          const weightLbs = displayUnit === 'kg' ? val / 0.45359237 : val;
          if (todayEntry) {
            await updateBodyweightEntry({ ...todayEntry, weightLbs });
            showToast('Weight updated', 'success');
          } else {
            const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).getTime();
            await addBodyweightEntry(weightLbs, noon);
            showToast('Weight logged', 'success');
          }
          trySyncNow();
          renderBodyweightSection();
        },
      },
    ],
  });

  setTimeout(() => {
    const input = document.getElementById('log-weight-input') as HTMLInputElement;
    input?.focus();
    input?.select();
  }, 100);
}

// ─── Exercise picker ──────────────────────────────────────────────────────────

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
            style="padding:0.75rem 1rem;cursor:pointer;font-size:0.95rem;border-bottom:0.5px solid var(--border-color);background:${selectedExercise?.id === ex.id ? 'var(--accent)' : 'transparent'};color:${selectedExercise?.id === ex.id ? '#fff' : 'var(--text-primary)'};"
          >${ex.name}</div>
        `).join('');

    dropdown.style.display = 'block';

    dropdown.querySelectorAll('[data-ex-id]').forEach(row => {
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        pickExercise(el.dataset.exId!, el.dataset.exName!, exercises);
      });
    });
  };

  input.addEventListener('focus', () => showDropdown(input.value));
  input.addEventListener('input', () => showDropdown(input.value));
  input.addEventListener('blur', () => { setTimeout(() => { dropdown.style.display = 'none'; }, 150); });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('exercise-picker-wrap')?.contains(e.target as Node)) {
      dropdown.style.display = 'none';
    }
  });
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

// ─── Exercise chart ───────────────────────────────────────────────────────────

async function renderExerciseChart() {
  const chartContainer = document.getElementById('exercise-chart');
  if (!chartContainer || !selectedExercise) return;

  document.querySelectorAll('[data-chart-type]').forEach(btn => {
    const el = btn as HTMLElement;
    el.className = `btn btn-small ${el.dataset.chartType === activeChartType ? 'btn-primary' : 'btn-secondary'}`;
  });

  chartContainer.innerHTML = '<div class="text-muted" style="font-size:0.875rem;">Loading…</div>';

  try {
    const uPlot = (await import('uplot')).default;
    const sets = await getExerciseSets(selectedExercise.id);
    const sessions = await getEndedSessions();

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

    const seriesLabel =
      activeChartType === 'e1rm' ? `Est. 1RM (${displayUnit})`
      : activeChartType === 'top' ? `Top Set (${displayUnit})`
      : `Volume (${displayUnit})`;

    const style = getComputedStyle(document.documentElement);
    const textColor = style.getPropertyValue('--text-secondary').trim() || '#888';
    const gridColor = style.getPropertyValue('--border-color').trim() || '#333';

    const opts: any = {
      width: chartContainer.clientWidth || 340,
      height: 240,
      scales: { x: { time: true } },
      series: [
        {},
        { label: seriesLabel, stroke: '#4a9eff', width: 2, fill: 'rgba(74,158,255,0.08)' },
      ],
      axes: [
        { stroke: textColor, grid: { stroke: gridColor } },
        { label: seriesLabel, stroke: textColor, grid: { stroke: gridColor } },
      ],
      cursor: { show: false },
      legend: { show: false },
    };

    new uPlot(opts, [dataPoints.map(d => d.timestamp), dataPoints.map(d => d.value)], chartContainer);
  } catch (err) {
    console.error(err);
    chartContainer.innerHTML = '<p class="text-muted">Error loading chart</p>';
  }
}

// ─── History view ─────────────────────────────────────────────────────────────

const exercisesCache = new Map<string, Exercise>();
const templateNamesCache = new Map<string, string>();

async function renderHistoryView(container: HTMLElement) {
  container.innerHTML = `
    <div class="seg-control mb-2">
      <button class="seg-btn ${activeHistoryView === 'workouts' ? 'active' : ''}" data-history-view="workouts">Workouts</button>
      <button class="seg-btn ${activeHistoryView === 'weight'   ? 'active' : ''}" data-history-view="weight">Weight Log</button>
    </div>
    <div id="history-content"></div>
  `;

  document.querySelectorAll('[data-history-view]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const view = (btn as HTMLElement).dataset.historyView as typeof activeHistoryView;
      if (view === activeHistoryView) return;
      activeHistoryView = view;
      expandedSessionId = null;
      document.querySelectorAll('[data-history-view]').forEach(b => {
        (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.historyView === activeHistoryView);
      });
      await renderHistoryContent();
    });
  });

  await renderHistoryContent();
}

async function renderHistoryContent() {
  const container = document.getElementById('history-content');
  if (!container) return;
  if (activeHistoryView === 'workouts') {
    await renderWorkoutsView(container);
  } else {
    await renderWeightView(container);
  }
}

async function renderWorkoutsView(container: HTMLElement) {
  const sessions = await getEndedSessions();
  const sorted = sessions.sort((a, b) => b.endedAt! - a.endedAt!);

  if (sorted.length === 0) {
    container.innerHTML = '<p class="text-muted">No completed workouts yet.</p>';
    return;
  }

  const allPRs = await getAllExercisePRs();

  for (const session of sorted) {
    if (session.templateId && !templateNamesCache.has(session.templateId)) {
      const tmpl = await getTemplate(session.templateId);
      if (tmpl) templateNamesCache.set(session.templateId, tmpl.name);
    }
  }

  const cards: string[] = [];
  for (const session of sorted) {
    const name = session.templateId
      ? (templateNamesCache.get(session.templateId) ?? 'Workout')
      : 'Workout';
    const mins = Math.round((session.endedAt! - session.startedAt) / 60000);
    const dateStr = new Date(session.endedAt!).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
    const isExpanded = expandedSessionId === session.id;

    if (!sessionSetsCache.has(session.id)) {
      sessionSetsCache.set(session.id, await getSessionSets(session.id));
    }
    const sets = sessionSetsCache.get(session.id)!;
    const uniqueExerciseIds = [...new Set(sets.map(s => s.exerciseId))];
    for (const exId of uniqueExerciseIds) {
      if (!exercisesCache.has(exId)) {
        const ex = await getExercise(exId);
        if (ex) exercisesCache.set(exId, ex);
      }
    }

    const filledAll = sets.filter(s => s.reps !== undefined && s.weightLbs !== undefined)
      .map(s => ({ reps: s.reps!, weightLbs: s.weightLbs! }));
    const volumeStr = filledAll.length > 0 ? formatVolume(filledAll, displayUnit) : null;

    const exerciseEntries = uniqueExerciseIds.map(exId => {
      const exName = exercisesCache.get(exId)?.name;
      if (!exName) return null;
      const filledSets = sets.filter(s => s.exerciseId === exId && s.reps !== undefined && s.weightLbs !== undefined)
        .map(s => ({ reps: s.reps!, weightLbs: s.weightLbs! }));
      const sessionBest = findBestE1RM(filledSets);
      const pr = allPRs.get(exId) as ExercisePR | undefined;
      const isPR = !!(pr && sessionBest && Math.abs(sessionBest.e1rm - pr.bestE1rm) < 0.01);
      return { name: exName, isPR };
    }).filter(Boolean) as Array<{ name: string; isPR: boolean }>;

    let expandedHtml = '';
    if (isExpanded) expandedHtml = await buildSessionEditHtml(session);

    const exerciseListHtml = !isExpanded && exerciseEntries.length > 0
      ? `<div style="margin-top:0.4rem;">${exerciseEntries.map(e =>
          `<div style="font-size:0.8rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.3rem;">
            • ${e.name}
            ${e.isPR ? `<span style="font-size:0.7rem;font-weight:600;color:var(--accent);">PR</span>` : ''}
          </div>`
        ).join('')}</div>`
      : '';

    cards.push(`
      <div class="card mb-2">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;${isExpanded ? 'margin-bottom:0.75rem;' : ''}">
          <div>
            <div style="font-weight:600;">${name}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">${dateStr} · ${mins} min${volumeStr ? ` · ${volumeStr}` : ''}</div>
            ${exerciseListHtml}
          </div>
          <div style="display:flex;gap:0.5rem;flex-shrink:0;margin-left:0.5rem;">
            <button class="btn btn-secondary btn-small" data-session-action="${isExpanded ? 'collapse' : 'expand'}" data-session-id="${session.id}"
              style="min-height:36px;padding:0.25rem 0.75rem;font-size:0.85rem;">${isExpanded ? 'Done' : 'Edit'}</button>
            <button class="btn btn-danger btn-small" data-session-action="delete" data-session-id="${session.id}"
              style="min-height:36px;padding:0.25rem 0.75rem;font-size:0.85rem;">Delete</button>
          </div>
        </div>
        ${expandedHtml}
      </div>
    `);
  }

  container.innerHTML = cards.join('');

  container.querySelectorAll('[data-session-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const el = btn as HTMLElement;
      const action = el.dataset.sessionAction!;
      const sessionId = el.dataset.sessionId!;
      if (action === 'expand') {
        expandedSessionId = sessionId;
        await renderHistoryContent();
      } else if (action === 'collapse') {
        expandedSessionId = null;
        await renderHistoryContent();
      } else if (action === 'delete') {
        handleDeleteSession(sessionId, sorted.find(s => s.id === sessionId)!);
      }
    });
  });

  if (expandedSessionId) attachSetEditHandlers(container);
}

async function buildSessionEditHtml(session: Session): Promise<string> {
  if (!sessionSetsCache.has(session.id)) {
    sessionSetsCache.set(session.id, await getSessionSets(session.id));
  }
  const sets = sessionSetsCache.get(session.id)!;
  const exerciseIds = [...new Set(sets.map(s => s.exerciseId))];
  for (const exId of exerciseIds) {
    if (!exercisesCache.has(exId)) {
      const ex = await getExercise(exId);
      if (ex) exercisesCache.set(exId, ex);
    }
  }

  const groups = new Map<string, SetEntry[]>();
  for (const set of sets) {
    if (!groups.has(set.exerciseId)) groups.set(set.exerciseId, []);
    groups.get(set.exerciseId)!.push(set);
  }
  for (const [, g] of groups) g.sort((a, b) => a.setIndex - b.setIndex);

  if (groups.size === 0) return '<p class="text-muted" style="font-size:0.875rem;">No sets logged.</p>';

  const exerciseBlocks = [...groups.entries()].map(([exId, exSets]) => {
    const ex = exercisesCache.get(exId);
    if (!ex) return '';
    const rows = exSets.map((set, idx) => {
      const weightVal = set.weightLbs !== undefined
        ? (displayUnit === 'kg' ? (set.weightLbs * 0.45359237).toFixed(2) : set.weightLbs.toFixed(1))
        : '';
      return `
        <tr style="border-bottom:0.5px solid var(--border-color);">
          <td style="padding:0.4rem;font-size:0.875rem;color:var(--text-secondary);">${idx + 1}</td>
          <td style="padding:0.25rem;text-align:center;">
            <input type="number" inputmode="numeric" value="${set.reps ?? ''}" placeholder="0"
              data-edit-set-id="${set.id}" data-edit-field="reps"
              style="width:55px;padding:0.4rem;text-align:center;min-height:40px;border-radius:8px;" />
          </td>
          <td style="padding:0.25rem;text-align:center;">
            <input type="number" inputmode="decimal" value="${weightVal}" placeholder="0"
              step="${displayUnit === 'kg' ? '0.25' : '0.5'}"
              data-edit-set-id="${set.id}" data-edit-field="weight"
              style="width:70px;padding:0.4rem;text-align:center;min-height:40px;border-radius:8px;" />
          </td>
          <td style="padding:0.25rem;text-align:center;">
            <button class="btn btn-danger" data-edit-action="delete-set" data-edit-set-id="${set.id}"
              data-edit-session-id="${session.id}"
              style="padding:0.25rem 0.4rem;min-height:36px;min-width:36px;font-size:1rem;">🗑</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div style="margin-bottom:1rem;">
        <div style="font-weight:600;font-size:0.95rem;margin-bottom:0.4rem;">${ex.name}</div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:0.5px solid var(--border-color);">
              <th style="padding:0.4rem;text-align:left;font-size:0.8rem;color:var(--text-secondary);">#</th>
              <th style="padding:0.4rem;text-align:center;font-size:0.8rem;color:var(--text-secondary);">Reps</th>
              <th style="padding:0.4rem;text-align:center;font-size:0.8rem;color:var(--text-secondary);">Weight</th>
              <th style="padding:0.4rem;width:40px;"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <button class="btn btn-secondary btn-small" data-edit-action="add-set"
          data-edit-exercise-id="${exId}" data-edit-session-id="${session.id}"
          style="margin-top:0.5rem;font-size:0.8rem;">+ Set</button>
      </div>
    `;
  }).join('');

  return `<div>${exerciseBlocks}</div>`;
}

function attachSetEditHandlers(container: HTMLElement) {
  container.querySelectorAll('input[data-edit-set-id]').forEach(input => {
    input.addEventListener('change', async (e) => {
      const el = e.target as HTMLInputElement;
      const setId = el.dataset.editSetId!;
      const field = el.dataset.editField!;
      let targetSet: SetEntry | undefined;
      for (const sets of sessionSetsCache.values()) {
        targetSet = sets.find(s => s.id === setId);
        if (targetSet) break;
      }
      if (!targetSet) return;
      if (field === 'reps') {
        targetSet.reps = el.value ? parseInt(el.value) : undefined;
      } else {
        targetSet.weightLbs = el.value ? parseEnteredWeight(el.value, displayUnit) : undefined;
      }
      await updateSetEntry(targetSet);
    });
  });

  container.querySelectorAll('[data-edit-action="delete-set"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const el = btn as HTMLElement;
      const setId = el.dataset.editSetId!;
      const sessionId = el.dataset.editSessionId!;
      await deleteSetEntry(setId);
      const cached = sessionSetsCache.get(sessionId);
      if (cached) sessionSetsCache.set(sessionId, cached.filter(s => s.id !== setId));
      await renderHistoryContent();
      attachSetEditHandlers(document.getElementById('history-content')!);
    });
  });

  container.querySelectorAll('[data-edit-action="add-set"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const el = btn as HTMLElement;
      const exerciseId = el.dataset.editExerciseId!;
      const sessionId = el.dataset.editSessionId!;
      const cached = sessionSetsCache.get(sessionId) ?? [];
      const exerciseSets = cached.filter(s => s.exerciseId === exerciseId);
      const maxIndex = exerciseSets.length > 0 ? Math.max(...exerciseSets.map(s => s.setIndex)) : -1;
      const newSet = await createSetEntry(sessionId, exerciseId, maxIndex + 1);
      cached.push(newSet);
      sessionSetsCache.set(sessionId, cached);
      await renderHistoryContent();
      attachSetEditHandlers(document.getElementById('history-content')!);
    });
  });
}

function handleDeleteSession(sessionId: string, session: Session) {
  const dateStr = new Date(session.endedAt!).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  showModal({
    title: 'Delete Workout',
    body: `Delete the workout from ${dateStr}? This cannot be undone.`,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Delete',
        className: 'btn btn-danger',
        onClick: async () => {
          await deleteSession(sessionId);
          sessionSetsCache.delete(sessionId);
          if (expandedSessionId === sessionId) expandedSessionId = null;
          showToast('Workout deleted', 'success');
          await renderHistoryContent();
        },
      },
    ],
  });
}

// ─── Weight log ───────────────────────────────────────────────────────────────

function toDateInputValue(ts: number): string {
  const d = new Date(ts);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function fromDateInputValue(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

async function renderWeightView(container: HTMLElement) {
  const entries = await getAllBodyweightEntries();
  const sorted = [...entries].sort((a, b) => b.measuredAt - a.measuredAt);

  const rows = sorted.length === 0
    ? '<p class="text-muted">No entries yet.</p>'
    : sorted.map(entry => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:0.5px solid var(--border-color);">
          <div>
            <div style="font-weight:500;">${formatWeight(entry.weightLbs, displayUnit)}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">
              ${new Date(entry.measuredAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button class="btn btn-secondary btn-small" data-weight-action="edit" data-weight-id="${entry.id}" style="padding:0.25rem 0.6rem;min-height:32px;font-size:0.8rem;">Edit</button>
            <button class="btn btn-danger btn-small" data-weight-action="delete" data-weight-id="${entry.id}" style="padding:0.25rem 0.6rem;min-height:32px;font-size:0.8rem;">Delete</button>
          </div>
        </div>
      `).join('');

  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem;">
      <button class="btn btn-primary btn-small" id="add-weight-btn">+ Add Entry</button>
    </div>
    <div>${rows}</div>
  `;

  document.getElementById('add-weight-btn')?.addEventListener('click', handleAddWeight);

  container.querySelectorAll('[data-weight-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement;
      const entry = sorted.find(e => e.id === el.dataset.weightId);
      if (!entry) return;
      if (el.dataset.weightAction === 'edit') handleEditWeight(entry);
      else handleDeleteWeight(entry);
    });
  });
}

async function handleAddWeight() {
  const allEntries = await getAllBodyweightEntries();
  const todayStr = toDateInputValue(Date.now());

  const placeholderFor = (dateStr: string) => {
    const existing = allEntries.find(e => toDateInputValue(e.measuredAt) === dateStr);
    if (!existing) return '0';
    return displayUnit === 'kg' ? lbsToKg(existing.weightLbs).toFixed(1) : existing.weightLbs.toFixed(1);
  };

  const body = document.createElement('div');
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.75rem;">
      <div>
        <label style="display:block;font-size:0.875rem;color:var(--text-secondary);margin-bottom:0.25rem;">Date</label>
        <input type="date" id="wh-date" value="${todayStr}" style="width:100%;" />
      </div>
      <div>
        <label style="display:block;font-size:0.875rem;color:var(--text-secondary);margin-bottom:0.25rem;">Weight (${displayUnit})</label>
        <input type="number" inputmode="decimal" id="wh-weight" placeholder="${placeholderFor(todayStr)}"
          step="${displayUnit === 'kg' ? '0.1' : '0.5'}" style="width:100%;" />
      </div>
    </div>
  `;

  (body.querySelector('#wh-date') as HTMLInputElement).addEventListener('change', (e) => {
    (body.querySelector('#wh-weight') as HTMLInputElement).placeholder = placeholderFor((e.target as HTMLInputElement).value);
  });

  showModal({
    title: 'Add Weight Entry',
    body,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Save',
        className: 'btn btn-primary',
        onClick: async () => {
          const dateVal = (document.getElementById('wh-date') as HTMLInputElement)?.value;
          const weightVal = (document.getElementById('wh-weight') as HTMLInputElement)?.value;
          if (!dateVal || !weightVal) { showToast('Please fill in all fields', 'error'); return; }
          const weightLbs = parseEnteredWeight(weightVal, displayUnit);
          const measuredAt = fromDateInputValue(dateVal);
          const existing = (await getAllBodyweightEntries()).find(e => toDateInputValue(e.measuredAt) === dateVal);
          if (existing) {
            await updateBodyweightEntry({ ...existing, weightLbs });
            showToast('Updated existing entry for this date', 'success');
          } else {
            await addBodyweightEntry(weightLbs, measuredAt);
            showToast('Entry added', 'success');
          }
          const container = document.getElementById('history-content');
          if (container) await renderWeightView(container);
        },
      },
    ],
  });
  setTimeout(() => (document.getElementById('wh-weight') as HTMLInputElement)?.focus(), 100);
}

function handleEditWeight(entry: BodyweightEntry) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.75rem;">
      <div>
        <label style="display:block;font-size:0.875rem;color:var(--text-secondary);margin-bottom:0.25rem;">Date</label>
        <input type="date" id="wh-edit-date" value="${toDateInputValue(entry.measuredAt)}" style="width:100%;" />
      </div>
      <div>
        <label style="display:block;font-size:0.875rem;color:var(--text-secondary);margin-bottom:0.25rem;">Weight (${displayUnit})</label>
        <input type="number" inputmode="decimal" id="wh-edit-weight"
          value="${displayUnit === 'kg' ? lbsToKg(entry.weightLbs).toFixed(1) : entry.weightLbs.toFixed(1)}"
          step="${displayUnit === 'kg' ? '0.1' : '0.5'}" style="width:100%;" />
      </div>
    </div>
  `;
  showModal({
    title: 'Edit Entry',
    body,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Save',
        className: 'btn btn-primary',
        onClick: async () => {
          const dateVal = (document.getElementById('wh-edit-date') as HTMLInputElement)?.value;
          const weightVal = (document.getElementById('wh-edit-weight') as HTMLInputElement)?.value;
          if (!dateVal || !weightVal) { showToast('Please fill in all fields', 'error'); return; }
          const conflict = (await getAllBodyweightEntries()).find(e => e.id !== entry.id && toDateInputValue(e.measuredAt) === dateVal);
          if (conflict) { showToast('There is already an entry for that date', 'error'); return; }
          await updateBodyweightEntry({
            ...entry,
            measuredAt: fromDateInputValue(dateVal),
            weightLbs: parseEnteredWeight(weightVal, displayUnit),
          });
          showToast('Entry updated', 'success');
          const container = document.getElementById('history-content');
          if (container) await renderWeightView(container);
        },
      },
    ],
  });
  setTimeout(() => (document.getElementById('wh-edit-weight') as HTMLInputElement)?.select(), 100);
}

function handleDeleteWeight(entry: BodyweightEntry) {
  showModal({
    title: 'Delete Entry',
    body: `Delete entry from ${new Date(entry.measuredAt).toLocaleDateString()} (${formatWeight(entry.weightLbs, displayUnit)})?`,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Delete',
        className: 'btn btn-danger',
        onClick: async () => {
          await deleteBodyweightEntry(entry.id);
          showToast('Entry deleted', 'success');
          const container = document.getElementById('history-content');
          if (container) await renderWeightView(container);
        },
      },
    ],
  });
}
