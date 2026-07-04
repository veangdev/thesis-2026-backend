/**
 * Pure analytics helpers — no Nest/Prisma — so the scoring math is unit-tested
 * in isolation (§5.4 growth analysis, dimension zones, at-risk detection).
 */

export type Zone = 'needs_support' | 'developing' | 'strong';

/** Below 40% of scale needs support; up to 70% developing; above is strong. */
export const ZONE_LOW = 0.4;
export const ZONE_MID = 0.7;

export function classifyZone(score: number, scaleMax: number): Zone {
  const pct = scaleMax > 0 ? score / scaleMax : 0;
  if (pct <= ZONE_LOW) return 'needs_support';
  if (pct <= ZONE_MID) return 'developing';
  return 'strong';
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return round2(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** Growth versus the previous point; `null` when there is no prior value. */
export function delta(current: number, previous?: number): number | null {
  if (previous === undefined) return null;
  return round2(current - previous);
}

/**
 * A student is at risk when their latest average sits in the needs-support zone
 * or two or more dimensions are flagged for coaching.
 */
export function isAtRisk(
  latestAverage: number,
  scaleMax: number,
  coachingFlagCount: number,
): boolean {
  const lowAverage = scaleMax > 0 && latestAverage <= ZONE_LOW * scaleMax;
  return lowAverage || coachingFlagCount >= 2;
}
