import {
  getAllExercises,
  createExercise,
  deleteExercise,
  getExerciseSets,
  updateSetEntry,
  getAllTemplates,
  updateTemplate,
  getSetting,
  setSetting,
} from './queries';
import { DEFAULT_EXERCISES } from './seedData';

// Seed the default exercise list if the user has none.
// Checks by name so it is safe to call multiple times.
export async function initializeDefaultExercises(): Promise<void> {
  const existing = await getAllExercises();
  if (existing.length > 0) return;

  for (const name of DEFAULT_EXERCISES) {
    await createExercise(name);
  }
}

// One-time pass to collapse duplicate exercises (same name, different IDs).
// Reassigns sets + templates to the oldest copy, then deletes the rest.
// Gated by a persisted flag so it only runs once per device.
export async function deduplicateExercises(): Promise<void> {
  const done = await getSetting<boolean>('app.deduplicatedExercises');
  if (done) return;

  const all = await getAllExercises();

  // Group by lower-cased name
  const byName = new Map<string, typeof all>();
  for (const ex of all) {
    const key = ex.name.toLowerCase().trim();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(ex);
  }

  let removed = 0;

  for (const group of byName.values()) {
    if (group.length <= 1) continue;

    // Keep the oldest entry; delete the rest
    group.sort((a, b) => a.createdAt - b.createdAt);
    const [keep, ...dupes] = group;

    for (const dupe of dupes) {
      // Re-point sets to the kept exercise
      const sets = await getExerciseSets(dupe.id);
      for (const set of sets) {
        await updateSetEntry({ ...set, exerciseId: keep.id });
      }

      // Re-point templates
      const templates = await getAllTemplates();
      for (const tmpl of templates) {
        if (tmpl.exerciseIds.includes(dupe.id)) {
          tmpl.exerciseIds = tmpl.exerciseIds.map(id => (id === dupe.id ? keep.id : id));
          // Deduplicate in case both IDs were in the same template
          tmpl.exerciseIds = [...new Set(tmpl.exerciseIds)];
          await updateTemplate(tmpl);
        }
      }

      await deleteExercise(dupe.id);
      removed++;
    }
  }

  await setSetting('app.deduplicatedExercises', true);
  if (removed > 0) console.log(`[dedup] Removed ${removed} duplicate exercises`);
}
