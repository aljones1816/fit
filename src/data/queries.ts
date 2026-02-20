import { getDB, generateId } from './db';
import type {
  Exercise,
  Template,
  Session,
  SetEntry,
  ExerciseLast,
  ExercisePR,
  PRHit,
  BodyweightEntry,
  DisplayUnit,
  ThemeMode,
} from './models';
import { findBestE1RM, findTopSetWeight } from './pr';

// ===== EXERCISES =====

export async function createExercise(name: string): Promise<Exercise> {
  const db = await getDB();
  const exercise: Exercise = {
    id: generateId(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.add('exercises', exercise);
  return exercise;
}

export async function getAllExercises(): Promise<Exercise[]> {
  const db = await getDB();
  return db.getAll('exercises');
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  const db = await getDB();
  return db.get('exercises', id);
}

export async function updateExercise(exercise: Exercise): Promise<void> {
  const db = await getDB();
  exercise.updatedAt = Date.now();
  await db.put('exercises', exercise);
}

export async function deleteExercise(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('exercises', id);
}

// ===== TEMPLATES =====

export async function createTemplate(name: string, exerciseIds: string[]): Promise<Template> {
  const db = await getDB();
  const template: Template = {
    id: generateId(),
    name,
    exerciseIds,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.add('templates', template);
  return template;
}

export async function getAllTemplates(): Promise<Template[]> {
  const db = await getDB();
  return db.getAll('templates');
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  const db = await getDB();
  return db.get('templates', id);
}

export async function updateTemplate(template: Template): Promise<void> {
  const db = await getDB();
  template.updatedAt = Date.now();
  await db.put('templates', template);
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('templates', id);
}

// ===== SESSIONS =====

export async function createSession(templateId?: string, bodyweightLbs?: number): Promise<Session> {
  const db = await getDB();
  const session: Session = {
    id: generateId(),
    templateId,
    startedAt: Date.now(),
    bodyweightLbs,
  };
  await db.add('sessions', session);
  await setSetting('session.activeId', session.id);
  return session;
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDB();
  return db.get('sessions', id);
}

export async function updateSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function endSession(sessionId: string): Promise<void> {
  const db = await getDB();
  const session = await getSession(sessionId);
  if (!session) return;

  session.endedAt = Date.now();
  await db.put('sessions', session);

  // Update exercise_last cache for each exercise in session
  const sets = await getSessionSets(sessionId);
  const exerciseMap = new Map<string, SetEntry[]>();

  sets.forEach(set => {
    if (set.reps !== undefined && set.weightLbs !== undefined) {
      if (!exerciseMap.has(set.exerciseId)) {
        exerciseMap.set(set.exerciseId, []);
      }
      exerciseMap.get(set.exerciseId)!.push(set);
    }
  });

  for (const [exerciseId, exerciseSets] of exerciseMap) {
    const last: ExerciseLast = {
      exerciseId,
      lastEndedAt: session.endedAt!,
      sets: exerciseSets.map(s => ({ reps: s.reps!, weightLbs: s.weightLbs! })),
    };
    await db.put('exercise_last', last);

    // Update PR cache
    await updateExercisePR(exerciseId, exerciseSets);
  }

  // Clear active session
  await deleteSetting('session.activeId');
}

export async function getAllSessions(): Promise<Session[]> {
  const db = await getDB();
  return db.getAll('sessions');
}

export async function getEndedSessions(): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAll('sessions');
  return all.filter(s => s.endedAt !== undefined);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  const sets = await db.getAllFromIndex('sets', 'sessionId', id);
  for (const set of sets) {
    await db.delete('sets', set.id);
  }
  await db.delete('sessions', id);
}

// ===== SETS =====

export async function createSetEntry(
  sessionId: string,
  exerciseId: string,
  setIndex: number,
  reps?: number,
  weightLbs?: number
): Promise<SetEntry> {
  const db = await getDB();
  const set: SetEntry = {
    id: generateId(),
    sessionId,
    exerciseId,
    setIndex,
    reps,
    weightLbs,
  };
  await db.add('sets', set);
  return set;
}

export async function updateSetEntry(set: SetEntry): Promise<void> {
  const db = await getDB();
  await db.put('sets', set);
}

export async function deleteSetEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('sets', id);
}

export async function getSessionSets(sessionId: string): Promise<SetEntry[]> {
  const db = await getDB();
  const index = db.transaction('sets').store.index('sessionId');
  return index.getAll(sessionId);
}

export async function getExerciseSets(exerciseId: string): Promise<SetEntry[]> {
  const db = await getDB();
  const index = db.transaction('sets').store.index('exerciseId');
  return index.getAll(exerciseId);
}

export async function deleteBlankSets(sessionId: string): Promise<void> {
  const db = await getDB();
  const sets = await getSessionSets(sessionId);
  const blankSets = sets.filter(s => s.reps === undefined || s.weightLbs === undefined);

  for (const set of blankSets) {
    await db.delete('sets', set.id);
  }
}

// ===== EXERCISE LAST =====

export async function getExerciseLast(exerciseId: string): Promise<ExerciseLast | undefined> {
  const db = await getDB();
  return db.get('exercise_last', exerciseId);
}

// ===== EXERCISE PR =====

async function updateExercisePR(exerciseId: string, sets: SetEntry[]): Promise<void> {
  const db = await getDB();
  const filledSets = sets
    .filter(s => s.reps !== undefined && s.weightLbs !== undefined)
    .map(s => ({ reps: s.reps!, weightLbs: s.weightLbs! }));

  if (filledSets.length === 0) return;

  const existing = await db.get('exercise_pr', exerciseId);
  const bestE1rm = findBestE1RM(filledSets);
  const topWeight = findTopSetWeight(filledSets);

  if (!bestE1rm) return;

  const shouldUpdate =
    !existing ||
    bestE1rm.e1rm > existing.bestE1rm ||
    topWeight > existing.bestTopSetWeight;

  if (shouldUpdate) {
    const pr: ExercisePR = {
      exerciseId,
      bestE1rm: existing ? Math.max(bestE1rm.e1rm, existing.bestE1rm) : bestE1rm.e1rm,
      bestE1rmSet: existing && existing.bestE1rm > bestE1rm.e1rm ? existing.bestE1rmSet : bestE1rm.set,
      bestTopSetWeight: existing ? Math.max(topWeight, existing.bestTopSetWeight) : topWeight,
      updatedAt: Date.now(),
    };
    await db.put('exercise_pr', pr);
  }
}

export async function getExercisePR(exerciseId: string): Promise<ExercisePR | undefined> {
  const db = await getDB();
  return db.get('exercise_pr', exerciseId);
}

export async function getAllExercisePRs(): Promise<Map<string, ExercisePR>> {
  const db = await getDB();
  const all = await db.getAll('exercise_pr');
  return new Map(all.map(pr => [pr.exerciseId, pr]));
}

// Call BEFORE endSession so we compare against the records that existed prior to this workout.
export async function detectSessionPRs(sets: SetEntry[]): Promise<Map<string, PRHit>> {
  const result = new Map<string, PRHit>();

  // Group filled sets by exercise
  const byExercise = new Map<string, Array<{ reps: number; weightLbs: number }>>();
  for (const set of sets) {
    if (set.reps === undefined || set.weightLbs === undefined) continue;
    if (!byExercise.has(set.exerciseId)) byExercise.set(set.exerciseId, []);
    byExercise.get(set.exerciseId)!.push({ reps: set.reps, weightLbs: set.weightLbs });
  }

  for (const [exerciseId, filledSets] of byExercise) {
    const best = findBestE1RM(filledSets);
    const topWeight = findTopSetWeight(filledSets);
    if (!best) continue;

    const existing = await getExercisePR(exerciseId);
    const e1rmPR = !existing || best.e1rm > existing.bestE1rm;
    const weightPR = !existing || topWeight > existing.bestTopSetWeight;

    if (e1rmPR || weightPR) {
      result.set(exerciseId, { exerciseId, e1rmPR, weightPR, topSet: best.set });
    }
  }

  return result;
}

// ===== BODYWEIGHT =====

export async function addBodyweightEntry(weightLbs: number, measuredAt: number = Date.now()): Promise<BodyweightEntry> {
  const db = await getDB();
  const entry: BodyweightEntry = {
    id: generateId(),
    measuredAt,
    weightLbs,
  };
  await db.add('bodyweight_entries', entry);
  return entry;
}

export async function getAllBodyweightEntries(): Promise<BodyweightEntry[]> {
  const db = await getDB();
  return db.getAll('bodyweight_entries');
}

export async function updateBodyweightEntry(entry: BodyweightEntry): Promise<void> {
  const db = await getDB();
  await db.put('bodyweight_entries', entry);
}

export async function deleteBodyweightEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('bodyweight_entries', id);
}

// ===== SETTINGS =====

export async function getSetting<T = any>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const setting = await db.get('settings', key);
  return setting?.value;
}

export async function setSetting(key: string, value: any): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key, value });
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDB();
  await db.delete('settings', key);
}

export async function getDisplayUnit(): Promise<DisplayUnit> {
  return (await getSetting<DisplayUnit>('units.display')) || 'lbs';
}

export async function setDisplayUnit(unit: DisplayUnit): Promise<void> {
  await setSetting('units.display', unit);
}

export async function getThemeMode(): Promise<ThemeMode> {
  return (await getSetting<ThemeMode>('theme.mode')) || 'dark';
}

export async function setThemeMode(mode: ThemeMode): Promise<void> {
  await setSetting('theme.mode', mode);
  applyTheme(mode);
}

export function applyTheme(mode: ThemeMode): void {
  const html = document.documentElement;
  html.setAttribute('data-theme', mode);

  if (mode === 'system') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      // System theme changes are handled by CSS
    };
    mediaQuery.addEventListener('change', handleChange);
  }
}

export async function getTimerDefault(): Promise<number> {
  return (await getSetting<number>('timer.defaultSeconds')) || 90;
}

export async function setTimerDefault(seconds: number): Promise<void> {
  await setSetting('timer.defaultSeconds', seconds);
}
