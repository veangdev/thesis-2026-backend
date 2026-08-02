import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import type {
  AssessmentStatus,
  CoachingTag,
  Gender,
  StudentClass,
} from '../generated/prisma/enums';
import {
  COACHING_LOW_THRESHOLD,
  isCoachingRecommended,
} from '../src/modules/assessments/assessment-logic';
import { NOTIFICATION_RULE_CATALOGUE } from '../src/modules/notification-rules/notification-rules.catalogue';
import {
  FAMILY_NAMES,
  FEMALE_GIVEN_NAMES,
  MALE_GIVEN_NAMES,
  PROVINCES,
} from './seed/khmer-names';
import {
  addDays,
  addMonths,
  at,
  clamp,
  createRandom,
  isoDay,
  monthEnd,
  monthStart,
  today,
  type Random,
} from './seed/support';

const adapter = new PrismaPg(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'Password123!';

/** Fixed so a reseed reproduces the dataset exactly. */
const RANDOM_SEED = 20260728;

/**
 * The three documented demo logins (README, Swagger examples). Real Cambodian
 * names, but these email aliases are kept because they are the published way in.
 */
const DEMO_EMAILS = {
  coordinator: 'coordinator@pnc.edu',
  facilitator: 'facilitator@pnc.edu',
  student: 'student@pnc.edu',
} as const;

const DIMENSIONS: readonly { name: string; description: string }[] = [
  {
    name: 'Communication',
    description:
      'Explaining ideas clearly in Khmer and English, in writing and in person.',
  },
  {
    name: 'Teamwork',
    description: 'Contributing to a group and making space for other people.',
  },
  {
    name: 'Problem Solving',
    description: 'Breaking an unfamiliar problem down and working it through.',
  },
  {
    name: 'Leadership',
    description: 'Taking responsibility and helping a team move together.',
  },
  {
    name: 'Technical Skills',
    description: 'Depth and currency in the tools of the chosen track.',
  },
  {
    name: 'Adaptability',
    description: 'Staying effective when requirements or tools change.',
  },
  {
    name: 'Time Management',
    description: 'Planning realistically and delivering when promised.',
  },
  {
    name: 'Critical Thinking',
    description: 'Questioning assumptions and judging evidence honestly.',
  },
];

const CLASS_CYCLE: readonly StudentClass[] = ['A', 'B', 'C'];

/**
 * Growth archetypes, as start/end fractions of the cohort scale. Every student
 * follows one, so the analytics screens have clearly improving, flat, and
 * declining journeys to chart — and the §5.5 coaching rule (weak, or
 * stagnant/regressed) fires for real rather than needing hand-placed flags.
 */
const ARCHETYPES = {
  improving: { start: 0.52, end: 0.98 },
  steady: { start: 0.62, end: 0.82 },
  stagnant: { start: 0.6, end: 0.6 },
  regressing: { start: 0.86, end: 0.44 },
} as const;
type Archetype = keyof typeof ARCHETYPES;

/** Roughly half improving; the rest split across the other three. */
const ARCHETYPE_CYCLE: readonly Archetype[] = [
  'improving',
  'steady',
  'improving',
  'stagnant',
  'improving',
  'regressing',
  'steady',
  'improving',
];

/**
 * The programme's cohorts, oldest first.
 *
 * A batch **is** its intake year, so `name` is always exactly `Batch YYYY` and
 * no two entries may share a year — the API enforces both (see
 * `CreateCohortDto` and the unique index on `cohorts.name`). Anything that
 * distinguishes one intake from another beyond the year — the track it runs,
 * the scale it is assessed on — belongs in `description`, not in the name.
 * `track` survives only as the middle segment of a student code (`2025-SE-03`).
 *
 * `startsMonthsAgo` positions each intake relative to today, so the set always
 * spans graduated, mid-programme, and just-started cohorts. It steps by 12 so
 * every intake lands in January of a distinct year, which is what keeps the
 * names unique without hand-tuning them. `completedCycles` counts cycles
 * already closed; active cohorts additionally get one open cycle containing
 * today plus one upcoming. Cycles run every three months and the programme is
 * 24 months, so an intake N months old carries min(N/3, 8) closed cycles —
 * keep the two in step or a cohort's history stops well short of its open
 * cycle and the growth line shows a gap that reads as missing data.
 */
const COHORTS: readonly {
  name: string;
  track: string;
  description: string;
  scoringScaleMax: number;
  startsMonthsAgo: number;
  completedCycles: number;
  status: 'active' | 'completed' | 'archived';
  students: number;
}[] = [
  {
    name: 'Batch 2022',
    track: 'SE',
    description:
      'Graduated intake. Full-stack track on a 5-point scale; kept for historical reporting.',
    scoringScaleMax: 5,
    startsMonthsAgo: 54,
    completedCycles: 8,
    status: 'completed',
    students: 12,
  },
  {
    name: 'Batch 2023',
    track: 'DS',
    description:
      'Graduated intake. Analytics and ML track, assessed on a 10-point scale.',
    scoringScaleMax: 10,
    startsMonthsAgo: 42,
    completedCycles: 8,
    status: 'completed',
    students: 12,
  },
  {
    name: 'Batch 2024',
    track: 'PD',
    description: 'Graduated intake. UX and product track on a 5-point scale.',
    scoringScaleMax: 5,
    startsMonthsAgo: 30,
    completedCycles: 8,
    status: 'completed',
    students: 12,
  },
  {
    name: 'Batch 2025',
    track: 'SE',
    description:
      'Mid-programme. Full-stack track on a 5-point scale, six cycles closed.',
    scoringScaleMax: 5,
    startsMonthsAgo: 18,
    completedCycles: 6,
    status: 'active',
    students: 14,
  },
  {
    name: 'Batch 2026',
    track: 'DS',
    description:
      'Newest intake. Analytics and ML track on a 10-point scale — proves the scale is configurable.',
    scoringScaleMax: 10,
    startsMonthsAgo: 6,
    // Two closed cycles, not one: `classifyTrend` needs two graded cycles to say
    // anything, so a single-cycle cohort reports every student as "stagnant" —
    // which reads as a bug rather than as "not enough data yet".
    completedCycles: 2,
    status: 'active',
    students: 14,
  },
];

const FACILITATOR_COUNT = 8;

/**
 * Which cohort the demo trio lives in: `Batch 2025`.
 *
 * Chosen deliberately, not incidentally. It is **active**, so the demo student
 * has a live draft to walk the wizard through, and it already has six closed
 * cycles, so their Journey Star and growth line have real history to plot. The
 * earlier cohorts in the list are graduated — putting the demo student there
 * left them with nothing to do, which is the whole point of a demo account.
 * The newest intake is active too but only two cycles deep, which plots as a
 * two-point line. Index, not name lookup: keep it pointing at `Batch 2025` if
 * the list is ever reordered.
 */
const DEMO_COHORT_INDEX = 3;

/**
 * Open-cycle statuses for the first five students of the demo cohort, who are all
 * assigned to the demo facilitator.
 *
 * Hard-coded rather than sampled so that logging in as `facilitator@pnc.edu`
 * always presents one of every reviewable state on one roster — including an
 * `agreed` cycle, the only state "Complete cycle" can act on, and the easiest
 * thing to leave untested because nothing else produces it.
 */
const DEMO_ROSTER_STATUSES: readonly AssessmentStatus[] = [
  'draft',
  'self_submitted',
  'mentor_review',
  'agreed',
  'completed',
];

/** Fraction of the scale at/above which a facilitator would call it a strength. */
const STRENGTH_THRESHOLD = 0.8;

/**
 * The facilitator's judgement label for an agreed score. Deliberately never
 * `coaching_recommended`: that would shadow the system-derived
 * `coachingRecommended` flag and make seeded data unable to show the two apart.
 */
function coachingTagFor(agreed: number, scaleMax: number): CoachingTag {
  if (agreed <= COACHING_LOW_THRESHOLD * scaleMax) return 'needs_focus';
  if (agreed >= STRENGTH_THRESHOLD * scaleMax) return 'strength';
  return 'on_track';
}

const SELF_REFLECTIONS: readonly string[] = [
  'I practised this every week with my study group and can feel the difference.',
  'Still hard for me in big groups, but one-on-one I am much more confident now.',
  'My facilitator gave me exercises that genuinely helped this cycle.',
  'I want to put more effort here next cycle — I know it is my weakest area.',
  'The class project pushed me much further than I expected.',
  'I read a lot about this but have not had the chance to apply it yet.',
  'Presenting at the showcase was frightening and it taught me the most.',
];

const MENTOR_NOTES: readonly string[] = [
  'Clear progress since the last cycle — keep the momentum.',
  'We discussed concrete situations; this needs steady practice, not theory.',
  'Strong one-on-one, noticeably less confident in front of the whole class.',
  'Recommended pairing with a peer mentor on this dimension.',
  'Solid foundation now; ready for a stretch assignment.',
  'Honest self-assessment, which is itself a good sign.',
  'Scores dipped this cycle — we agreed on two specific habits to rebuild.',
];

const GOAL_TEMPLATES: readonly { title: string; description: string }[] = [
  {
    title: 'Present at the monthly showcase',
    description: 'Stand up in front of the whole batch and present my project.',
  },
  {
    title: 'Lead one sprint as scrum master',
    description: 'Run stand-ups and the retro for a full two-week sprint.',
  },
  {
    title: 'Keep a weekly learning journal',
    description: 'Write one honest page every Friday about what I learned.',
  },
  {
    title: 'Pair-programme with a classmate weekly',
    description: 'Book a fixed two-hour slot every week and keep it.',
  },
  {
    title: 'Speak up at least once in every class',
    description: 'Ask one real question per session instead of staying quiet.',
  },
  {
    title: 'Finish the advanced track exercises',
    description: 'Complete the optional exercises, not only the required ones.',
  },
  {
    title: 'Mentor a junior student',
    description: 'Support someone from the newer batch for a whole cycle.',
  },
  {
    title: 'Ship a personal project end to end',
    description: 'Design, build, and actually deploy something of my own.',
  },
];

const COACHING_TITLES: readonly string[] = [
  '1:1 communication coaching',
  'Presentation skills clinic',
  'Teamwork retrospective',
  'Career readiness conversation',
  'Technical depth check-in',
  'Time management workshop',
  'Leadership circle',
  'Mock interview practice',
  'Peer feedback session',
  'Goal setting for the next cycle',
];

// ─────────────────────────── Reset ───────────────────────────

/**
 * Wipe every seeded table, children first.
 *
 * Most relations cascade from `User`/`Cohort`, but the order is written out
 * explicitly rather than relying on that: an accidental schema change that drops
 * a cascade would otherwise turn a reseed into a partial wipe that half-succeeds.
 */
async function resetDatabase(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.notificationRule.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.actionItem.deleteMany();
  await prisma.coachingSessionDimension.deleteMany();
  await prisma.coachingParticipant.deleteMany();
  await prisma.coachingSession.deleteMany();
  await prisma.assessmentScore.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.assessmentPeriod.deleteMany();
  await prisma.dimension.deleteMany();
  await prisma.mentorAssignment.deleteMany();
  await prisma.cohortMember.deleteMany();
  await prisma.cohort.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

// ─────────────────────────── People ───────────────────────────

interface PersonName {
  name: string;
  email: string;
  gender: Gender;
}

/**
 * Distinct Cambodian names, family name first.
 *
 * Uniqueness is enforced on the composed name *and* the derived email — with 30
 * family names and 25 given names per gender the pools are large enough that a
 * collision just means drawing again, and the loop is bounded by walking the
 * pools deterministically rather than retrying at random forever.
 */
function makeNamePool(random: Random, count: number, femaleRatio = 0.5) {
  const used = new Set<string>();
  const people: PersonName[] = [];
  let attempts = 0;

  while (people.length < count && attempts < count * 200) {
    attempts++;
    const gender: Gender = random.chance(femaleRatio) ? 'female' : 'male';
    const given = random.pick(
      gender === 'female' ? FEMALE_GIVEN_NAMES : MALE_GIVEN_NAMES,
    );
    const family = random.pick(FAMILY_NAMES);
    const name = `${family} ${given}`;
    if (used.has(name)) continue;
    used.add(name);
    people.push({
      name,
      email: `${given.toLowerCase()}.${family.toLowerCase()}@pnc.edu`,
      gender,
    });
  }

  if (people.length < count) {
    throw new Error(
      `Name pool exhausted: wanted ${count}, produced ${people.length}`,
    );
  }
  return people;
}

// ─────────────────────────── Scores ───────────────────────────

/**
 * A whole-number score sequence from `start` to `end` over `cycles` cycles, with
 * every step of change placed at the **end** of the run.
 *
 * Integers, not rounded fractions, because of how §5.5 reads them. A fractional
 * trajectory rounded per cycle produces frequent ties on a 5-point scale — six
 * cycles across five possible values cannot all differ — and the coaching rule
 * counts a tie as "stagnant". That made 51% of all scores flagged and put 50 of
 * 64 students "at risk" (`isAtRisk` trips at two flags), which is noise, not a
 * signal.
 *
 * Placing the changes late means an improving student's **most recent** cycle
 * always shows real movement, so they are not flagged; a regressing one's always
 * shows a drop, so they are. The dashboard then flags the students the archetypes
 * actually say are struggling.
 */
function ramp(start: number, end: number, cycles: number): number[] {
  if (cycles <= 1) return [start];
  const totalChange = end - start;
  const steps = cycles - 1;
  const changing = Math.min(Math.abs(totalChange), steps);
  const direction = Math.sign(totalChange);
  // The first `steps - changing` transitions are flat, the rest move by one.
  const flat = steps - changing;

  const series = [start];
  for (let step = 0; step < steps; step++) {
    const previous = series[series.length - 1];
    series.push(step < flat ? previous : previous + direction);
  }
  return series;
}

/**
 * One student's agreed score per cycle for one dimension.
 *
 * The per-dimension offset shifts the whole ramp up or down a point, so a radar
 * has an organic shape instead of being a circle, without breaking the
 * archetype's direction of travel.
 */
function scoreSeries(
  archetype: Archetype,
  scaleMax: number,
  cycles: number,
  dimensionOffset: number,
): number[] {
  const { start, end } = ARCHETYPES[archetype];
  let first = Math.round(start * scaleMax) + dimensionOffset;
  let last = Math.round(end * scaleMax) + dimensionOffset;

  // The offset is applied by **shifting** the whole ramp into range, never by
  // clamping its ends. Clamping collapses the span — an improving dimension
  // offset above the ceiling became `[4,4,4,4,5]` — and every flat step it
  // creates is read by §5.5 as stagnation. That single detail was flagging a
  // third of all dimensions and putting half the programme "at risk".
  const overflow = Math.max(0, first - scaleMax, last - scaleMax);
  first -= overflow;
  last -= overflow;
  const underflow = Math.max(0, 1 - first, 1 - last);
  first += underflow;
  last += underflow;

  return ramp(clamp(first, 1, scaleMax), clamp(last, 1, scaleMax), cycles);
}

/**
 * How far through the status machine an open-cycle assessment has got.
 *
 * Weighted so every screen has work waiting the moment someone logs in: a review
 * queue with submissions, reviews mid-conversation, and — importantly — cycles
 * already at `agreed`, which is the only state "Complete cycle" can act on.
 */
const OPEN_CYCLE_SPREAD: readonly AssessmentStatus[] = [
  'draft',
  'draft',
  'self_submitted',
  'self_submitted',
  'self_submitted',
  'mentor_review',
  'mentor_review',
  'agreed',
  'agreed',
  'completed',
  'completed',
  'draft',
  'self_submitted',
  'mentor_review',
];

async function main(): Promise<void> {
  const reset = process.env.SEED_RESET === 'true';
  const existing = await prisma.user.count();

  if (existing > 0 && !reset) {
    console.log(
      `Seed skipped: ${existing} users already present. Re-run with SEED_RESET=true to wipe and reseed.`,
    );
    return;
  }
  if (existing > 0) {
    console.log(
      `→ SEED_RESET=true — wiping ${existing} existing users and all related data...`,
    );
    await resetDatabase();
  }

  const random = createRandom(RANDOM_SEED);
  const now = today();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const totalStudents = COHORTS.reduce(
    (sum, cohort) => sum + cohort.students,
    0,
  );
  // One pool for everyone, so no student shares a name with a facilitator.
  const namePool = makeNamePool(random, 1 + FACILITATOR_COUNT + totalStudents);

  // ── Coordinator ─────────────────────────────────────────────────────────
  const coordinatorName = namePool[0];
  const coordinator = await prisma.user.create({
    data: {
      name: coordinatorName.name,
      email: DEMO_EMAILS.coordinator,
      passwordHash,
      role: 'program_coordinator',
      gender: coordinatorName.gender,
      createdAt: addMonths(now, -48),
    },
  });

  // ── Facilitators ────────────────────────────────────────────────────────
  const facilitatorNames = namePool.slice(1, 1 + FACILITATOR_COUNT);
  const facilitators = [];
  for (let i = 0; i < facilitatorNames.length; i++) {
    const person = facilitatorNames[i];
    // Free days over the coming fortnight, so the coaching scheduler has slots.
    const availability = [3, 5, 8, 10, 12]
      .map((offset) => isoDay(addDays(now, offset + (i % 3))))
      .filter((_, index) => (i + index) % 4 !== 0);

    facilitators.push(
      await prisma.user.create({
        data: {
          name: person.name,
          // The first facilitator carries the documented demo alias.
          email: i === 0 ? DEMO_EMAILS.facilitator : person.email,
          passwordHash,
          role: 'facilitator',
          gender: person.gender,
          // Two dimensions each, plus the province they coach out of.
          expertiseTags: [
            DIMENSIONS[i % DIMENSIONS.length].name,
            DIMENSIONS[(i + 3) % DIMENSIONS.length].name,
            PROVINCES[i % PROVINCES.length],
          ],
          availability,
          // One facilitator has left the programme — exercises the inactive
          // filter and proves history survives deactivation.
          isActive: i !== FACILITATOR_COUNT - 1,
          createdAt: addMonths(now, -(40 - i * 3)),
        },
      }),
    );
  }

  // ── Cohorts, dimensions, periods, rosters, assessments ──────────────────
  const studentNames = namePool.slice(1 + FACILITATOR_COUNT);
  let studentCursor = 0;

  const allStudents: {
    id: string;
    name: string;
    cohortIndex: number;
    isDemo: boolean;
  }[] = [];
  const cohortRecords: {
    id: string;
    name: string;
    scaleMax: number;
    dimensionIds: string[];
    dimensionNames: string[];
    openPeriodId: string | null;
    studentIds: string[];
  }[] = [];

  let assessmentCount = 0;
  let scoreCount = 0;
  let coachingFlagCount = 0;

  for (let c = 0; c < COHORTS.length; c++) {
    const config = COHORTS[c];
    const cohortStart = monthStart(addMonths(now, -config.startsMonthsAgo));
    const batchYear = config.name.match(/\b(20\d{2})\b/)?.[1] ?? '2025';

    const cohort = await prisma.cohort.create({
      data: {
        name: config.name,
        description: config.description,
        startDate: cohortStart,
        expectedEndDate: addMonths(cohortStart, 24),
        scoringScaleMax: config.scoringScaleMax,
        status: config.status,
        createdAt: addDays(cohortStart, -30),
      },
    });

    const dimensions = [];
    for (let d = 0; d < DIMENSIONS.length; d++) {
      dimensions.push(
        await prisma.dimension.create({
          data: {
            cohortId: cohort.id,
            name: DIMENSIONS[d].name,
            description: DIMENSIONS[d].description,
            order: d,
          },
        }),
      );
    }

    // ── Periods: closed cycles, then (for active cohorts) open + upcoming ──
    const periods = [];
    for (let p = 0; p < config.completedCycles; p++) {
      // Cycles run for a month, one every three months from the intake.
      const start = monthStart(addMonths(cohortStart, p * 3));
      periods.push(
        await prisma.assessmentPeriod.create({
          data: {
            cohortId: cohort.id,
            name: `Cycle ${p + 1}`,
            startDate: start,
            endDate: monthEnd(start),
            status: 'completed',
          },
        }),
      );
    }

    let openPeriod = null;
    if (config.status === 'active') {
      // The open cycle spans the current month, so it always contains today.
      openPeriod = await prisma.assessmentPeriod.create({
        data: {
          cohortId: cohort.id,
          name: `Cycle ${config.completedCycles + 1}`,
          startDate: monthStart(now),
          endDate: monthEnd(now),
          status: 'active',
        },
      });
      await prisma.assessmentPeriod.create({
        data: {
          cohortId: cohort.id,
          name: `Cycle ${config.completedCycles + 2}`,
          startDate: monthStart(now, 3),
          endDate: monthEnd(now, 3),
          status: 'upcoming',
        },
      });
    }

    // ── Roster ────────────────────────────────────────────────────────────
    const isDemoCohort = c === DEMO_COHORT_INDEX;

    // Facilitators are drawn in overlapping triples so workloads differ between
    // them — a flat split makes the mentor-workload widget look synthetic. The
    // demo cohort always leads with the demo facilitator, so the two demo
    // accounts are actually mentor and mentee rather than strangers.
    const cohortFacilitators = (
      isDemoCohort
        ? [
            facilitators[0],
            facilitators[(c + 1) % FACILITATOR_COUNT],
            facilitators[(c + 4) % FACILITATOR_COUNT],
          ]
        : [
            facilitators[c % FACILITATOR_COUNT],
            facilitators[(c + 1) % FACILITATOR_COUNT],
            facilitators[(c + 4) % FACILITATOR_COUNT],
          ]
    ).filter((facilitator) => facilitator.isActive);

    const cohortStudentIds: string[] = [];
    for (let s = 0; s < config.students; s++) {
      const person = studentNames[studentCursor++];
      const isDemoStudent = isDemoCohort && s === 0;
      const student = await prisma.user.create({
        data: {
          name: person.name,
          email: isDemoStudent ? DEMO_EMAILS.student : person.email,
          passwordHash,
          role: 'self_assessor',
          gender: person.gender,
          studentClass: CLASS_CYCLE[s % CLASS_CYCLE.length],
          studentCode: `${batchYear}-${config.track}-${String(s + 1).padStart(2, '0')}`,
          // A couple of students per graduated cohort have left the programme.
          isActive: !(
            config.status === 'completed' && s === config.students - 1
          ),
          createdAt: addDays(cohortStart, -14),
        },
      });
      cohortStudentIds.push(student.id);
      allStudents.push({
        id: student.id,
        name: student.name,
        cohortIndex: c,
        isDemo: isDemoStudent,
      });

      await prisma.cohortMember.create({
        data: {
          userId: student.id,
          cohortId: cohort.id,
          joinedAt: cohortStart,
        },
      });

      // The demo facilitator owns the first five of the demo cohort, so one
      // login shows one of every reviewable state on a single roster.
      const facilitator =
        isDemoCohort && s < DEMO_ROSTER_STATUSES.length
          ? cohortFacilitators[0]
          : cohortFacilitators[s % cohortFacilitators.length];
      await prisma.mentorAssignment.create({
        data: {
          facilitatorId: facilitator.id,
          selfAssessorId: student.id,
          cohortId: cohort.id,
          createdAt: addDays(cohortStart, 7),
        },
      });

      // ── Assessments ─────────────────────────────────────────────────────
      const archetype = ARCHETYPE_CYCLE[s % ARCHETYPE_CYCLE.length];
      // The whole trajectory is precomputed per dimension: one score per closed
      // cycle plus one for the open cycle, so the series is monotone by
      // construction rather than per-cycle rounding.
      const totalCycles = periods.length + (openPeriod ? 1 : 0);
      // ±1 point, rotated by the student's index. Without the rotation every
      // student is weakest in the same dimensions, and the cohort's "weakest
      // dimensions" widget reports an artefact of the seed rather than a finding.
      const OFFSET_PATTERN = [0, 1, 0, 1, -1, 0, 1, 0];
      const dimensionSeries = dimensions.map((_, d) =>
        scoreSeries(
          archetype,
          config.scoringScaleMax,
          totalCycles,
          OFFSET_PATTERN[(d + s * 3) % OFFSET_PATTERN.length],
        ),
      );
      const previousAgreed = new Map<string, number>();

      for (let p = 0; p < periods.length; p++) {
        const period = periods[p];
        const scores = dimensions.map((dimension, d) => {
          const agreed = dimensionSeries[d][p];
          // Students under-rate or over-rate themselves by a point.
          const selfScore = clamp(
            agreed + random.int(-1, 1),
            1,
            config.scoringScaleMax,
          );
          const mentorScore = clamp(
            agreed + (random.chance(0.75) ? 0 : random.pick([-1, 1])),
            1,
            config.scoringScaleMax,
          );
          const recommended = isCoachingRecommended(
            agreed,
            config.scoringScaleMax,
            previousAgreed.get(dimension.id),
          );
          if (recommended) coachingFlagCount++;
          previousAgreed.set(dimension.id, agreed);
          scoreCount++;

          return {
            dimensionId: dimension.id,
            selfScore,
            selfReflection: random.chance(0.8)
              ? random.pick(SELF_REFLECTIONS)
              : null,
            mentorScore,
            mentorNote: random.chance(0.85) ? random.pick(MENTOR_NOTES) : null,
            agreedScore: agreed,
            coachingTag: coachingTagFor(agreed, config.scoringScaleMax),
            coachingRecommended: recommended,
          };
        });

        // Submitted mid-cycle; agreed at the close; completed a few days later.
        const submittedAt = addDays(period.startDate, random.int(8, 20));
        const agreedAt = addDays(period.endDate, -random.int(0, 3));
        const completedAt = addDays(agreedAt, random.int(1, 5));

        await prisma.assessment.create({
          data: {
            studentId: student.id,
            periodId: period.id,
            status: 'completed',
            submittedAt,
            mentorSubmittedAt: agreedAt,
            completedAt,
            overallReflection: `Cycle ${p + 1}: I worked on the dimensions my facilitator and I agreed were weakest, and I can see where I moved and where I did not.`,
            overallFeedback: `Cycle ${p + 1}: honest self-assessment and steady effort. Keep the momentum on the flagged dimensions.`,
            createdAt: period.startDate,
            scores: { create: scores },
          },
        });
        assessmentCount++;
      }

      // ── The open cycle, spread across the status machine ────────────────
      if (openPeriod) {
        // The demo roster is pinned to one of each state (the demo student first,
        // on a clean `draft`, so the wizard can be walked end to end without
        // resetting anything). Everyone else is spread deterministically.
        const status =
          isDemoCohort && s < DEMO_ROSTER_STATUSES.length
            ? DEMO_ROSTER_STATUSES[s]
            : OPEN_CYCLE_SPREAD[(s + c * 3) % OPEN_CYCLE_SPREAD.length];

        const hasSelf = status !== 'draft';
        const hasMentor =
          status === 'mentor_review' ||
          status === 'agreed' ||
          status === 'completed';
        const hasAgreed = status === 'agreed' || status === 'completed';

        const cycleIndex = periods.length;
        const scores = dimensions.map((dimension, d) => {
          const agreed = dimensionSeries[d][cycleIndex];
          const selfScore = clamp(
            agreed + random.int(-1, 1),
            1,
            config.scoringScaleMax,
          );
          const recommended =
            status === 'completed' &&
            isCoachingRecommended(
              agreed,
              config.scoringScaleMax,
              previousAgreed.get(dimension.id),
            );
          if (recommended) coachingFlagCount++;
          scoreCount++;

          return {
            dimensionId: dimension.id,
            selfScore: hasSelf ? selfScore : null,
            selfReflection:
              hasSelf && random.chance(0.7)
                ? random.pick(SELF_REFLECTIONS)
                : null,
            mentorScore: hasMentor ? agreed : null,
            mentorNote:
              hasMentor && random.chance(0.8)
                ? random.pick(MENTOR_NOTES)
                : null,
            agreedScore: hasAgreed ? agreed : null,
            coachingTag: hasMentor
              ? coachingTagFor(agreed, config.scoringScaleMax)
              : null,
            coachingRecommended: recommended,
          };
        });

        const submittedAt = hasSelf
          ? addDays(openPeriod.startDate, random.int(1, 12))
          : null;
        const agreedAt = hasAgreed ? addDays(now, -random.int(1, 5)) : null;

        await prisma.assessment.create({
          data: {
            studentId: student.id,
            periodId: openPeriod.id,
            status,
            submittedAt,
            mentorSubmittedAt: agreedAt,
            // `agreed` deliberately has no `completedAt` — that is what makes it
            // completable from the UI, which is the state worth demoing.
            completedAt:
              status === 'completed' ? addDays(agreedAt ?? now, 1) : null,
            overallReflection: hasSelf
              ? 'This cycle I focused on speaking up earlier instead of waiting to be asked.'
              : null,
            overallFeedback: hasAgreed
              ? 'We agreed on the scores and on two concrete habits for next cycle.'
              : null,
            createdAt: openPeriod.startDate,
            scores: { create: scores },
          },
        });
        assessmentCount++;
      }
    }

    cohortRecords.push({
      id: cohort.id,
      name: cohort.name,
      scaleMax: config.scoringScaleMax,
      dimensionIds: dimensions.map((dimension) => dimension.id),
      dimensionNames: dimensions.map((dimension) => dimension.name),
      openPeriodId: openPeriod?.id ?? null,
      studentIds: cohortStudentIds,
    });
  }

  // ── Coaching sessions ────────────────────────────────────────────────────
  let sessionCount = 0;
  let actionItemCount = 0;

  // Every third session belongs to the demo facilitator so their calendar has
  // real depth — a round-robin over eight gave the demo login four sessions and
  // one upcoming, which reads as an empty product.
  for (let i = 0; i < 48; i++) {
    const cohortRecord =
      i % 3 === 0
        ? cohortRecords[DEMO_COHORT_INDEX]
        : cohortRecords[i % cohortRecords.length];
    const facilitator =
      i % 3 === 0 ? facilitators[0] : facilitators[i % FACILITATOR_COUNT];
    if (!facilitator.isActive) continue;

    // Roughly a third in the past (completed or cancelled), the rest upcoming —
    // so the calendar has history to read and work still to do. Keyed off i % 5
    // rather than i % 3, which now selects the demo facilitator and would have
    // handed them nothing but past sessions.
    const isPast = i % 5 < 2;
    const dayOffset = isPast ? -random.int(4, 90) : random.int(0, 28);
    const scheduledAt = at(addDays(now, dayOffset), random.int(9, 16), 0);
    const status = isPast
      ? random.chance(0.85)
        ? 'completed'
        : 'cancelled'
      : 'scheduled';

    const scope = random.pick([
      'individual',
      'group',
      'class',
      'batch',
    ] as const);
    const roster = random.shuffle(cohortRecord.studentIds);
    const participantIds =
      scope === 'individual'
        ? roster.slice(0, 1)
        : scope === 'group'
          ? roster.slice(0, random.int(3, 5))
          : scope === 'class'
            ? roster.slice(0, Math.ceil(roster.length / 3))
            : roster;

    const targetDimensionIds = random
      .shuffle(cohortRecord.dimensionIds)
      .slice(0, random.int(1, 3));

    const session = await prisma.coachingSession.create({
      data: {
        title: random.pick(COACHING_TITLES),
        scope,
        facilitatorId: facilitator.id,
        cohortId: cohortRecord.id,
        scheduledAt,
        durationMinutes: random.pick([30, 45, 60, 90]),
        notes: random.chance(0.7)
          ? 'Agreed to focus on one habit and review it at the next session.'
          : null,
        status,
        // Completed sessions book a follow-up; scheduled ones have not yet.
        followUpAt:
          status === 'completed' && random.chance(0.6)
            ? addDays(scheduledAt, 21)
            : null,
        createdAt: addDays(scheduledAt, -random.int(3, 14)),
        participants: {
          create: participantIds.map((userId) => ({ userId })),
        },
        targetDimensions: {
          create: targetDimensionIds.map((dimensionId) => ({ dimensionId })),
        },
      },
    });
    sessionCount++;

    // Action items, assigned to real participants so the assignee picker has
    // something to show — and some left unassigned, which is also valid.
    const itemCount = random.int(1, 3);
    for (let a = 0; a < itemCount; a++) {
      const assigneeId = random.chance(0.7)
        ? random.pick(participantIds)
        : null;
      await prisma.actionItem.create({
        data: {
          sessionId: session.id,
          assigneeId,
          description: random.pick([
            'Rehearse the opening two minutes out loud',
            'Record a five-minute practice talk and watch it back',
            'Write the retro notes and share them with the team',
            'Book a pairing session with a classmate',
            'Ask one question in every class this fortnight',
            'Draft the project plan and review it with the facilitator',
          ]),
          dueDate: random.chance(0.75)
            ? addDays(scheduledAt, random.int(7, 30))
            : null,
          // Past sessions mostly have their items done; upcoming ones do not.
          done: status === 'completed' ? random.chance(0.75) : false,
          createdAt: scheduledAt,
        },
      });
      actionItemCount++;
    }
  }

  // ── Goals ────────────────────────────────────────────────────────────────
  let goalCount = 0;
  for (const student of allStudents) {
    const cohortRecord = cohortRecords[student.cohortIndex];
    // The demo student gets a full set so the Goals screen shows all three
    // sections at once — including the archived one, which is easy to leave
    // empty and was invisible until recently.
    const goals = student.isDemo ? GOAL_TEMPLATES.length : random.int(1, 4);
    const templates = random.shuffle(GOAL_TEMPLATES).slice(0, goals);

    for (let g = 0; g < templates.length; g++) {
      const template = templates[g];
      // Statuses spread so the Goals screen shows all three sections, including
      // the archived one that used to render nowhere.
      // The demo student's first three goals are pinned to one of each status.
      const roll = random.next();
      const status = student.isDemo
        ? (['active', 'achieved', 'archived', 'active'] as const)[g % 4]
        : roll < 0.6
          ? 'active'
          : roll < 0.85
            ? 'achieved'
            : 'archived';
      const progress =
        status === 'achieved'
          ? random.int(90, 100)
          : status === 'archived'
            ? random.int(10, 60)
            : random.int(0, 85);

      // Due dates land across every branch of the due-date hint: overdue,
      // due within a week, and comfortably ahead.
      const dueOffset = random.pick([-40, -12, 2, 5, 21, 60, 120]);

      await prisma.goal.create({
        data: {
          studentId: student.id,
          title: template.title,
          description: random.chance(0.8) ? template.description : null,
          targetDimensionId: random.chance(0.85)
            ? random.pick(cohortRecord.dimensionIds)
            : null,
          targetScore: random.chance(0.6)
            ? random.int(
                Math.ceil(cohortRecord.scaleMax * 0.6),
                cohortRecord.scaleMax,
              )
            : null,
          progressPercent: progress,
          status,
          dueDate: random.chance(0.85) ? addDays(now, dueOffset) : null,
          milestones: random.chance(0.5)
            ? [
                { title: 'Book the first session', done: true },
                { title: 'Practise three times', done: progress > 50 },
                { title: 'Review with my facilitator', done: progress >= 100 },
              ]
            : undefined,
          createdAt: addDays(now, -random.int(20, 200)),
        },
      });
      goalCount++;
    }
  }

  // ── Notifications ────────────────────────────────────────────────────────
  const notifications: {
    userId: string;
    type:
      | 'assessment_reminder'
      | 'coaching_reminder'
      | 'submission'
      | 'goal'
      | 'system'
      | 'achievement';
    title: string;
    body: string;
    href: string | null;
    readAt: Date | null;
    createdAt: Date;
  }[] = [];

  const pushNotification = (
    userId: string,
    type: (typeof notifications)[number]['type'],
    title: string,
    body: string,
    href: string | null,
    daysAgo: number,
  ) => {
    notifications.push({
      userId,
      type,
      title,
      body,
      href,
      // Older notifications are mostly read, recent ones mostly not.
      readAt: random.chance(clamp(daysAgo / 20, 0, 0.85))
        ? addDays(now, -Math.max(0, daysAgo - 1))
        : null,
      createdAt: addDays(now, -daysAgo),
    });
  };

  for (const student of allStudents) {
    pushNotification(
      student.id,
      'assessment_reminder',
      'Assessment cycle is open',
      'Complete your self-assessment before the cycle closes.',
      '/assessments',
      random.int(1, 14),
    );
    if (random.chance(0.6)) {
      pushNotification(
        student.id,
        'coaching_reminder',
        'Coaching session scheduled',
        'Your facilitator booked a session with you.',
        '/coaching',
        random.int(1, 21),
      );
    }
    if (random.chance(0.5)) {
      pushNotification(
        student.id,
        'goal',
        'Goal updated',
        'One of your growth goals was updated.',
        '/goals',
        random.int(1, 30),
      );
    }
    if (random.chance(0.35)) {
      pushNotification(
        student.id,
        'achievement',
        'Milestone reached',
        'You completed another assessment cycle — your star grew.',
        '/journey-star',
        random.int(2, 45),
      );
    }
  }

  for (const facilitator of facilitators) {
    if (!facilitator.isActive) continue;
    for (let n = 0; n < random.int(2, 5); n++) {
      pushNotification(
        facilitator.id,
        'submission',
        'Self-assessment submitted',
        'A self-assessor on your roster submitted for review.',
        '/assessments',
        random.int(1, 12),
      );
    }
  }

  pushNotification(
    coordinator.id,
    'system',
    'Welcome to PNC Journey Star',
    'Your programme workspace is ready.',
    null,
    120,
  );
  for (let n = 0; n < 6; n++) {
    pushNotification(
      coordinator.id,
      'assessment_reminder',
      'Cycle opened',
      'A new assessment cycle opened for one of your cohorts.',
      '/assessments',
      random.int(1, 40),
    );
  }

  await prisma.notification.createMany({ data: notifications });

  // ── Notification rules ───────────────────────────────────────────────────
  // Only stored state; the catalogue itself is code. Seeded at the shipped
  // defaults except one deliberate override, so the screen shows a real toggle.
  // Overridden in both directions on purpose: `weekly-digest` ships off and is
  // stored on, `review-complete` ships on and is stored off. A screen where every
  // toggle agrees with its default cannot show that the stored state is read at
  // all, and gives nothing to toggle back.
  // Only `review-complete` is overridden (ships on, stored off). `weekly-digest`
  // is deliberately left at its shipped default: the Settings spec asserts it
  // starts unchecked before toggling it, so seeding it on made the screen
  // disagree with the documented default.
  const RULE_OVERRIDES: Record<string, boolean> = {
    'review-complete': false,
  };
  await prisma.notificationRule.createMany({
    data: NOTIFICATION_RULE_CATALOGUE.map((rule) => ({
      key: rule.key,
      enabled: RULE_OVERRIDES[rule.key] ?? rule.enabled,
    })),
  });

  // ── Achievements ─────────────────────────────────────────────────────────
  const ACHIEVEMENTS: readonly { key: string; title: string }[] = [
    { key: 'first_assessment', title: 'Completed the first assessment' },
    { key: 'goal_setter', title: 'Set a personal growth goal' },
    { key: 'goal_achiever', title: 'Achieved a growth goal' },
    { key: 'three_cycles', title: 'Completed three cycles' },
    { key: 'star_riser', title: 'Improved in every dimension' },
  ];

  const achievements = [];
  for (const student of allStudents) {
    for (const achievement of random
      .shuffle(ACHIEVEMENTS)
      .slice(0, random.int(1, 4))) {
      achievements.push({
        studentId: student.id,
        key: achievement.key,
        title: achievement.title,
        earnedAt: addDays(now, -random.int(10, 400)),
      });
    }
  }
  await prisma.achievement.createMany({ data: achievements });

  // ── Audit log ────────────────────────────────────────────────────────────
  // Written in the exact shape `AuditInterceptor` produces — `<entity>.<verb>`
  // with `{ fields: [...] }` metadata, field *names* only, never values — so the
  // Settings tab is not set an expectation the real interceptor cannot meet.
  const auditEntries = [];
  const auditTemplates: readonly {
    action: string;
    entity: string;
    fields: string[];
  }[] = [
    // `entity` is the **URL segment**, hence plural, and `action` is
    // `<entity>.<verb>` — exactly what `AuditInterceptor.entityFromPath` derives
    // from `req.path`. Only shapes the interceptor can actually produce are
    // listed: creating a period POSTs to `/cohorts/:id/periods`, so it records
    // `cohorts.created`, and a literal `periods.created` could never appear.
    {
      action: 'cohorts.created',
      entity: 'cohorts',
      fields: ['name', 'scoringScaleMax', 'startDate'],
    },
    { action: 'cohorts.updated', entity: 'cohorts', fields: ['description'] },
    {
      action: 'cohorts.updated',
      entity: 'cohorts',
      fields: ['scoringScaleMax'],
    },
    { action: 'periods.updated', entity: 'periods', fields: ['status'] },
    { action: 'periods.deleted', entity: 'periods', fields: [] },
    {
      action: 'dimensions.updated',
      entity: 'dimensions',
      fields: ['description', 'name'],
    },
    { action: 'dimensions.deleted', entity: 'dimensions', fields: [] },
    {
      action: 'users.created',
      entity: 'users',
      fields: ['email', 'name', 'role'],
    },
    { action: 'users.updated', entity: 'users', fields: ['isActive'] },
    {
      action: 'users.updated',
      entity: 'users',
      fields: ['studentClass', 'studentCode'],
    },
    {
      action: 'assignments.created',
      entity: 'assignments',
      fields: ['cohortId', 'facilitatorId', 'selfAssessorId'],
    },
    {
      action: 'notification-rules.updated',
      entity: 'notification-rules',
      fields: ['enabled'],
    },
  ];

  for (let i = 0; i < 45; i++) {
    const template = auditTemplates[i % auditTemplates.length];
    auditEntries.push({
      actorId: coordinator.id,
      action: template.action,
      entity: template.entity,
      entityId: random.pick(cohortRecords).id,
      // The interceptor omits `metadata` entirely when a write touched no
      // recordable field (a DELETE has no body), so a deletion must not carry an
      // empty `fields` array the real thing would never write.
      ...(template.fields.length
        ? { metadata: { fields: template.fields } }
        : {}),
      createdAt: addDays(now, -random.int(1, 120)),
    });
  }
  await prisma.auditLog.createMany({ data: auditEntries });

  // ── Summary ──────────────────────────────────────────────────────────────
  const openAssessments = await prisma.assessment.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  console.log('\nSeed completed.');
  console.log(
    `  users             1 coordinator · ${facilitators.length} facilitators · ${allStudents.length} self-assessors`,
  );
  console.log(
    `  cohorts           ${COHORTS.length} (${COHORTS.filter((c) => c.status === 'active').length} active, scales 5 & 10)`,
  );
  console.log(
    `  dimensions        ${COHORTS.length * DIMENSIONS.length} · periods ${await prisma.assessmentPeriod.count()}`,
  );
  console.log(
    `  assessments       ${assessmentCount} with ${scoreCount} dimension scores (${coachingFlagCount} coaching flags)`,
  );
  for (const row of openAssessments.sort((a, b) =>
    a.status.localeCompare(b.status),
  )) {
    console.log(`      ${row.status.padEnd(16)} ${row._count._all}`);
  }
  console.log(
    `  coaching          ${sessionCount} sessions · ${actionItemCount} action items`,
  );
  console.log(
    `  goals             ${goalCount} · notifications ${notifications.length} · achievements ${achievements.length}`,
  );
  console.log(`  audit log         ${auditEntries.length} entries`);
  console.log(`\nDemo logins (password ${DEMO_PASSWORD}):`);
  console.log(
    `  ${DEMO_EMAILS.coordinator.padEnd(24)} ${coordinator.name} — Program Coordinator`,
  );
  console.log(
    `  ${DEMO_EMAILS.facilitator.padEnd(24)} ${facilitators[0].name} — Facilitator`,
  );
  const demoStudent = await prisma.user.findUniqueOrThrow({
    where: { email: DEMO_EMAILS.student },
    select: { name: true, studentCode: true },
  });
  console.log(
    `  ${DEMO_EMAILS.student.padEnd(24)} ${demoStudent.name} (${demoStudent.studentCode}) — Self-Assessor`,
  );
  console.log(
    '\nEvery other account uses given.family@pnc.edu with the same password.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
