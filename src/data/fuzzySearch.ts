/** Levenshtein edit distance between two pre-lowercased strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  // Single-row optimised implementation — O(n) space
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

export interface FuzzyResult<T> {
  ex: T;
  /** true = matched by Levenshtein, false = matched by substring */
  fuzzy: boolean;
}

/**
 * Filter and rank a list by query using substring match with a Levenshtein
 * fallback for queries ≥ 3 chars.
 *
 * Threshold: 1 edit for 3–7 char queries, 2 for 8–11, 3 for 12+.
 * Both the full name and each individual word are checked so that a short
 * typo like "bech" still surfaces "Bench Press".
 *
 * Returns substring matches first (alphabetical), then fuzzy matches
 * (by ascending distance, then alphabetical).
 */
export function fuzzyFilterExercises<T extends { name: string }>(
  exercises: T[],
  query: string,
): FuzzyResult<T>[] {
  const q = query.toLowerCase().trim();
  if (!q) return exercises.map(ex => ({ ex, fuzzy: false }));

  const substringHits: T[] = [];
  const fuzzyHits: Array<{ ex: T; dist: number }> = [];

  const doFuzzy = q.length >= 3;
  const threshold = Math.min(Math.floor(q.length / 4) + 1, 3);

  for (const ex of exercises) {
    const name = ex.name.toLowerCase();
    if (name.includes(q)) {
      substringHits.push(ex);
      continue;
    }
    if (doFuzzy) {
      const words = name.split(/\s+/);
      const dist = Math.min(
        levenshtein(q, name),
        ...words.map(w => levenshtein(q, w)),
      );
      if (dist <= threshold) {
        fuzzyHits.push({ ex, dist });
      }
    }
  }

  substringHits.sort((a, b) => a.name.localeCompare(b.name));
  fuzzyHits.sort((a, b) => a.dist - b.dist || a.ex.name.localeCompare(b.ex.name));

  return [
    ...substringHits.map(ex => ({ ex, fuzzy: false })),
    ...fuzzyHits.map(({ ex }) => ({ ex, fuzzy: true })),
  ];
}
