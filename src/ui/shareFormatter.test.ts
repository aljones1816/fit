import { describe, it, expect } from 'vitest';
import {
  compactName,
  buildShareText,
  MAX_NAME_CHARS,
  PAD_WIDTH,
  type ShareWorkoutData,
} from './shareFormatter';

// ─── compactName ─────────────────────────────────────────────────────────────

describe('compactName', () => {
  it('returns short names unchanged', () => {
    expect(compactName('OHP')).toBe('OHP');
    expect(compactName('Barbell Bench Press')).toBe('Barbell Bench Press'); // 19 chars
  });

  it('returns name unchanged when exactly MAX_NAME_CHARS', () => {
    const name = 'A'.repeat(MAX_NAME_CHARS);
    expect(compactName(name)).toBe(name);
  });

  it('drops parenthetical qualifier when name has parentheses', () => {
    // "Overhead Press (Smith Machine)" = 30 chars > 26; before "(" = "Overhead Press" (14) ✓
    expect(compactName('Overhead Press (Smith Machine)')).toBe('Overhead Press');
    // "Bulgarian Split Squat (Front Rack)" = 34 chars > 26; before "(" = "Bulgarian Split Squat" (21) ✓
    expect(compactName('Bulgarian Split Squat (Front Rack)')).toBe('Bulgarian Split Squat');
  });

  it('truncates with ellipsis if pre-paren part is still too long', () => {
    const longBase = 'A'.repeat(MAX_NAME_CHARS + 5);
    const result = compactName(`${longBase} (variant)`);
    expect(result.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
    expect(result.endsWith('…')).toBe(true);
  });

  it('truncates with ellipsis for long names without parentheses', () => {
    const name = 'SuperLongExerciseNameWithNoParens'; // > 26 chars
    const result = compactName(name);
    expect(result.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
    expect(result.endsWith('…')).toBe(true);
  });
});

// ─── buildShareText helpers ──────────────────────────────────────────────────

const BASE: ShareWorkoutData = {
  title: 'Chest',
  durationMs: 42 * 60 * 1000,
  endedAt: new Date('2025-01-22T10:00:00Z').getTime(),
  exercises: [],
  totalPRs: 0,
  displayUnit: 'lbs',
  totalVolumeLbs: 0,
};

// ─── Header ──────────────────────────────────────────────────────────────────

describe('buildShareText — header', () => {
  it('uppercases the workout title', () => {
    const text = buildShareText({ ...BASE, exercises: [] });
    expect(text).toContain('💪 CHEST');
  });

  it('includes the date', () => {
    const text = buildShareText({ ...BASE });
    expect(text).toContain('Jan 22');
  });

  it('formats duration under 60m as minutes', () => {
    const text = buildShareText({ ...BASE, durationMs: 42 * 60 * 1000 });
    expect(text).toContain('42m');
  });

  it('formats duration of 60m+ as hours and minutes', () => {
    const text = buildShareText({ ...BASE, durationMs: 72 * 60 * 1000 });
    expect(text).toContain('1h 12m');
  });

  it('shows PR count and volume on line 3 when PRs > 0', () => {
    const text = buildShareText({ ...BASE, totalPRs: 3 });
    expect(text).toContain('🏆 3 PRs');
  });

  it('shows singular PR when count is 1', () => {
    const text = buildShareText({ ...BASE, totalPRs: 1 });
    expect(text).toContain('🏆 1 PR  •');
    expect(text).not.toContain('PRs');
  });

  it('omits trophy emoji on line 3 when no PRs', () => {
    const text = buildShareText({ ...BASE, totalPRs: 0 });
    const lines = text.split('\n');
    expect(lines[2]).not.toContain('🏆');
    expect(lines[2]).toContain('total');
  });
});

// ─── Exercise rows — one-line mode ───────────────────────────────────────────

describe('buildShareText — one-line mode (short names)', () => {
  const exercises = [
    { name: 'Bench Press', reps: 8, weightLbs: 155, isPR: true },
    { name: 'OHP', reps: 8, weightLbs: 95, isPR: false },
  ];

  it('pads name to PAD_WIDTH and appends set string', () => {
    const text = buildShareText({ ...BASE, exercises, totalPRs: 1, displayUnit: 'lbs' });
    const lines = text.split('\n');
    const benchLine = lines.find(l => l.startsWith('Bench Press'));
    expect(benchLine).toBeDefined();
    // Name column must be PAD_WIDTH wide
    expect(benchLine!.slice(0, PAD_WIDTH)).toBe('Bench Press'.padEnd(PAD_WIDTH));
  });

  it('appends 🏆 badge for PR exercises', () => {
    const text = buildShareText({ ...BASE, exercises, totalPRs: 1, displayUnit: 'lbs' });
    expect(text).toContain('8×155 lb 🏆');
  });

  it('no badge for non-PR exercises', () => {
    const text = buildShareText({ ...BASE, exercises, displayUnit: 'lbs' });
    const lines = text.split('\n');
    const ohpLine = lines.find(l => l.startsWith('OHP'));
    expect(ohpLine).toBeDefined();
    expect(ohpLine).not.toContain('🏆');
  });

  it('uses × (not x) for reps/weight separator', () => {
    const text = buildShareText({ ...BASE, exercises, displayUnit: 'lbs' });
    expect(text).toContain('×');
    expect(text).not.toMatch(/\d x \d/);
  });
});

// ─── Exercise rows — long name with parentheses ───────────────────────────────

describe('buildShareText — long name with parentheses', () => {
  it('drops the parenthetical qualifier in one-line mode', () => {
    // 30 chars > MAX_NAME_CHARS(26), qualifier stripped
    const exercises = [
      { name: 'Overhead Press (Smith Machine)', reps: 8, weightLbs: 115, isPR: false },
    ];
    const text = buildShareText({ ...BASE, exercises });
    expect(text).toContain('Overhead Press');
    const setLine = text.split('\n').find(l => l.includes('8×115'));
    expect(setLine).not.toContain('(Smith Machine)');
  });
});

// ─── Two-line mode (3+ long names) ───────────────────────────────────────────

describe('buildShareText — two-line mode', () => {
  const longExercises = [
    { name: 'Bulgarian Split Squat (Front Rack)', reps: 10, weightLbs: 55, isPR: true },
    { name: 'Romanian Deadlift (Dumbbell)', reps: 12, weightLbs: 70, isPR: false },
    { name: 'Seated Cable Row (Wide Grip)', reps: 10, weightLbs: 120, isPR: false },
  ];

  it('switches to two-line mode when 3+ names are long', () => {
    const text = buildShareText({ ...BASE, exercises: longExercises, totalPRs: 1 });
    const lines = text.split('\n');
    // In two-line mode, full name appears on its own line
    expect(lines.some(l => l === 'Bulgarian Split Squat (Front Rack)')).toBe(true);
  });

  it('indents set string with two spaces in two-line mode', () => {
    const text = buildShareText({ ...BASE, exercises: longExercises, totalPRs: 1 });
    const lines = text.split('\n');
    const setLine = lines.find(l => l.startsWith('  10×55'));
    expect(setLine).toBeDefined();
  });

  it('appends 🏆 badge in two-line mode', () => {
    const text = buildShareText({ ...BASE, exercises: longExercises, totalPRs: 1 });
    expect(text).toContain('10×55 lb 🏆');
  });
});

// ─── Volume formatting ────────────────────────────────────────────────────────

describe('buildShareText — volume', () => {
  it('formats volume with comma separator', () => {
    const exercises = [
      { name: 'Squat', reps: 5, weightLbs: 315, isPR: false },
      { name: 'Deadlift', reps: 5, weightLbs: 405, isPR: false },
    ]; // total = 5*315 + 5*405 = 1575 + 2025 = 3600
    const text = buildShareText({ ...BASE, exercises, displayUnit: 'lbs' });
    expect(text).toContain('3,600 lbs');
  });

  it('converts volume to kg when display unit is kg', () => {
    const exercises = [{ name: 'Squat', reps: 10, weightLbs: 100, isPR: false }];
    // 1000 lb total → ~454 kg
    const text = buildShareText({ ...BASE, exercises, displayUnit: 'kg' });
    expect(text).toContain('kg total');
  });
});

// ─── Footer ──────────────────────────────────────────────────────────────────

describe('buildShareText — footer', () => {
  it('ends with "Logged with SetLift 🔥"', () => {
    const text = buildShareText({ ...BASE });
    expect(text.trimEnd().endsWith('Logged with SetLift 🔥')).toBe(true);
  });
});

// ─── SMS-safety ───────────────────────────────────────────────────────────────

describe('buildShareText — SMS safety', () => {
  it('contains no control characters', () => {
    const exercises = [
      { name: 'Bench Press', reps: 8, weightLbs: 155, isPR: true },
    ];
    const text = buildShareText({ ...BASE, exercises, totalPRs: 1, displayUnit: 'lbs' });
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/);
  });
});
