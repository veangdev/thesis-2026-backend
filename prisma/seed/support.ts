/**
 * Deterministic randomness and date arithmetic for the seed.
 *
 * `Math.random()` is deliberately not used: a reseed must produce byte-identical
 * data, otherwise a bug reproduced on one machine cannot be reproduced on
 * another, and screenshots in the thesis stop matching the database.
 */

/** mulberry32 — small, fast, and good enough for demo data. */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Inclusive integer in `[min, max]`. */
    int: (min: number, max: number): number =>
      min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)],
    /** True with probability `p`. */
    chance: (p: number): boolean => next() < p,
    /** Fisher–Yates, on a copy. */
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

export type Random = ReturnType<typeof createRandom>;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * "Now", floored to midnight UTC.
 *
 * Every seeded date is derived from this rather than hard-coded, so the dataset
 * stays demo-ready whenever it is reseeded: the open cycle always contains today,
 * "this week's" coaching sessions are always this week, and an overdue goal is
 * always genuinely overdue. A fixed calendar would silently rot into a dataset
 * where every cycle is closed and nothing needs attention.
 */
export function today(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** First day of the month `offset` months from `date`, at midnight UTC. */
export function monthStart(date: Date, offset = 0): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1),
  );
}

/** Last day of the month `offset` months from `date`, at 23:59:59.999 UTC. */
export function monthEnd(date: Date, offset = 0): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + offset + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  );
}

/** `YYYY-MM-DD` — the shape `User.availability` stores. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A date at a given hour, useful for scheduling sessions in working hours. */
export function at(date: Date, hour: number, minute = 0): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hour,
      minute,
    ),
  );
}
