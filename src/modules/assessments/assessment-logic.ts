/**
 * Pure business rules for the assessment lifecycle, kept free of Nest/Prisma so
 * they can be unit-tested in isolation (see §5.4 growth, §5.5 coaching).
 */

/** Fraction of the scale at/below which a dimension is considered weak. */
export const COACHING_LOW_THRESHOLD = 0.4;

/**
 * A dimension is flagged for coaching when the agreed score is at or below 40%
 * of the scale maximum, OR it stagnated/regressed versus the previous period
 * (delta ≤ 0).
 */
export function isCoachingRecommended(
  agreedScore: number,
  scaleMax: number,
  previousAgreedScore?: number,
): boolean {
  const isWeak = agreedScore <= COACHING_LOW_THRESHOLD * scaleMax;
  const stagnatedOrRegressed =
    previousAgreedScore !== undefined && agreedScore - previousAgreedScore <= 0;
  return isWeak || stagnatedOrRegressed;
}

/** Growth versus the previous period; `null` when there is no prior score. */
export function computeDelta(
  currentScore: number,
  previousScore?: number,
): number | null {
  if (previousScore === undefined) return null;
  return currentScore - previousScore;
}
