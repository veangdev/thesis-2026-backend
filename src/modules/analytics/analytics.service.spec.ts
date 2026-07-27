import { Test } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRepository } from './analytics.repository';
import { CohortsService } from '../cohorts/cohorts.service';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';

/**
 * Covers the aggregation the coordinator dashboard depends on: the KPIs that
 * used to be derived by the frontend fanning out one request per cohort, and
 * the cohort fields that used to be defaulted in the frontend adapter.
 */
describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const repo = {
    completedForStudent: jest.fn(),
    allForStudent: jest.fn(),
    completedForCohort: jest.fn(),
    avgAgreedByCohortDimension: jest.fn(),
    countsByPeriodStatus: jest.fn(),
    dimensionsForCohort: jest.fn(),
    periodsForCohort: jest.fn(),
    findAssessment: jest.fn(),
    usersByRole: jest.fn(),
    totalCohorts: jest.fn(),
    activeCohorts: jest.fn(),
    periodsByStatus: jest.fn(),
    completedAssessmentCount: jest.fn(),
    facilitators: jest.fn(),
    completedWithScale: jest.fn(),
    countsByStatusForOpenPeriods: jest.fn(),
    countsByStudentAndStatus: jest.fn(),
    activeAssignments: jest.fn(),
    submissionTimestampsSince: jest.fn(),
    recentAssessments: jest.fn(),
    recentCoachingSessions: jest.fn(),
    recentGoals: jest.fn(),
    recentUsers: jest.fn(),
  };
  const cohorts = { findRaw: jest.fn() };
  const users = { findOne: jest.fn() };
  const assignments = { isAssigned: jest.fn() };

  const coordinator: AuthenticatedUser = {
    id: 'coordinator-1',
    role: Role.program_coordinator,
  } as AuthenticatedUser;

  /** An assessment score row as the repository include shapes it. */
  const score = (
    dimensionId: string,
    order: number,
    values: {
      selfScore?: number | null;
      mentorScore?: number | null;
      agreedScore?: number | null;
      mentorNote?: string | null;
      coachingRecommended?: boolean;
    } = {},
  ) => ({
    dimensionId,
    selfScore: values.selfScore ?? null,
    mentorScore: values.mentorScore ?? null,
    agreedScore: values.agreedScore ?? null,
    mentorNote: values.mentorNote ?? null,
    coachingRecommended: values.coachingRecommended ?? false,
    dimension: { name: dimensionId.toUpperCase(), order },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: AnalyticsRepository, useValue: repo },
        { provide: CohortsService, useValue: cohorts },
        { provide: UsersService, useValue: users },
        { provide: AssignmentsService, useValue: assignments },
      ],
    }).compile();
    service = moduleRef.get(AnalyticsService);

    // Defaults for the wide `overview` fan-out; individual tests override.
    repo.usersByRole.mockResolvedValue([]);
    repo.totalCohorts.mockResolvedValue(0);
    repo.activeCohorts.mockResolvedValue(0);
    repo.periodsByStatus.mockResolvedValue([]);
    repo.completedAssessmentCount.mockResolvedValue(0);
    repo.facilitators.mockResolvedValue([]);
    repo.activeAssignments.mockResolvedValue([]);
    repo.countsByStatusForOpenPeriods.mockResolvedValue([]);
    repo.countsByStudentAndStatus.mockResolvedValue([]);
    repo.completedWithScale.mockResolvedValue([]);
    repo.submissionTimestampsSince.mockResolvedValue([]);
    repo.recentAssessments.mockResolvedValue([]);
    repo.recentCoachingSessions.mockResolvedValue([]);
    repo.recentGoals.mockResolvedValue([]);
    repo.recentUsers.mockResolvedValue([]);
  });

  describe('overview', () => {
    it('counts active cohorts separately from the total', async () => {
      repo.totalCohorts.mockResolvedValue(7);
      repo.activeCohorts.mockResolvedValue(3);

      const result = await service.overview();

      expect(result.kpis.totalCohorts).toBe(7);
      expect(result.kpis.activeCohorts).toBe(3);
    });

    it('reports completion of the open cycle as a whole percentage', async () => {
      repo.countsByStatusForOpenPeriods.mockResolvedValue([
        { status: 'completed', _count: { _all: 3 } },
        { status: 'draft', _count: { _all: 5 } },
        { status: 'self_submitted', _count: { _all: 2 } },
      ]);

      const result = await service.overview();

      expect(result.kpis.completionRate).toBe(30);
    });

    it('is 0% rather than NaN when no cycle is open', async () => {
      const result = await service.overview();
      expect(result.kpis.completionRate).toBe(0);
    });

    it('scores at-risk against each student’s own cohort scale', async () => {
      repo.completedWithScale.mockResolvedValue([
        {
          studentId: 'low-on-a-ten-scale',
          scores: [score('d1', 1, { agreedScore: 4 })],
          period: { cohort: { scoringScaleMax: 10 } },
        },
        {
          studentId: 'same-number-on-a-five-scale',
          scores: [score('d1', 1, { agreedScore: 4 })],
          period: { cohort: { scoringScaleMax: 5 } },
        },
      ]);

      const result = await service.overview();

      // 4/10 is in the needs-support band; 4/5 is not.
      expect(result.kpis.atRiskCount).toBe(1);
    });

    it('counts each student once, using their latest completed cycle', async () => {
      repo.completedWithScale.mockResolvedValue([
        {
          studentId: 'student-1',
          scores: [score('d1', 1, { agreedScore: 1 })],
          period: { cohort: { scoringScaleMax: 5 } },
        },
        {
          // Ordered oldest first, so this recovery is the one that counts.
          studentId: 'student-1',
          scores: [score('d1', 1, { agreedScore: 5 })],
          period: { cohort: { scoringScaleMax: 5 } },
        },
      ]);

      const result = await service.overview();

      expect(result.kpis.atRiskCount).toBe(0);
    });

    it('splits facilitator workload into completed and pending reviews', async () => {
      repo.facilitators.mockResolvedValue([{ id: 'f1', name: 'Dara' }]);
      repo.activeAssignments.mockResolvedValue([
        { facilitatorId: 'f1', selfAssessorId: 's1' },
        { facilitatorId: 'f1', selfAssessorId: 's2' },
      ]);
      repo.countsByStudentAndStatus.mockResolvedValue([
        { studentId: 's1', status: 'completed', _count: { _all: 2 } },
        { studentId: 's1', status: 'self_submitted', _count: { _all: 1 } },
        { studentId: 's2', status: 'mentor_review', _count: { _all: 3 } },
        { studentId: 's2', status: 'draft', _count: { _all: 9 } },
      ]);

      const result = await service.overview();

      expect(result.mentorWorkload).toEqual([
        {
          facilitatorId: 'f1',
          name: 'Dara',
          assignedStudents: 2,
          completedReviews: 2,
          pendingReviews: 4,
        },
      ]);
    });

    it('reports zero workload for a facilitator with no roster', async () => {
      repo.facilitators.mockResolvedValue([{ id: 'f1', name: 'Dara' }]);

      const result = await service.overview();

      expect(result.mentorWorkload[0]).toMatchObject({
        assignedStudents: 0,
        completedReviews: 0,
        pendingReviews: 0,
      });
    });

    it('merges the activity feed by recency across sources', async () => {
      repo.recentAssessments.mockResolvedValue([
        {
          id: 'a1',
          status: 'completed',
          updatedAt: new Date('2026-07-20T00:00:00.000Z'),
          student: { name: 'Sokha' },
          period: { name: 'Cycle 2' },
        },
      ]);
      repo.recentGoals.mockResolvedValue([
        {
          id: 'g1',
          title: 'Speak up in class',
          createdAt: new Date('2026-07-25T00:00:00.000Z'),
          student: { name: 'Vanna' },
        },
      ]);

      const result = await service.overview();

      expect(result.activityFeed.map((entry) => entry.category)).toEqual([
        'goal',
        'assessment',
      ]);
      expect(result.activityFeed[1].message).toBe('Sokha completed Cycle 2');
    });
  });

  describe('cohort', () => {
    beforeEach(() => {
      cohorts.findRaw.mockResolvedValue({
        id: 'c1',
        name: 'Batch 2026',
        scoringScaleMax: 5,
      });
      repo.dimensionsForCohort.mockResolvedValue([
        { id: 'd1', name: 'D1', order: 1 },
        { id: 'd2', name: 'D2', order: 2 },
      ]);
      repo.periodsForCohort.mockResolvedValue([
        { id: 'p1', name: 'Cycle 1', status: 'completed' },
        { id: 'p2', name: 'Cycle 2', status: 'active' },
      ]);
      repo.avgAgreedByCohortDimension.mockResolvedValue([]);
      repo.countsByPeriodStatus.mockResolvedValue([]);
      repo.completedForCohort.mockResolvedValue([]);
    });

    it('returns the cohort name so the client need not fetch it separately', async () => {
      const result = await service.cohort('c1');
      expect(result.cohortName).toBe('Batch 2026');
    });

    it('reports an unscored dimension as null, never 0', async () => {
      repo.avgAgreedByCohortDimension.mockResolvedValue([
        { dimensionId: 'd2', _avg: { agreedScore: 4.5 } },
      ]);

      const result = await service.cohort('c1');

      expect(result.dimensionAverages).toEqual([
        { dimensionId: 'd2', dimensionName: 'D2', average: 4.5 },
        { dimensionId: 'd1', dimensionName: 'D1', average: null },
      ]);
      // An unscored dimension must not masquerade as the weakest.
      expect(result.weakestDimensions).toEqual([
        { dimensionId: 'd2', dimensionName: 'D2', average: 4.5 },
      ]);
    });

    it('measures participation against the active period only', async () => {
      repo.countsByPeriodStatus.mockResolvedValue([
        // Completed cycle — fully completed, must not inflate the number.
        { periodId: 'p1', status: 'completed', _count: { _all: 10 } },
        { periodId: 'p2', status: 'draft', _count: { _all: 3 } },
        { periodId: 'p2', status: 'self_submitted', _count: { _all: 1 } },
      ]);

      const result = await service.cohort('c1');

      expect(result.participationRate).toBe(25);
    });

    it('is 0% when no period is active', async () => {
      repo.periodsForCohort.mockResolvedValue([
        { id: 'p1', name: 'Cycle 1', status: 'completed' },
      ]);
      repo.countsByPeriodStatus.mockResolvedValue([
        { periodId: 'p1', status: 'completed', _count: { _all: 4 } },
      ]);

      const result = await service.cohort('c1');

      expect(result.participationRate).toBe(0);
    });

    it('keeps completion rates and the trendline in period order', async () => {
      repo.completedForCohort.mockResolvedValue([
        {
          studentId: 's1',
          periodId: 'p2',
          scores: [score('d1', 1, { agreedScore: 4 })],
          student: { name: 'Sokha' },
        },
        {
          studentId: 's1',
          periodId: 'p1',
          scores: [score('d1', 1, { agreedScore: 2 })],
          student: { name: 'Sokha' },
        },
      ]);

      const result = await service.cohort('c1');

      expect(result.completionRates.map((row) => row.periodId)).toEqual([
        'p1',
        'p2',
      ]);
      expect(result.trendline).toEqual([
        { periodId: 'p1', periodName: 'Cycle 1', average: 2 },
        { periodId: 'p2', periodName: 'Cycle 2', average: 4 },
      ]);
    });

    it('gives every heatmap row a real trend and average', async () => {
      repo.completedForCohort.mockResolvedValue([
        {
          studentId: 's1',
          periodId: 'p1',
          scores: [score('d1', 1, { agreedScore: 2 })],
          student: { name: 'Sokha' },
        },
        {
          studentId: 's1',
          periodId: 'p2',
          scores: [
            score('d1', 1, { agreedScore: 4 }),
            score('d2', 2, { agreedScore: 5 }),
          ],
          student: { name: 'Sokha' },
        },
      ]);

      const result = await service.cohort('c1');

      expect(result.heatmap).toHaveLength(1);
      expect(result.heatmap[0]).toMatchObject({
        studentId: 's1',
        trend: 'improving',
        average: 4.5,
      });
    });
  });

  describe('student', () => {
    it('returns an empty shell for a student with no cohort', async () => {
      users.findOne.mockResolvedValue({
        id: 's1',
        name: 'Sokha',
        cohortId: null,
      });

      const result = await service.student('s1', coordinator);

      expect(result).toMatchObject({
        cohortId: '',
        scaleMax: 0,
        trend: 'stagnant',
        periods: [],
        latest: null,
      });
    });

    it('covers every cohort period, marking unfinished cycles ungraded', async () => {
      users.findOne.mockResolvedValue({
        id: 's1',
        name: 'Sokha',
        cohortId: 'c1',
      });
      cohorts.findRaw.mockResolvedValue({ id: 'c1', scoringScaleMax: 5 });
      repo.periodsForCohort.mockResolvedValue([
        { id: 'p1', name: 'Cycle 1', status: 'completed' },
        { id: 'p2', name: 'Cycle 2', status: 'active' },
        { id: 'p3', name: 'Cycle 3', status: 'upcoming' },
      ]);
      repo.allForStudent.mockResolvedValue([
        {
          periodId: 'p1',
          status: 'completed',
          period: { name: 'Cycle 1' },
          scores: [
            score('d1', 1, { selfScore: 3, mentorScore: 4, agreedScore: 4 }),
          ],
        },
        {
          // In progress — self-rated but not yet completed.
          periodId: 'p2',
          status: 'self_submitted',
          period: { name: 'Cycle 2' },
          scores: [score('d1', 1, { selfScore: 5 })],
        },
      ]);
      repo.completedForStudent.mockResolvedValue([]);

      const result = await service.student('s1', coordinator);

      expect(result.cohortId).toBe('c1');
      expect(result.scaleMax).toBe(5);
      expect(result.periods.map((p) => p.average)).toEqual([4, null, null]);
      // Self and mentor scores are present on the historical cycle, not just
      // the most recent one.
      expect(result.periods[0].scores[0]).toEqual({
        dimensionId: 'd1',
        dimensionName: 'D1',
        selfScore: 3,
        mentorScore: 4,
        agreedScore: 4,
      });
      expect(result.periods[1].scores[0].selfScore).toBe(5);
    });
  });

  describe('gap', () => {
    it('carries the facilitator note beside the numbers', async () => {
      repo.findAssessment.mockResolvedValue({
        studentId: 's1',
        student: { name: 'Sokha' },
        period: { name: 'Cycle 1', cohortId: 'c1' },
        scores: [
          score('d1', 1, {
            selfScore: 5,
            mentorScore: 3,
            mentorNote: 'Strong start, keep evidencing it.',
          }),
        ],
      });
      cohorts.findRaw.mockResolvedValue({ id: 'c1', scoringScaleMax: 5 });

      const result = await service.gap('a1', coordinator);

      expect(result.dimensions[0]).toMatchObject({
        selfMentorGap: -2,
        mentorNote: 'Strong start, keep evidencing it.',
      });
    });
  });
});
