import { getAllExercises, createExercise, getSetting, setSetting } from './queries';
import { DEFAULT_EXERCISES } from './seedData';

export async function initializeDefaultExercises(): Promise<void> {
  // Check if we've already seeded
  const hasSeeded = await getSetting<boolean>('app.exercisesSeeded');
  if (hasSeeded) {
    return;
  }

  // Check if user has any exercises already
  const existingExercises = await getAllExercises();
  if (existingExercises.length > 0) {
    // User already has exercises, don't seed
    await setSetting('app.exercisesSeeded', true);
    return;
  }

  // Create default exercises
  console.log('Seeding default exercises...');
  for (const exerciseName of DEFAULT_EXERCISES) {
    await createExercise(exerciseName);
  }

  // Mark as seeded
  await setSetting('app.exercisesSeeded', true);
  console.log(`Seeded ${DEFAULT_EXERCISES.length} default exercises`);
}
