import {
  getAllExercises,
  createExercise,
  deleteExercise,
  getAllTemplates,
  createTemplate,
  deleteTemplate,
  getTemplate,
  updateTemplate,
  createSession,
  getExerciseLast,
  createSetEntry,
  getExercise,
  setSetting,
  getSetting,
} from '../../data/queries';
import type { Exercise, Template } from '../../data/models';
import { showToast } from '../components/Toast';
import { showModal } from '../components/Modal';
import { navigate } from '../../router';
import { DEFAULT_EXERCISES } from '../../data/seedData';

let exercises: Exercise[] = [];
let templates: Template[] = [];
let searchQuery = '';
let hasActiveWorkout = false;

export async function renderTemplatesScreen() {
  const screen = document.getElementById('screen');
  if (!screen) return;

  // Load data
  exercises = await getAllExercises();
  templates = await getAllTemplates();
  const activeId = await getSetting<string>('session.activeId');
  hasActiveWorkout = !!activeId;

  screen.innerHTML = `
    <div>
      <h1 class="mb-2">Templates</h1>

      <div class="mb-3">
        <details class="card" style="cursor: pointer;">
          <summary style="font-size: 1.125rem; font-weight: 600; padding: 0.5rem; list-style: none;">
            <span>📋 Exercises (${exercises.length})</span>
          </summary>
          <div style="padding: 1rem; padding-top: 0.5rem;">
            <div class="flex gap-1 mb-2">
              <button class="btn btn-primary btn-small" id="add-exercise-btn">
                + Add Exercise
              </button>
              <button class="btn btn-secondary btn-small" id="load-defaults-btn">
                Load Defaults
              </button>
            </div>
            <input
              type="text"
              id="exercise-search"
              placeholder="Search exercises..."
              style="width: 100%; margin-bottom: 1rem; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary); color: var(--text-primary);"
            />
            <div id="exercises-list" style="max-height: 400px; overflow-y: auto;"></div>
          </div>
        </details>
      </div>

      <div class="mb-3">
        <h2 class="mb-1" style="font-size: 1.25rem;">Workout Templates</h2>
        <button class="btn btn-primary btn-small mb-2" id="add-template-btn">
          + New Template
        </button>
        <div id="templates-list"></div>
      </div>
    </div>
  `;

  renderExercisesList();
  renderTemplatesList();

  document.getElementById('add-exercise-btn')?.addEventListener('click', handleAddExercise);
  document.getElementById('add-template-btn')?.addEventListener('click', handleAddTemplate);
  document.getElementById('load-defaults-btn')?.addEventListener('click', handleLoadDefaults);
  document.getElementById('exercise-search')?.addEventListener('input', handleExerciseSearch);
}

function handleExerciseSearch(e: Event) {
  const input = e.target as HTMLInputElement;
  searchQuery = input.value.toLowerCase();
  renderExercisesList();
}

function renderExercisesList() {
  const container = document.getElementById('exercises-list');
  if (!container) return;

  if (exercises.length === 0) {
    container.innerHTML = '<p class="text-muted">No exercises yet. Load defaults or add your own.</p>';
    return;
  }

  // Filter exercises by search query
  const filteredExercises = exercises
    .filter(ex => ex.name.toLowerCase().includes(searchQuery))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (filteredExercises.length === 0) {
    container.innerHTML = '<p class="text-muted">No exercises match your search.</p>';
    return;
  }

  container.innerHTML = filteredExercises
    .map(
      ex => `
    <div style="padding: 0.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 0.9rem;">${ex.name}</span>
      <button class="btn btn-danger" data-exercise-id="${ex.id}" style="padding: 0.3rem 0.6rem; min-height: 32px; font-size: 0.875rem;">
        Delete
      </button>
    </div>
  `
    )
    .join('');

  // Attach delete handlers
  container.querySelectorAll('[data-exercise-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.exerciseId!;
      const exercise = exercises.find(ex => ex.id === id);
      if (!exercise) return;

      showModal({
        title: 'Delete Exercise',
        body: `Delete "${exercise.name}"? Historical data will remain.`,
        buttons: [
          { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
          {
            text: 'Delete',
            className: 'btn btn-danger',
            onClick: async () => {
              await deleteExercise(id);
              showToast(`Deleted "${exercise.name}"`, 'success');
              renderTemplatesScreen();
            },
          },
        ],
      });
    });
  });
}

function renderTemplatesList() {
  const container = document.getElementById('templates-list');
  if (!container) return;

  if (templates.length === 0) {
    container.innerHTML = '<p class="text-muted">No templates yet. Create one to start working out.</p>';
    return;
  }

  container.innerHTML = templates
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(
      tmpl => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${tmpl.name}</div>
          <div class="text-muted" style="font-size: 0.875rem;">
            ${tmpl.exerciseIds.length} exercise${tmpl.exerciseIds.length !== 1 ? 's' : ''}
          </div>
        </div>
        ${hasActiveWorkout ? `
          <div class="text-muted" style="font-size: 0.875rem;">Workout in progress</div>
        ` : `
          <button class="btn btn-primary" data-template-id="${tmpl.id}" data-action="start">
            Start
          </button>
        `}
      </div>
      <div class="mb-2">
        ${tmpl.exerciseIds
          .map(exId => {
            const ex = exercises.find(e => e.id === exId);
            return ex ? `<div class="text-muted" style="font-size: 0.875rem; margin-left: 0.5rem;">• ${ex.name}</div>` : '';
          })
          .join('')}
      </div>
      <div class="flex gap-1">
        <button class="btn btn-secondary btn-small" data-template-id="${tmpl.id}" data-action="edit">
          Edit
        </button>
        <button class="btn btn-danger btn-small" data-template-id="${tmpl.id}" data-action="delete">
          Delete
        </button>
      </div>
    </div>
  `
    )
    .join('');

  // Attach handlers
  container.querySelectorAll('[data-template-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const el = e.currentTarget as HTMLElement;
      const id = el.dataset.templateId!;
      const action = el.dataset.action!;

      if (action === 'start') {
        await handleStartWorkout(id);
      } else if (action === 'edit') {
        await handleEditTemplate(id);
      } else if (action === 'delete') {
        await handleDeleteTemplate(id);
      }
    });
  });
}

function handleAddExercise() {
  const body = document.createElement('div');
  body.innerHTML = `
    <input
      type="text"
      id="exercise-name-input"
      placeholder="Exercise name"
      style="width: 100%;"
    />
  `;

  showModal({
    title: 'Add Exercise',
    body,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Add',
        className: 'btn btn-primary',
        onClick: async () => {
          const input = document.getElementById('exercise-name-input') as HTMLInputElement;
          const name = input?.value.trim();
          if (!name) {
            showToast('Please enter a name', 'error');
            return;
          }

          await createExercise(name);
          showToast(`Added "${name}"`, 'success');
          renderTemplatesScreen();
        },
      },
    ],
  });

  setTimeout(() => {
    document.getElementById('exercise-name-input')?.focus();
  }, 100);
}

function handleAddTemplate() {
  showTemplateEditorModal();
}

async function handleEditTemplate(id: string) {
  const template = await getTemplate(id);
  if (!template) return;
  showTemplateEditorModal(template);
}

async function handleDeleteTemplate(id: string) {
  const template = templates.find(t => t.id === id);
  if (!template) return;

  showModal({
    title: 'Delete Template',
    body: `Delete "${template.name}"?`,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Delete',
        className: 'btn btn-danger',
        onClick: async () => {
          await deleteTemplate(id);
          showToast(`Deleted "${template.name}"`, 'success');
          renderTemplatesScreen();
        },
      },
    ],
  });
}

function showTemplateEditorModal(template?: Template) {
  const selectedExerciseIds = new Set(template?.exerciseIds || []);

  const body = document.createElement('div');
  body.innerHTML = `
    <input
      type="text"
      id="template-name-input"
      placeholder="Template name (e.g., Upper A)"
      value="${template?.name || ''}"
      style="width: 100%; margin-bottom: 1rem;"
    />
    <div style="margin-bottom: 0.5rem; font-weight: 600;">Exercises:</div>
    <div id="exercise-selector" style="max-height: 300px; overflow-y: auto;">
      ${exercises
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          ex => `
        <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; cursor: pointer;">
          <input
            type="checkbox"
            value="${ex.id}"
            ${selectedExerciseIds.has(ex.id) ? 'checked' : ''}
            style="width: 20px; height: 20px;"
          />
          <span>${ex.name}</span>
        </label>
      `
        )
        .join('')}
    </div>
  `;

  showModal({
    title: template ? 'Edit Template' : 'New Template',
    body,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Save',
        className: 'btn btn-primary',
        onClick: async () => {
          const nameInput = document.getElementById('template-name-input') as HTMLInputElement;
          const name = nameInput?.value.trim();

          if (!name) {
            showToast('Please enter a template name', 'error');
            return;
          }

          const checkboxes = body.querySelectorAll<HTMLInputElement>('#exercise-selector input[type="checkbox"]:checked');
          const exerciseIds = Array.from(checkboxes).map(cb => cb.value);

          if (exerciseIds.length === 0) {
            showToast('Please select at least one exercise', 'error');
            return;
          }

          if (template) {
            template.name = name;
            template.exerciseIds = exerciseIds;
            await updateTemplate(template);
            showToast(`Updated "${name}"`, 'success');
          } else {
            await createTemplate(name, exerciseIds);
            showToast(`Created "${name}"`, 'success');
          }

          renderTemplatesScreen();
        },
      },
    ],
  });
}

async function handleLoadDefaults() {
  const existingCount = exercises.length;

  showModal({
    title: 'Load Default Exercises',
    body: `This will add ${DEFAULT_EXERCISES.length} common exercises to your list. ${existingCount > 0 ? 'Your existing exercises will be kept.' : ''} Continue?`,
    buttons: [
      { text: 'Cancel', className: 'btn btn-secondary', onClick: () => {} },
      {
        text: 'Load Exercises',
        className: 'btn btn-primary',
        onClick: async () => {
          let added = 0;
          const existingNames = new Set(exercises.map(ex => ex.name));

          for (const exerciseName of DEFAULT_EXERCISES) {
            // Skip if already exists
            if (!existingNames.has(exerciseName)) {
              await createExercise(exerciseName);
              added++;
            }
          }

          await setSetting('app.exercisesSeeded', true);
          showToast(`Added ${added} exercises`, 'success');
          renderTemplatesScreen();
        },
      },
    ],
  });
}

async function handleStartWorkout(templateId: string) {
  const template = await getTemplate(templateId);
  if (!template) return;

  // Create session
  const session = await createSession(templateId);

  // Create initial set entries for each exercise
  for (const exerciseId of template.exerciseIds) {
    const exercise = await getExercise(exerciseId);
    if (!exercise) continue;

    const last = await getExerciseLast(exerciseId);
    const setCount = last ? Math.max(last.sets.length, 1) : 3; // Default 3 sets if no history

    for (let i = 0; i < setCount; i++) {
      await createSetEntry(session.id, exerciseId, i);
    }
  }

  showToast(`Started "${template.name}"`, 'success');
  navigate('workout');
}
