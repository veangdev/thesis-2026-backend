import {
  average,
  averageOrNull,
  classifyTrend,
  classifyZone,
  delta,
  isAtRisk,
  percentage,
  round2,
  weeklyCounts,
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

  describe('averageOrNull', () => {
    it('separates "no data" from a genuine zero', () => {
      expect(averageOrNull([])).toBeNull();
      expect(averageOrNull([0, 0])).toBe(0);
      expect(averageOrNull([1, 2, 2])).toBe(1.67);
    });
  });

  describe('classifyTrend', () => {
    it('needs two graded cycles before reporting a direction', () => {
      expect(classifyTrend([])).toBe('stagnant');
      expect(classifyTrend([4])).toBe('stagnant');
      expect(classifyTrend([null, 4, null])).toBe('stagnant');
    });

    it('compares the last two graded cycles, skipping ungraded ones', () => {
      expect(classifyTrend([3, null, 4])).toBe('improving');
      expect(classifyTrend([4, null, 3])).toBe('regressing');
      expect(classifyTrend([3, 3])).toBe('stagnant');
    });

    it('ignores cycles before the last two', () => {
      expect(classifyTrend([1, 5, 4])).toBe('regressing');
    });
  });

  describe('percentage', () => {
    it('is 0 when there is nothing to divide by', () => {
      expect(percentage(0, 0)).toBe(0);
      expect(percentage(3, 0)).toBe(0);
    });

    it('rounds to a whole percent', () => {
      expect(percentage(1, 3)).toBe(33);
      expect(percentage(2, 4)).toBe(50);
    });
  });

  describe('weeklyCounts', () => {
    const now = new Date('2026-07-26T00:00:00.000Z');

    it('returns one bucket per week, oldest first, UTC-labelled', () => {
      const buckets = weeklyCounts([], now, 3);
      expect(buckets.map((b) => b.label)).toEqual([
        '12 Jul',
        '19 Jul',
        '26 Jul',
      ]);
      expect(buckets.map((b) => b.count)).toEqual([0, 0, 0]);
    });

    it('buckets each timestamp into its trailing 7-day window', () => {
      const buckets = weeklyCounts(
        [
          new Date('2026-07-25T12:00:00.000Z'), // last window
          new Date('2026-07-20T00:00:00.000Z'), // last window
          new Date('2026-07-15T00:00:00.000Z'), // middle window
        ],
        now,
        3,
      );
      expect(buckets.map((b) => b.count)).toEqual([0, 1, 2]);
    });

    it('drops timestamps outside the window entirely', () => {
      const buckets = weeklyCounts(
        [new Date('2026-01-01T00:00:00.000Z')],
        now,
        3,
      );
      expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(0);
    });
  });
});
