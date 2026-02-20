import {
  getSetting,
  getSession,
  getSessionSets,
  updateSetEntry,
  createSetEntry,
  deleteSetEntry,
  getExercise,
  getExerciseLast,
  endSession,
  deleteBlankSets,
  deleteSession,
  detectSessionPRs,
  getTemplate,
  getDisplayUnit,
  getAllTemplates,
  getAllExercises,
  getEndedSessions,
  createSession,
  deleteSetting,
} from '../../data/queries';
import type { Session, SetEntry, Exercise, ExerciseLast, DisplayUnit, Template, PRHit } from '../../data/models';
import { showToast } from '../components/Toast';
import { showModal } from '../components/Modal';
import { formatWeight, parseEnteredWeight, formatVolume } from '../../data/units';
import { renderTimer, attachTimerHandlers, initTimer } from '../components/Timer';

let activeSession: Session | null = null;
let sessionSets: SetEntry[] = [];
let exercisesMap: Map<string, Exercise> = new Map();
let exerciseLastMap: Map<string, ExerciseLast> = new Map();
let displayUnit: DisplayUnit = 'lbs';
let durationInterval: number | null = null;

function startDurationClock(startedAt: number) {
  if (durationInterval !== null) clearInterval(durationInterval);

  const el = () => document.getElementById('workout-duration');

  const tick = () => {
    const display = el();
    if (!display) { clearInterval(durationInterval!); durationInterval = null; return; }
    const totalSecs = Math.floor((Date.now() - startedAt) / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    display.textContent = h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  tick();
  durationInterval = window.setInterval(tick, 1000);
}

export async function renderWorkoutScreen() {
  const screen = document.getElementById('screen');
  if (!screen) return;

  // Load active session
  const activeId = await getSetting<string>('session.activeId');
  displayUnit = await getDisplayUnit();

  if (!activeId) {
    const [templates, endedSessions] = await Promise.all([
      getAllTemplates(),
      getEndedSessions(),
    ]);

    // Most recent completed session
    const lastSession = endedSessions.sort((a, b) => b.endedAt! - a.endedAt!)[0] ?? null;
    let lastWorkoutHtml = '';

    if (lastSession) {
      const sets = await getSessionSets(lastSession.id);
      // Group by exercise, keep only filled sets
      const grouped = new Map<string, typeof sets>();
      for (const set of sets) {
        if (set.reps === undefined || set.weightLbs === undefined) continue;
        if (!grouped.has(set.exerciseId)) grouped.set(set.exerciseId, []);
        grouped.get(set.exerciseId)!.push(set);
      }

      // Resolve exercise names
      const nameMap = new Map<string, string>();
      for (const exId of grouped.keys()) {
        const ex = await getExercise(exId);
        if (ex) nameMap.set(exId, ex.name);
      }

      let templateName = 'Workout';
      if (lastSession.templateId) {
        const tmpl = await getTemplate(lastSession.templateId);
        if (tmpl) templateName = tmpl.name;
      }

      const elapsed = lastSession.endedAt! - lastSession.startedAt;
      const mins = Math.round(elapsed / 60000);
      const dateStr = new Date(lastSession.endedAt!).toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric',
      });

      const exerciseRows = [...grouped.entries()].map(([exId, exSets]) => {
        const name = nameMap.get(exId) ?? 'Unknown';
        const setsSummary = exSets
          .sort((a, b) => a.setIndex - b.setIndex)
          .map(s => {
            const w = displayUnit === 'kg'
              ? `${(s.weightLbs! * 0.45359237).toFixed(1)} kg`
              : `${s.weightLbs} lb`;
            return `${s.reps} × ${w}`;
          })
          .join(', ');
        return `
          <div style="padding:0.4rem 0;border-bottom:0.5px solid var(--border-color);">
            <div style="font-weight:500;font-size:0.9rem;">${name}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">${setsSummary}</div>
          </div>`;
      }).join('');

      lastWorkoutHtml = `
        <div class="card mb-3">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.5rem;">
            <span style="font-weight:600;">${templateName}</span>
            <span style="font-size:0.8rem;color:var(--text-secondary);">${dateStr} · ${mins} min</span>
          </div>
          ${exerciseRows || '<p class="text-muted" style="font-size:0.875rem;">No sets logged</p>'}
        </div>`;
    }

    screen.innerHTML = `
      <div>
        <h1 class="mb-2">Workout</h1>

        ${lastWorkoutHtml ? `
          <p class="section-header mb-1">Last Workout</p>
          ${lastWorkoutHtml}
        ` : ''}

        ${templates.length === 0 ? `
          <div class="text-center mt-3">
            <p class="text-muted">No templates yet. Create one in the Templates tab.</p>
          </div>
        ` : `
          <p class="section-header mb-1">Start Workout</p>
          <div id="template-quick-start"></div>
        `}
      </div>
    `;

    if (templates.length > 0) {
      renderQuickStartTemplates(templates);
    }
    return;
  }

  const session = await getSession(activeId);
  activeSession = session || null;
  if (!activeSession) {
    // Stale pointer — session was lost (e.g. app closed mid-write). Clear it and show home.
    await deleteSetting('session.activeId');
    await renderWorkoutScreen();
    return;
  }

  // Load session data
  sessionSets = await getSessionSets(activeSession.id);

  // Get unique exercise IDs from sets
  const exerciseIds = [...new Set(sessionSets.map(s => s.exerciseId))];

  // Load exercises
  exercisesMap.clear();
  exerciseLastMap.clear();

  for (const exId of exerciseIds) {
    const ex = await getExercise(exId);
    if (ex) {
      exercisesMap.set(exId, ex);
    }
    const last = await getExerciseLast(exId);
    if (last) {
      exerciseLastMap.set(exId, last);
    }
  }

  // Get template name if available
  let workoutTitle = 'Workout';
  if (activeSession.templateId) {
    const template = await getTemplate(activeSession.templateId);
    if (template) {
      workoutTitle = template.name;
    }
  }

  screen.innerHTML = `
    <div>
      <!-- Fixed top bar: workout header + rest timer -->
      <div id="workout-top-bar" style="
        position:fixed;
        top:env(safe-area-inset-top);
        left:0;right:0;
        background:var(--bg-primary);
        border-bottom:0.5px solid var(--border-color);
        padding:0.5rem;
        z-index:50;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
          <h1 style="margin:0;font-size:1.5rem;">${workoutTitle}</h1>
          <div style="text-align:right;">
            <div id="workout-duration" style="font-size:1.25rem;font-weight:600;font-variant-numeric:tabular-nums;">0:00</div>
            <div class="text-muted" style="font-size:0.75rem;">
              started ${new Date(activeSession.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
        ${renderTimer()}
      </div>

      <!-- Exercises — padding-top set dynamically to clear the fixed top bar -->
      <div id="workout-scroll-content">
        <div id="exercises-container" style="padding-bottom:140px;"></div>
      </div>

      <!-- Fixed bottom bar: workout actions -->
      <div style="
        display:flex;flex-direction:column;gap:0.5rem;
        position:fixed;
        bottom:calc(50px + env(safe-area-inset-bottom));
        left:0;right:0;
        padding:0.75rem;
        background:var(--bg-primary);
        border-top:0.5px solid var(--border-color);
        z-index:50;
      ">
        <button class="btn btn-secondary" id="add-exercise-btn" style="width:100%;">
          + Add Exercise
        </button>
        <button class="btn btn-primary" id="end-workout-btn" style="width:100%;">
          End Workout
        </button>
      </div>
    </div>
  `;

  renderExercises();

  // Start the workout duration clock
  startDurationClock(activeSession.startedAt);

  // Initialize and attach timer handlers
  await initTimer();
  attachTimerHandlers();

  // Measure the fixed top bar and push scroll content down accordingly
  requestAnimationFrame(() => {
    const topBar = document.getElementById('workout-top-bar');
    const scrollContent = document.getElementById('workout-scroll-content');
    if (topBar && scrollContent) {
      scrollContent.style.paddingTop = topBar.offsetHeight + 'px';
    }
  });

  document.getElementById('add-exercise-btn')?.addEventListener('click', handleAddExerciseToWorkout);
  document.getElementById('end-workout-btn')?.addEventListener('click', handleEndWorkout);
}

function renderExercises() {
  const container = document.getElementById('exercises-container');
  if (!container || !activeSession) return;

  // Group sets by exercise
  const exerciseGroups = new Map<string, SetEntry[]>();
  for (const set of sessionSets) {
    if (!exerciseGroups.has(set.exerciseId)) {
      exerciseGroups.set(set.exerciseId, []);
    }
    exerciseGroups.get(set.exerciseId)!.push(set);
  }

  // Sort each group by setIndex
  for (const [, sets] of exerciseGroups) {
    sets.sort((a, b) => a.setIndex - b.setIndex);
  }

  const html: string[] = [];

  for (const [exerciseId, sets] of exerciseGroups) {
    const exercise = exercisesMap.get(exerciseId);
    if (!exercise) continue;

    const last = exerciseLastMap.get(exerciseId);

    html.push(`
      <div class="card mb-2">
        <div class="card-header" style="margin-bottom: 1rem;">
          <h3 class="card-title">${exercise.name}</h3>
          <button class="btn btn-primary btn-small" data-exercise-id="${exerciseId}" data-action="add-set">
            + Set
          </button>
        </div>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 0.5px solid var(--border-color);">
                <th style="padding: 0.5rem; text-align: left; font-size: 0.875rem;">Set</th>
                <th style="padding: 0.5rem; text-align: left; font-size: 0.875rem;">Previous</th>
                <th style="padding: 0.5rem; text-align: center; font-size: 0.875rem;">Reps</th>
                <th style="padding: 0.5rem; text-align: center; font-size: 0.875rem;">Weight</th>
                <th style="padding: 0.5rem; width: 40px;"></th>
              </tr>
            </thead>
            <tbody>
              ${sets
                .map((set, idx) => {
                  const prevSet = last && last.sets[idx];
                  return `
                <tr style="border-bottom: 0.5px solid var(--border-color); ${
                  set.reps === undefined || set.weightLbs === undefined ? 'opacity: 0.5;' : ''
                }">
                  <td style="padding: 0.5rem; font-weight: 500;">${idx + 1}</td>
                  <td style="padding: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">
                    ${prevSet ? `${prevSet.reps} × ${formatWeight(prevSet.weightLbs, displayUnit)}` : '—'}
                  </td>
                  <td style="padding: 0.25rem; text-align: center;">
                    <input
                      type="number"
                      inputmode="numeric"
                      value="${set.reps !== undefined ? set.reps : ''}"
                      data-set-id="${set.id}"
                      data-field="reps"
                      placeholder="0"
                      style="width: 60px; padding: 0.5rem; text-align: center; min-height: 44px;"
                    />
                  </td>
                  <td style="padding: 0.25rem; text-align: center;">
                    <input
                      type="number"
                      inputmode="decimal"
                      value="${set.weightLbs !== undefined ? (displayUnit === 'kg' ? (set.weightLbs * 0.45359237).toFixed(2) : set.weightLbs.toFixed(1)) : ''}"
                      data-set-id="${set.id}"
                      data-field="weight"
                      placeholder="0"
                      step="${displayUnit === 'kg' ? '0.25' : '0.5'}"
                      style="width: 80px; padding: 0.5rem; text-align: center; min-height: 44px;"
                    />
                  </td>
                  <td style="padding: 0.25rem; text-align: center;">
                    <button
                      class="btn btn-danger"
                      data-set-id="${set.id}"
                      data-action="delete-set"
                      style="padding: 0.5rem; min-height: 44px; font-size: 1.2rem; min-width: 44px;"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              `;
                })
                .join('')}
            </tbody>
          </table>
        </div>

        ${last && last.sets.length > sets.length ? `<div class="text-muted mt-1" style="font-size: 0.875rem;">+${last.sets.length - sets.length} more last time</div>` : ''}
      </div>
    `);
  }

  container.innerHTML = html.join('');

  // Attach event listeners
  container.querySelectorAll('input[data-set-id]').forEach(input => {
    input.addEventListener('change', handleSetInputChange);
  });

  container.querySelectorAll('[data-action="add-set"]').forEach(btn => {
    btn.addEventListener('click', handleAddSet);
  });

  container.querySelectorAll('[data-action="delete-set"]').forEach(btn => {
    btn.addEventListener('click', handleDeleteSet);
  });
}

async function handleSetInputChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const setId = input.dataset.setId!;
  const field = input.dataset.field!;
  const value = input.value;

  const set = sessionSets.find(s => s.id === setId);
  if (!set) return;

  if (field === 'reps') {
    set.reps = value ? parseInt(value) : undefined;
  } else if (field === 'weight') {
    set.weightLbs = value ? parseEnteredWeight(value, displayUnit) : undefined;
  }

  await updateSetEntry(set);

  // Update row opacity in-place — avoids a full re-render which causes scroll jumps
  const row = input.closest('tr') as HTMLTableRowElement | null;
  if (row) {
    row.style.opacity = (set.reps === undefined || set.weightLbs === undefined) ? '0.5' : '';
  }
}

async function handleAddSet(e: Event) {
  const btn = e.currentTarget as HTMLElement;
  const exerciseId = btn.dataset.exerciseId!;

  if (!activeSession) return;

  // Find max setIndex for this exercise
  const exerciseSets = sessionSets.filter(s => s.exerciseId === exerciseId);
  const maxIndex = exerciseSets.length > 0 ? Math.max(...exerciseSets.map(s => s.setIndex)) : -1;

  const newSet = await createSetEntry(activeSession.id, exerciseId, maxIndex + 1);
  sessionSets.push(newSet);

  renderExercises();
  showToast('Set added', 'info');
}

async function handleDeleteSet(e: Event) {
  const btn = e.currentTarget as HTMLElement;
  const setId = btn.dataset.setId!;

  await deleteSetEntry(setId);
  sessionSets = sessionSets.filter(s => s.id !== setId);

  renderExercises();
  showToast('Set deleted', 'info');
}

async function handleEndWorkout() {
  if (!activeSession) return;

  // Check for blank sets
  const blankSets = sessionSets.filter(s => s.reps === undefined || s.weightLbs === undefined);

  if (blankSets.length > 0) {
    showModal({
      title: 'Empty Sets',
      body: `You have ${blankSets.length} empty set${blankSets.length !== 1 ? 's' : ''}. Discard empty sets and finish?`,
      buttons: [
        { text: 'Go Back', className: 'btn btn-secondary', onClick: () => {} },
        {
          text: 'Discard & Finish',
          className: 'btn btn-primary',
          onClick: async () => {
            await finishWorkout();
          },
        },
      ],
    });
  } else {
    await finishWorkout();
  }
}

async function handleAddExerciseToWorkout() {
  if (!activeSession) return;

  const allExercises = await getAllExercises();
  // Exercises already in this workout
  const inWorkout = new Set(sessionSets.map(s => s.exerciseId));

  const body = document.createElement('div');

  const searchId = 'add-ex-search';
  const listId = 'add-ex-list';

  body.innerHTML = `
    <input
      type="text"
      id="${searchId}"
      placeholder="Search exercises…"
      style="width:100%;margin-bottom:0.75rem;"
      autocomplete="off"
    />
    <div id="${listId}" style="max-height:300px;overflow-y:auto;"></div>
  `;

  let selectedExerciseId: string | null = null;

  const renderList = (query: string) => {
    const list = body.querySelector(`#${listId}`)!;
    const filtered = allExercises
      .filter(ex => ex.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));

    list.innerHTML = filtered.map(ex => {
      const already = inWorkout.has(ex.id);
      const isSelected = ex.id === selectedExerciseId;
      return `
        <div
          data-ex-id="${ex.id}"
          style="
            padding:0.6rem 0.75rem;
            border-radius:6px;
            cursor:${already ? 'default' : 'pointer'};
            background:${isSelected ? 'var(--accent)' : 'transparent'};
            color:${isSelected ? '#fff' : already ? 'var(--text-secondary)' : 'var(--text-primary)'};
            display:flex;justify-content:space-between;align-items:center;
          "
        >
          <span style="font-size:0.9rem;">${ex.name}</span>
          ${already ? '<span style="font-size:0.75rem;">already added</span>' : ''}
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-ex-id]').forEach(row => {
      const exId = (row as HTMLElement).dataset.exId!;
      const already = inWorkout.has(exId);
      if (already) return;
      row.addEventListener('click', () => {
        selectedExerciseId = exId;
        renderList((body.querySelector(`#${searchId}`) as HTMLInputElement).value);
      });
    });
  };

  renderList('');

  body.querySelector(`#${searchId}`)?.addEventListener('input', (e) => {
    renderList((e.target as HTMLInputElement).value);
  });

  showModal({
    title: 'Add Exercise',
    body,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Add',
        className: 'btn btn-primary',
        onClick: async () => {
          if (!selectedExerciseId || !activeSession) {
            showToast('Select an exercise first', 'error');
            return;
          }

          const exercise = await getExercise(selectedExerciseId);
          if (!exercise) return;

          // Load previous sets for this exercise to guess set count
          const last = await getExerciseLast(selectedExerciseId);
          const setCount = last ? Math.max(last.sets.length, 1) : 3;

          for (let i = 0; i < setCount; i++) {
            const newSet = await createSetEntry(activeSession.id, selectedExerciseId, i);
            sessionSets.push(newSet);
          }

          // Load exercise into our maps so it renders
          exercisesMap.set(selectedExerciseId, exercise);
          if (last) exerciseLastMap.set(selectedExerciseId, last);

          renderExercises();
          showToast(`Added ${exercise.name}`, 'success');
        },
      },
    ],
  });

  setTimeout(() => (body.querySelector(`#${searchId}`) as HTMLInputElement)?.focus(), 100);
}

async function finishWorkout() {
  if (!activeSession) return;

  if (durationInterval !== null) { clearInterval(durationInterval); durationInterval = null; }

  await deleteBlankSets(activeSession.id);

  const filledSets = sessionSets.filter(s => s.reps !== undefined && s.weightLbs !== undefined);
  if (filledSets.length === 0) {
    await deleteSession(activeSession.id);
    activeSession = null;
    sessionSets = [];
    showToast('Empty workout discarded', 'info');
    renderWorkoutScreen();
    return;
  }

  // Capture everything we need before resetting state
  const durationMs = Date.now() - activeSession.startedAt;
  let workoutTitle = 'Workout';
  if (activeSession.templateId) {
    const tmpl = await getTemplate(activeSession.templateId);
    if (tmpl) workoutTitle = tmpl.name;
  }
  const completedSets = [...filledSets];
  const snapshotExercisesMap = new Map(exercisesMap);
  const snapshotDisplayUnit = displayUnit;

  // Detect PRs BEFORE endSession updates the stored records
  const prHits = await detectSessionPRs(completedSets);

  await endSession(activeSession.id);

  // Reset state
  activeSession = null;
  sessionSets = [];

  renderWorkoutCompleteScreen(workoutTitle, durationMs, completedSets, snapshotExercisesMap, snapshotDisplayUnit, prHits);
}

function renderWorkoutCompleteScreen(
  workoutTitle: string,
  durationMs: number,
  filledSets: SetEntry[],
  exMap: Map<string, Exercise>,
  unit: DisplayUnit,
  prHits: Map<string, PRHit>,
) {
  const screen = document.getElementById('screen');
  if (!screen) return;

  const totalMins = Math.round(durationMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const durationStr = h > 0 ? `${h}h ${m}m` : `${totalMins}m`;

  // Group sets by exercise, preserving encounter order
  const exerciseGroups = new Map<string, SetEntry[]>();
  for (const set of filledSets) {
    if (!exerciseGroups.has(set.exerciseId)) exerciseGroups.set(set.exerciseId, []);
    exerciseGroups.get(set.exerciseId)!.push(set);
  }

  const exerciseSummaries = [...exerciseGroups.entries()].map(([exId, sets]) => {
    const name = exMap.get(exId)?.name ?? 'Unknown';
    const bestSet = sets.reduce((best, s) => (s.weightLbs! >= best.weightLbs! ? s : best));
    const weightDisplay = unit === 'kg'
      ? `${(bestSet.weightLbs! * 0.45359237).toFixed(1)} kg`
      : `${bestSet.weightLbs!} lb`;
    const pr = prHits.get(exId);
    return { name, sets, bestSet, weightDisplay, pr };
  });

  const allFilledSets = filledSets
    .filter(s => s.reps !== undefined && s.weightLbs !== undefined)
    .map(s => ({ reps: s.reps!, weightLbs: s.weightLbs! }));
  const volumeStr = formatVolume(allFilledSets, unit);

  const totalPRs = prHits.size;
  const headerEmoji = totalPRs > 0 ? '🏆' : '🎉';
  const headerText = totalPRs > 0
    ? `${totalPRs} New PR${totalPRs !== 1 ? 's' : ''}!`
    : 'Workout Done!';

  // Build Wordle-style share text
  const shareLines = [
    `💪 ${workoutTitle}`,
    `⏱️ ${durationStr} · ${exerciseSummaries.length} exercise${exerciseSummaries.length !== 1 ? 's' : ''} · ${volumeStr} total`,
    ...(totalPRs > 0 ? [`🏆 ${totalPRs} new PR${totalPRs !== 1 ? 's' : ''}!`] : []),
    '',
    ...exerciseSummaries.map(e => {
      const prTag = e.pr ? (e.pr.e1rmPR ? ' 🏆 PR' : ' 🏆 weight PR') : '';
      return `${e.name}: ${e.bestSet.reps} × ${e.weightDisplay}${prTag}`;
    }),
    '',
    'Logged with Fit 🔥',
  ];
  const shareText = shareLines.join('\n');

  const canShare = !!navigator.share;

  screen.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;padding:2.5rem 1rem 1rem;text-align:center;">
      <div style="font-size:4rem;line-height:1;margin-bottom:1rem;">${headerEmoji}</div>
      <h1 style="margin-bottom:0.25rem;">${headerText}</h1>
      <p style="color:var(--text-secondary);margin-bottom:1.5rem;">${workoutTitle} · ${durationStr} · ${volumeStr} total</p>

      <div class="card mb-3" style="width:100%;text-align:left;">
        ${exerciseSummaries.map((e, i) => `
          <div style="padding:0.6rem 0;${i < exerciseSummaries.length - 1 ? 'border-bottom:0.5px solid var(--border-color);' : ''}">
            <div style="font-weight:500;display:flex;align-items:center;gap:0.4rem;">
              ${e.name}
              ${e.pr ? `<span style="font-size:0.75rem;font-weight:600;color:var(--accent);background:var(--bg-tertiary);padding:0.1rem 0.4rem;border-radius:4px;">PR</span>` : ''}
            </div>
            <div style="font-size:0.875rem;color:var(--text-secondary);">
              ${e.sets.length} set${e.sets.length !== 1 ? 's' : ''} · Best: ${e.bestSet.reps} × ${e.weightDisplay}
            </div>
          </div>
        `).join('')}
      </div>

      <div style="display:flex;flex-direction:column;gap:0.75rem;width:100%;">
        ${canShare ? `
          <button class="btn btn-primary" id="share-btn" style="width:100%;">Share Workout</button>
        ` : `
          <button class="btn btn-primary" id="copy-btn" style="width:100%;">Copy Summary</button>
        `}
        <button class="btn btn-secondary" id="done-btn" style="width:100%;">Done</button>
      </div>
    </div>
  `;

  document.getElementById('share-btn')?.addEventListener('click', async () => {
    try {
      await navigator.share({ text: shareText });
    } catch {
      // User cancelled — do nothing
    }
  });

  document.getElementById('copy-btn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Copied to clipboard!', 'success');
    } catch {
      showToast('Copy failed', 'error');
    }
  });

  document.getElementById('done-btn')?.addEventListener('click', () => {
    renderWorkoutScreen();
  });
}

async function renderQuickStartTemplates(templates: Template[]) {
  const container = document.getElementById('template-quick-start');
  if (!container) return;

  // Load exercises for display
  const allExercises = await Promise.all(
    templates.flatMap(t => t.exerciseIds.map(id => getExercise(id)))
  );
  const exercisesMap = new Map(allExercises.filter(e => e).map(e => [e!.id, e!]));

  container.innerHTML = templates
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(
      tmpl => `
    <div class="card mb-2">
      <div class="card-header">
        <div>
          <div class="card-title">${tmpl.name}</div>
          <div class="text-muted" style="font-size: 0.875rem;">
            ${tmpl.exerciseIds.length} exercise${tmpl.exerciseIds.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button class="btn btn-primary" data-template-id="${tmpl.id}">
          Start
        </button>
      </div>
      <div>
        ${tmpl.exerciseIds
          .map(exId => {
            const ex = exercisesMap.get(exId);
            return ex ? `<div class="text-muted" style="font-size: 0.875rem; margin-left: 0.5rem;">• ${ex.name}</div>` : '';
          })
          .join('')}
      </div>
    </div>
  `
    )
    .join('');

  // Attach handlers
  container.querySelectorAll('[data-template-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.templateId!;
      await handleQuickStartWorkout(id);
    });
  });
}

async function handleQuickStartWorkout(templateId: string) {
  const template = await getTemplate(templateId);
  if (!template) return;

  // Create session
  const session = await createSession(templateId);

  // Create initial set entries for each exercise
  for (const exerciseId of template.exerciseIds) {
    const exercise = await getExercise(exerciseId);
    if (!exercise) continue;

    const last = await getExerciseLast(exerciseId);
    const setCount = last ? Math.max(last.sets.length, 1) : 3;

    for (let i = 0; i < setCount; i++) {
      await createSetEntry(session.id, exerciseId, i);
    }
  }

  showToast(`Started "${template.name}"`, 'success');
  renderWorkoutScreen();
}
