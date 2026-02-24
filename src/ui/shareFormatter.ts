import type { DisplayUnit } from '../data/models';

// ─── Tuneable constants ───────────────────────────────────────────────────────

export const MAX_NAME_CHARS = 26;
export const PAD_WIDTH = 28; // name column width (provides ≥2 space gap at max name length)
export const TWO_LINE_THRESHOLD = 3; // switch all rows to two-line if ≥ this many long names

// ─── Input types ─────────────────────────────────────────────────────────────

export interface ShareExercise {
  name: string;
  reps: number;
  weightLbs: number; // 0 = bodyweight-only
  isPR: boolean;
}

export interface ShareWorkoutData {
  title: string;
  durationMs: number;
  endedAt: number;
  exercises: ShareExercise[];
  totalPRs: number;
  displayUnit: DisplayUnit;
  totalVolumeLbs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatShareDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatShareWeight(weightLbs: number, displayUnit: DisplayUnit): string {
  if (weightLbs === 0) return 'BW';
  if (displayUnit === 'kg') {
    const kg = weightLbs * 0.45359237;
    return `${kg.toFixed(1)} kg`;
  }
  // Show as integer if whole number, one decimal if fractional (e.g. 155.5)
  return Number.isInteger(weightLbs)
    ? `${weightLbs} lb`
    : `${weightLbs.toFixed(1)} lb`;
}

function formatVolume(totalLbs: number, displayUnit: DisplayUnit): string {
  const value = displayUnit === 'kg'
    ? Math.round(totalLbs * 0.45359237)
    : Math.round(totalLbs);
  return `${value.toLocaleString()} ${displayUnit}`;
}

/**
 * Compact an exercise name to fit within MAX_NAME_CHARS.
 * Rule: drop parenthetical qualifier first; truncate with ellipsis as fallback.
 */
export function compactName(name: string): string {
  if (name.length <= MAX_NAME_CHARS) return name;
  const parenIdx = name.indexOf('(');
  if (parenIdx !== -1) {
    const before = name.slice(0, parenIdx).trimEnd();
    if (before.length <= MAX_NAME_CHARS) return before;
    return before.slice(0, MAX_NAME_CHARS - 1) + '…';
  }
  return name.slice(0, MAX_NAME_CHARS - 1) + '…';
}

// ─── Main formatter ───────────────────────────────────────────────────────────

export function buildShareText(data: ShareWorkoutData): string {
  const { title, durationMs, endedAt, exercises, totalPRs, displayUnit } = data;

  // ── Header ──────────────────────────────────────────────────────────────────
  const totalMins = Math.round(durationMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const durationStr = h > 0 ? `${h}h ${m}m` : `${totalMins}m`;

  const dateStr = formatShareDate(endedAt);
  const count = exercises.length;
  const volumeStr = formatVolume(data.totalVolumeLbs, displayUnit);

  const lines: string[] = [
    `💪 ${title.toUpperCase()}  •  ${dateStr}`,
    `⏱️ ${durationStr}  •  ${count} exercise${count !== 1 ? 's' : ''}`,
    totalPRs > 0
      ? `🏆 ${totalPRs} PR${totalPRs !== 1 ? 's' : ''}  •  ${volumeStr} total`
      : `${volumeStr} total`,
    '',
  ];

  // ── Exercise rows ────────────────────────────────────────────────────────────
  const longCount = exercises.filter(e => e.name.length > MAX_NAME_CHARS).length;
  const twoLine = longCount >= TWO_LINE_THRESHOLD;

  for (const e of exercises) {
    const badge = e.isPR ? ' 🏆' : '';
    const weightStr = formatShareWeight(e.weightLbs, displayUnit);
    const setStr = `${e.reps}×${weightStr}${badge}`;

    if (twoLine) {
      lines.push(e.name);
      lines.push(`  ${setStr}`);
    } else {
      const compact = compactName(e.name);
      lines.push(`${compact.padEnd(PAD_WIDTH)}${setStr}`);
    }
  }

  lines.push('');
  lines.push('Logged with SetLift 🔥');

  return lines.join('\n');
}
