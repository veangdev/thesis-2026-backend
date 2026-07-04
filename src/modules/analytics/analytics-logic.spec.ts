import {
  average,
  classifyZone,
  delta,
  isAtRisk,
  round2,
} from './analytics-logic';

describe('analytics-logic', () => {
  describe('classifyZone', () => {
    it('buckets by fraction of the scale', () => {
      expect(classifyZone(2, 5)).toBe('needs_support'); // 40%
      expect(classifyZone(3, 5)).toBe('developing'); // 60%
      expect(classifyZone(4, 5)).toBe('strong'); // 80%
      expect(classifyZone(7, 10)).toBe('developing'); // 70% boundary
      expect(classifyZone(8, 10)).toBe('strong');
    });

    it('is safe when scale is zero', () => {
      expect(classifyZone(0, 0)).toBe('needs_support');
    });
  });

  describe('average', () => {
    it('returns 0 for an empty set and rounds to 2dp', () => {
      expect(average([])).toBe(0);
      expect(average([1, 2, 2])).toBe(1.67);
    });
  });

  describe('delta', () => {
    it('is null without a previous value, otherwise the signed diff', () => {
      expect(delta(4)).toBeNull();
      expect(delta(5, 3)).toBe(2);
      expect(delta(2, 5)).toBe(-3);
    });
  });

  describe('isAtRisk', () => {
    it('flags a low average', () => {
      expect(isAtRisk(2, 5, 0)).toBe(true); // 2 ≤ 40% of 5
    });
    it('flags two or more coaching flags even with a decent average', () => {
      expect(isAtRisk(4, 5, 2)).toBe(true);
    });
    it('does not flag a healthy student', () => {
      expect(isAtRisk(4, 5, 1)).toBe(false);
    });
  });

  describe('round2', () => {
    it('rounds to two decimal places', () => {
      expect(round2(1.005)).toBeCloseTo(1.0, 5);
      expect(round2(2.346)).toBe(2.35);
    });
  });
});
