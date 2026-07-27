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

/**
 * Like `average`, but distinguishes "no data" from a genuine zero. Anything the
 * UI renders as a score must use this — a dimension nobody has scored is `null`
 * (shown as “–”), not 0, which would sort it to the top of "weakest".
 */
export function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return round2(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export type Trend = 'improving' | 'stagnant' | 'regressing';

/**
 * Overall direction from the last two graded cycles, oldest first. Ungraded
 * cycles are skipped, and fewer than two graded cycles is `stagnant` — there is
 * no direction to report yet.
 */
export function classifyTrend(averages: Array<number | null>): Trend {
  const graded = averages.filter((value): value is number => value !== null);
  if (graded.length < 2) return 'stagnant';
  const latest = graded[graded.length - 1];
  const previous = graded[graded.length - 2];
  if (latest > previous) return 'improving';
  if (latest < previous) return 'regressing';
  return 'stagnant';
}

/** Percentage of `part` out of `total`, rounded, and 0 when there is nothing. */
export function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export interface WeekBucket {
  label: string;
  count: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Bucket timestamps into trailing 7-day windows ending at `now`, oldest first.
 * Labels are UTC-pinned so the series does not shift with server timezone.
 */
export function weeklyCounts(
  timestamps: Date[],
  now: Date,
  weeks: number,
): WeekBucket[] {
  const end = now.getTime();
  return Array.from({ length: weeks }, (_, index) => {
    const windowEnd = end - (weeks - 1 - index) * WEEK_MS;
    const windowStart = windowEnd - WEEK_MS;
    const count = timestamps.filter((at) => {
      const value = at.getTime();
      return value >= windowStart && value < windowEnd;
    }).length;
    return {
      label: new Date(windowEnd).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }),
      count,
    };
  });
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
