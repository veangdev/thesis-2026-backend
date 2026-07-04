import { computeDelta, isCoachingRecommended } from './assessment-logic';

describe('assessment-logic', () => {
  describe('isCoachingRecommended', () => {
    it('flags a weak score (≤ 40% of scale) even with no history', () => {
      expect(isCoachingRecommended(2, 5)).toBe(true); // 2 ≤ 0.4*5
      expect(isCoachingRecommended(4, 10)).toBe(true); // 4 ≤ 0.4*10
    });

    it('does not flag a strong score with no history', () => {
      expect(isCoachingRecommended(4, 5)).toBe(false);
      expect(isCoachingRecommended(5, 10)).toBe(false);
    });

    it('flags stagnation or regression vs the previous period', () => {
      expect(isCoachingRecommended(4, 5, 4)).toBe(true); // delta 0
      expect(isCoachingRecommended(3, 5, 5)).toBe(true); // regressed
    });

    it('does not flag genuine improvement above the threshold', () => {
      expect(isCoachingRecommended(5, 5, 3)).toBe(false);
      expect(isCoachingRecommended(8, 10, 6)).toBe(false);
    });
  });

  describe('computeDelta', () => {
    it('returns null when there is no previous score', () => {
      expect(computeDelta(4)).toBeNull();
    });

    it('returns the signed difference from the previous score', () => {
      expect(computeDelta(5, 3)).toBe(2);
      expect(computeDelta(2, 4)).toBe(-2);
    });
  });
});
