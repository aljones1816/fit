// Epley formula for estimated 1RM
export function calculateE1RM(weightLbs: number, reps: number): number {
  if (reps === 1) return weightLbs;
  return weightLbs * (1 + reps / 30);
}

export function findBestE1RM(sets: Array<{ reps: number; weightLbs: number }>): {
  e1rm: number;
  set: { reps: number; weightLbs: number };
} | null {
  if (sets.length === 0) return null;

  let best = sets[0];
  let bestE1RM = calculateE1RM(best.weightLbs, best.reps);

  for (let i = 1; i < sets.length; i++) {
    const set = sets[i];
    const e1rm = calculateE1RM(set.weightLbs, set.reps);
    if (e1rm > bestE1RM) {
      bestE1RM = e1rm;
      best = set;
    }
  }

  return { e1rm: bestE1RM, set: best };
}

export function findTopSetWeight(sets: Array<{ reps: number; weightLbs: number }>): number {
  if (sets.length === 0) return 0;
  return Math.max(...sets.map(s => s.weightLbs));
}

export function calculateVolume(sets: Array<{ reps: number; weightLbs: number }>): number {
  return sets.reduce((sum, set) => sum + (set.reps * set.weightLbs), 0);
}
