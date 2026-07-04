import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { isCoachingRecommended } from '../src/modules/assessments/assessment-logic';

const adapter = new PrismaPg(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'Password123!';

const DIMENSION_NAMES = [
  'Communication',
  'Teamwork',
  'Problem Solving',
  'Leadership',
  'Technical Skills',
  'Adaptability',
  'Time Management',
  'Critical Thinking',
];

/** Fraction-of-scale trajectories across periods (drives growth analytics). */
const TRAJECTORIES = {
  improving: [0.4, 0.6, 0.8],
  stagnant: [0.6, 0.6, 0.6],
  regressing: [0.85, 0.65, 0.5],
} as const;
type Trajectory = keyof typeof TRAJECTORIES;
const TRAJECTORY_CYCLE: Trajectory[] = ['improving', 'stagnant', 'regressing'];

const COHORTS = [
  {
    name: 'Batch 2025 — Software Engineering',
    scoringScaleMax: 5,
    completedPeriods: 3,
  },
  {
    name: 'Batch 2026 — Data Science',
    scoringScaleMax: 10,
    completedPeriods: 2,
  },
  {
    name: 'Batch 2026 — Product Design',
    scoringScaleMax: 5,
    completedPeriods: 2,
  },
];

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

function scoreFor(
  trajectory: Trajectory,
  periodIndex: number,
  scaleMax: number,
  dimIndex: number,
): number {
  const base = TRAJECTORIES[trajectory][periodIndex] ?? 0.6;
  const jitter = ((dimIndex % 3) - 1) * 0.05; // -0.05, 0, +0.05
  const fraction = clamp(base + jitter, 0.1, 1);
  return clamp(Math.round(fraction * scaleMax), 1, scaleMax);
}

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: 'coordinator@pnc.edu' },
  });
  if (existing) {
    console.log('Seed skipped: data already present (coordinator@pnc.edu).');
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ── Users ──────────────────────────────────────────────────────────────
  const coordinator = await prisma.user.create({
    data: {
      name: 'Program Coordinator',
      email: 'coordinator@pnc.edu',
      passwordHash,
      role: 'program_coordinator',
    },
  });

  const facilitators = [];
  for (let i = 0; i < 6; i++) {
    const email =
      i === 0 ? 'facilitator@pnc.edu' : `facilitator${i + 1}@pnc.edu`;
    facilitators.push(
      await prisma.user.create({
        data: {
          name: `Facilitator ${i + 1}`,
          email,
          passwordHash,
          role: 'facilitator',
          expertiseTags: [
            DIMENSION_NAMES[i % DIMENSION_NAMES.length],
            'coaching',
          ],
        },
      }),
    );
  }

  const students = [];
  for (let i = 0; i < 30; i++) {
    const email = i === 0 ? 'student@pnc.edu' : `student${i + 1}@pnc.edu`;
    students.push(
      await prisma.user.create({
        data: {
          name: `Student ${String(i + 1).padStart(2, '0')}`,
          email,
          passwordHash,
          role: 'self_assessor',
        },
      }),
    );
  }

  // ── Cohorts, dimensions, memberships, assignments ────────────────────────
  let createdAssessments = 0;
  let flaggedDimensions = 0;

  for (let c = 0; c < COHORTS.length; c++) {
    const config = COHORTS[c];
    const cohort = await prisma.cohort.create({
      data: {
        name: config.name,
        startDate: new Date('2025-01-15T00:00:00.000Z'),
        expectedEndDate: new Date('2027-01-15T00:00:00.000Z'),
        scoringScaleMax: config.scoringScaleMax,
      },
    });

    const dimensions = [];
    for (let d = 0; d < DIMENSION_NAMES.length; d++) {
      dimensions.push(
        await prisma.dimension.create({
          data: {
            cohortId: cohort.id,
            name: DIMENSION_NAMES[d],
            description: `${DIMENSION_NAMES[d]} competency`,
            order: d,
          },
        }),
      );
    }

    // 10 students and 2 facilitators per cohort.
    const cohortStudents = students.slice(c * 10, c * 10 + 10);
    const cohortFacilitators = facilitators.slice(c * 2, c * 2 + 2);

    for (const student of cohortStudents) {
      await prisma.cohortMember.create({
        data: { userId: student.id, cohortId: cohort.id },
      });
    }

    // Split the 10 students evenly between the cohort's 2 facilitators.
    for (let s = 0; s < cohortStudents.length; s++) {
      const facilitator = cohortFacilitators[s < 5 ? 0 : 1];
      await prisma.mentorAssignment.create({
        data: {
          facilitatorId: facilitator.id,
          selfAssessorId: cohortStudents[s].id,
          cohortId: cohort.id,
        },
      });
    }

    // ── Periods ────────────────────────────────────────────────────────────
    const periods = [];
    for (let p = 0; p < config.completedPeriods; p++) {
      periods.push(
        await prisma.assessmentPeriod.create({
          data: {
            cohortId: cohort.id,
            name: `Cycle ${p + 1}`,
            startDate: new Date(`2025-0${p + 2}-01T00:00:00.000Z`),
            endDate: new Date(`2025-0${p + 2}-28T00:00:00.000Z`),
            status: 'closed',
          },
        }),
      );
    }
    // Current, open period.
    const openPeriod = await prisma.assessmentPeriod.create({
      data: {
        cohortId: cohort.id,
        name: `Cycle ${config.completedPeriods + 1} — Current`,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-06-30T00:00:00.000Z'),
        status: 'open',
      },
    });

    // ── Completed assessments with trajectories ─────────────────────────────
    for (let s = 0; s < cohortStudents.length; s++) {
      const student = cohortStudents[s];
      const trajectory = TRAJECTORY_CYCLE[s % TRAJECTORY_CYCLE.length];
      const previousAgreed = new Map<string, number>();

      for (let p = 0; p < periods.length; p++) {
        const scores = dimensions.map((dim, dimIndex) => {
          const agreed = scoreFor(
            trajectory,
            p,
            config.scoringScaleMax,
            dimIndex,
          );
          const recommended = isCoachingRecommended(
            agreed,
            config.scoringScaleMax,
            previousAgreed.get(dim.id),
          );
          if (recommended) flaggedDimensions++;
          previousAgreed.set(dim.id, agreed);
          return {
            dimensionId: dim.id,
            selfScore: clamp(agreed + 1, 1, config.scoringScaleMax),
            selfReflection: `Reflection on ${dim.name}`,
            mentorScore: agreed,
            mentorNote: recommended ? 'Needs focused support' : 'On track',
            agreedScore: agreed,
            coachingRecommended: recommended,
          };
        });

        await prisma.assessment.create({
          data: {
            studentId: student.id,
            periodId: periods[p].id,
            status: 'completed',
            submittedAt: periods[p].startDate,
            mentorSubmittedAt: periods[p].endDate,
            scores: { create: scores },
          },
        });
        createdAssessments++;
      }

      // Draft assessment for the open period (as period-open would generate).
      await prisma.assessment.create({
        data: {
          studentId: student.id,
          periodId: openPeriod.id,
          status: 'draft',
          scores: {
            create: dimensions.map((dim) => ({ dimensionId: dim.id })),
          },
        },
      });
      createdAssessments++;
    }
  }

  // ── Coaching sessions (demo facilitator) ─────────────────────────────────
  const demoFacilitator = facilitators[0];
  const demoStudent = students[0];
  const cohort0Dimensions = await prisma.dimension.findMany({
    where: { cohort: { name: COHORTS[0].name } },
    orderBy: { order: 'asc' },
    take: 2,
  });

  const individualSession = await prisma.coachingSession.create({
    data: {
      title: '1:1 Communication coaching',
      scope: 'individual',
      facilitatorId: demoFacilitator.id,
      scheduledAt: new Date('2026-06-15T09:00:00.000Z'),
      durationMinutes: 45,
      notes: 'Focus on presentation structure',
      participants: { create: [{ userId: demoStudent.id }] },
      targetDimensions: {
        create: cohort0Dimensions.map((d) => ({ dimensionId: d.id })),
      },
      actionItems: {
        create: [
          { description: 'Rehearse the opening two minutes' },
          { description: 'Record a practice talk', done: true },
        ],
      },
    },
  });

  const groupParticipants = students.slice(0, 5).map((s) => ({ userId: s.id }));
  await prisma.coachingSession.create({
    data: {
      title: 'Group workshop — Teamwork',
      scope: 'group',
      facilitatorId: demoFacilitator.id,
      scheduledAt: new Date('2026-06-20T13:00:00.000Z'),
      durationMinutes: 90,
      participants: { create: groupParticipants },
      targetDimensions: {
        create: cohort0Dimensions
          .slice(0, 1)
          .map((d) => ({ dimensionId: d.id })),
      },
    },
  });

  // ── Goals ────────────────────────────────────────────────────────────────
  await prisma.goal.create({
    data: {
      studentId: demoStudent.id,
      title: 'Improve public speaking',
      description: 'Present confidently to the whole cohort',
      targetDimensionId: cohort0Dimensions[0].id,
      dueDate: new Date('2026-09-01T00:00:00.000Z'),
      progressPercent: 35,
      milestones: [
        { title: 'Join debate club', done: true },
        { title: 'Give 3 short talks', done: false },
      ],
    },
  });
  for (let i = 1; i <= 4; i++) {
    await prisma.goal.create({
      data: {
        studentId: students[i].id,
        title: 'Strengthen weakest dimension',
        progressPercent: i * 15,
      },
    });
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      {
        userId: demoStudent.id,
        type: 'assessment_reminder',
        title: 'New assessment period open',
        body: 'Complete your self-assessment for the current cycle.',
      },
      {
        userId: demoStudent.id,
        type: 'coaching_reminder',
        title: 'Coaching session scheduled',
        body: 'You have a 1:1 communication coaching session.',
        readAt: new Date(),
      },
      {
        userId: demoFacilitator.id,
        type: 'submission',
        title: 'Self-assessment submitted',
        body: 'Student 01 submitted a self-assessment for your review.',
      },
      {
        userId: coordinator.id,
        type: 'system',
        title: 'Welcome to Journey Star',
        body: 'Your program workspace is ready.',
      },
    ],
  });

  // ── Achievements ──────────────────────────────────────────────────────────
  await prisma.achievement.createMany({
    data: [
      {
        studentId: demoStudent.id,
        key: 'first_assessment',
        title: 'Completed first assessment',
      },
      {
        studentId: demoStudent.id,
        key: 'goal_setter',
        title: 'Set a personal growth goal',
      },
      {
        studentId: students[1].id,
        key: 'first_assessment',
        title: 'Completed first assessment',
      },
    ],
  });

  console.log('Seed completed:');
  console.log(
    `  users: 1 coordinator, ${facilitators.length} facilitators, ${students.length} students`,
  );
  console.log(`  cohorts: ${COHORTS.length} (scales 5 & 10)`);
  console.log(
    `  assessments: ${createdAssessments} (coaching flags: ${flaggedDimensions})`,
  );
  console.log(`  coaching sessions incl. ${individualSession.title}`);
  console.log('Demo login (password Password123!):');
  console.log('  coordinator@pnc.edu | facilitator@pnc.edu | student@pnc.edu');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
