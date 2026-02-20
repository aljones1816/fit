import type { DisplayUnit } from './models';

const LBS_TO_KG = 0.45359237;

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function lbsToKg(lbs: number): number {
  return lbs * LBS_TO_KG;
}

export function kgToLbs(kg: number): number {
  return kg / LBS_TO_KG;
}

export function formatWeight(weightLbs: number, displayUnit: DisplayUnit): string {
  if (displayUnit === 'kg') {
    const kg = lbsToKg(weightLbs);
    const rounded = roundTo(kg, 0.25);
    return `${rounded.toFixed(2)} kg`;
  }
  return `${weightLbs.toFixed(1)} lb`;
}

export function formatVolume(
  sets: Array<{ reps: number; weightLbs: number }>,
  displayUnit: DisplayUnit,
): string {
  const totalLbs = sets.reduce((sum, s) => sum + s.reps * s.weightLbs, 0);
  const value = displayUnit === 'kg' ? Math.round(totalLbs * LBS_TO_KG) : Math.round(totalLbs);
  return `${value.toLocaleString()} ${displayUnit}`;
}

export function parseEnteredWeight(value: string, displayUnit: DisplayUnit): number {
  const num = parseFloat(value);
  if (isNaN(num)) return 0;

  if (displayUnit === 'kg') {
    // Convert kg to lbs and round to 0.5 lb
    const lbs = kgToLbs(num);
    return roundTo(lbs, 0.5);
  }

  // Round lbs input to 0.5 lb
  return roundTo(num, 0.5);
}
