import {
  getEndedSessions,
  getSessionSets,
  getTemplate,
  getExercise,
  getDisplayUnit,
  updateSetEntry,
  deleteSetEntry,
  createSetEntry,
  deleteSession,
  getAllBodyweightEntries,
  addBodyweightEntry,
  updateBodyweightEntry,
  deleteBodyweightEntry,
} from '../../data/queries';
import type { Session, SetEntry, Exercise, DisplayUnit, BodyweightEntry } from '../../data/models';
import { showToast } from '../components/Toast';
import { showModal } from '../components/Modal';
import { formatWeight, parseEnteredWeight, lbsToKg } from '../../data/units';

let activeSubView: 'workouts' | 'weight' = 'workouts';
let displayUnit: DisplayUnit = 'lbs';
let expandedSessionId: string | null = null;
const sessionSetsCache = new Map<string, SetEntry[]>();
const exercisesCache = new Map<string, Exercise>();
const templateNamesCache = new Map<string, string>();

export async function renderHistoryScreen() {
  const screen = document.getElementById('screen');
  if (!screen) return;

  displayUnit = await getDisplayUnit();

  screen.innerHTML = `
    <div>
      <h1 class="mb-2">History</h1>
      <div style="display:flex;background:var(--bg-tertiary);border-radius:9px;padding:2px;margin-bottom:1rem;">
        ${segBtn('workouts', 'Workouts')}
        ${segBtn('weight', 'Weight')}
      </div>
      <div id="history-content"></div>
    </div>
  `;

  document.querySelectorAll('[data-history-view]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const view = (btn as HTMLElement).dataset.historyView as typeof activeSubView;
      if (view === activeSubView) return;
      activeSubView = view;
      expandedSessionId = null;
      await renderHistoryContent();
      // Re-render segment buttons to update active state
      const seg = document.querySelector('[data-history-view="workouts"]')?.parentElement;
      if (seg) seg.innerHTML = segBtn('workouts', 'Workouts') + segBtn('weight', 'Weight');
      document.querySelectorAll('[data-history-view]').forEach(b => {
        b.addEventListener('click', async () => {
          const v = (b as HTMLElement).dataset.historyView as typeof activeSubView;
          if (v === activeSubView) return;
          activeSubView = v;
          expandedSessionId = null;
          await renderHistoryScreen();
        });
      });
    });
  });

  await renderHistoryContent();
}

function segBtn(view: string, label: string): string {
  const active = activeSubView === view;
  return `
    <button
      data-history-view="${view}"
      style="
        flex:1;
        padding:0.4rem;
        border:none;
        border-radius:7px;
        font-size:0.9rem;
        font-weight:${active ? '600' : '400'};
        background:${active ? 'var(--bg-secondary)' : 'transparent'};
        color:${active ? 'var(--text-primary)' : 'var(--text-secondary)'};
        cursor:pointer;
        box-shadow:${active ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'};
        transition:all 0.15s;
      "
    >${label}</button>
  `;
}

async function renderHistoryContent() {
  const container = document.getElementById('history-content');
  if (!container) return;
  if (activeSubView === 'workouts') {
    await renderWorkoutsView(container);
  } else {
    await renderWeightView(container);
  }
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

async function renderWorkoutsView(container: HTMLElement) {
  const sessions = await getEndedSessions();
  const sorted = sessions.sort((a, b) => b.endedAt! - a.endedAt!);

  if (sorted.length === 0) {
    container.innerHTML = '<p class="text-muted">No completed workouts yet.</p>';
    return;
  }

  // Resolve template names (cached)
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
    const elapsed = session.endedAt! - session.startedAt;
    const mins = Math.round(elapsed / 60000);
    const dateStr = new Date(session.endedAt!).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
    const isExpanded = expandedSessionId === session.id;

    // Load sets to get exercise list (uses cache)
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
    const exerciseNames = uniqueExerciseIds
      .map(id => exercisesCache.get(id)?.name)
      .filter(Boolean) as string[];

    let expandedHtml = '';
    if (isExpanded) {
      expandedHtml = await buildSessionEditHtml(session);
    }

    const exerciseListHtml = !isExpanded && exerciseNames.length > 0
      ? `<div style="margin-top:0.4rem;">${exerciseNames.map(n => `<div style="font-size:0.8rem;color:var(--text-secondary);">• ${n}</div>`).join('')}</div>`
      : '';

    cards.push(`
      <div class="card mb-2">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;${isExpanded ? 'margin-bottom:0.75rem;' : ''}">
          <div>
            <div style="font-weight:600;">${name}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">${dateStr} · ${mins} min</div>
            ${exerciseListHtml}
          </div>
          <div style="display:flex;gap:0.5rem;flex-shrink:0;margin-left:0.5rem;">
            <button class="btn btn-secondary btn-small"
              data-session-action="${isExpanded ? 'collapse' : 'expand'}"
              data-session-id="${session.id}"
              style="min-height:36px;padding:0.25rem 0.75rem;font-size:0.85rem;"
            >${isExpanded ? 'Done' : 'Edit'}</button>
            <button class="btn btn-danger btn-small"
              data-session-action="delete"
              data-session-id="${session.id}"
              style="min-height:36px;padding:0.25rem 0.75rem;font-size:0.85rem;"
            >Delete</button>
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

  if (expandedSessionId) {
    attachSetEditHandlers(container);
  }
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

  if (groups.size === 0) {
    return '<p class="text-muted" style="font-size:0.875rem;">No sets logged.</p>';
  }

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
            <input type="number" inputmode="numeric"
              value="${set.reps ?? ''}" placeholder="0"
              data-edit-set-id="${set.id}" data-edit-field="reps"
              style="width:55px;padding:0.4rem;text-align:center;min-height:40px;border-radius:8px;" />
          </td>
          <td style="padding:0.25rem;text-align:center;">
            <input type="number" inputmode="decimal"
              value="${weightVal}" placeholder="0"
              step="${displayUnit === 'kg' ? '0.25' : '0.5'}"
              data-edit-set-id="${set.id}" data-edit-field="weight"
              style="width:70px;padding:0.4rem;text-align:center;min-height:40px;border-radius:8px;" />
          </td>
          <td style="padding:0.25rem;text-align:center;">
            <button class="btn btn-danger"
              data-edit-action="delete-set"
              data-edit-set-id="${set.id}"
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
        <button class="btn btn-secondary btn-small"
          data-edit-action="add-set"
          data-edit-exercise-id="${exId}"
          data-edit-session-id="${session.id}"
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

// ─── Weight ────────────────────────────────────────────────────────────────────

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
            <button class="btn btn-secondary btn-small" data-weight-action="edit" data-weight-id="${entry.id}"
              style="padding:0.25rem 0.6rem;min-height:32px;font-size:0.8rem;">Edit</button>
            <button class="btn btn-danger btn-small" data-weight-action="delete" data-weight-id="${entry.id}"
              style="padding:0.25rem 0.6rem;min-height:32px;font-size:0.8rem;">Delete</button>
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
      const id = el.dataset.weightId!;
      const entry = sorted.find(e => e.id === id);
      if (!entry) return;
      if (el.dataset.weightAction === 'edit') handleEditWeight(entry);
      else handleDeleteWeight(entry);
    });
  });
}

function toDateInputValue(ts: number): string {
  const d = new Date(ts);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function fromDateInputValue(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

async function handleAddWeight() {
  const allEntries = await getAllBodyweightEntries();
  const todayStr = toDateInputValue(Date.now());

  const placeholderFor = (dateStr: string): string => {
    const existing = allEntries.find(e => toDateInputValue(e.measuredAt) === dateStr);
    if (!existing) return '0';
    return displayUnit === 'kg'
      ? lbsToKg(existing.weightLbs).toFixed(1)
      : existing.weightLbs.toFixed(1);
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

  // Update placeholder whenever the date changes
  (body.querySelector('#wh-date') as HTMLInputElement).addEventListener('change', (e) => {
    const weightInput = body.querySelector('#wh-weight') as HTMLInputElement;
    weightInput.placeholder = placeholderFor((e.target as HTMLInputElement).value);
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
          // If an entry already exists for this date, update it instead
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
          // Block if the new date already belongs to a different entry
          const conflict = (await getAllBodyweightEntries())
            .find(e => e.id !== entry.id && toDateInputValue(e.measuredAt) === dateVal);
          if (conflict) {
            showToast('There is already an entry for that date', 'error');
            return;
          }
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
