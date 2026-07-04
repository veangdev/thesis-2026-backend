import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AnalyticsRepository } from './analytics.repository';
import { CohortsService } from '../cohorts/cohorts.service';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import {
  average,
  classifyZone,
  delta,
  isAtRisk,
  round2,
  Zone,
} from './analytics-logic';
import type {
  AssessmentForCohort,
  AssessmentForStudent,
} from './analytics.repository';

interface DimensionScore {
  dimensionId: string;
  dimensionName: string;
  agreedScore: number;
}
interface PeriodRadar {
  periodId: string;
  periodName: string;
  average: number;
  scores: DimensionScore[];
}
interface TrendPoint {
  periodId: string;
  periodName: string;
  agreedScore: number;
  delta: number | null;
}
interface DimensionTrend {
  dimensionId: string;
  dimensionName: string;
  points: TrendPoint[];
}
interface ZoneEntry {
  dimensionId: string;
  dimensionName: string;
  agreedScore: number;
  zone: Zone;
}
interface GapEntry {
  dimensionId: string;
  dimensionName: string;
  selfScore: number | null;
  mentorScore: number | null;
  agreedScore: number | null;
  selfMentorGap: number | null;
}

export interface StudentAnalytics {
  studentId: string;
  scaleMax: number;
  periods: PeriodRadar[];
  trends: DimensionTrend[];
  latest: {
    periodId: string;
    periodName: string;
    overallAverage: number;
    zones: ZoneEntry[];
    gaps: GapEntry[];
  } | null;
}

export interface CohortAnalytics {
  cohortId: string;
  scaleMax: number;
  weakestDimensions: {
    dimensionId: string;
    dimensionName: string;
    average: number;
  }[];
  completionRates: {
    periodId: string;
    periodName: string;
    total: number;
    completed: number;
    rate: number;
  }[];
  heatmap: {
    studentId: string;
    studentName: string;
    scores: { dimensionId: string; agreedScore: number | null }[];
  }[];
  atRiskStudents: {
    studentId: string;
    studentName: string;
    latestAverage: number;
    coachingFlags: number;
  }[];
}

export interface OverviewAnalytics {
  kpis: {
    totalUsers: number;
    usersByRole: Record<string, number>;
    totalCohorts: number;
    openPeriods: number;
    completedAssessments: number;
  };
  mentorWorkload: {
    facilitatorId: string;
    name: string;
    assignedStudents: number;
    completedReviews: number;
  }[];
}

export interface GapAnalytics {
  assessmentId: string;
  periodName: string;
  studentId: string;
  dimensions: GapEntry[];
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly cohortsService: CohortsService,
    private readonly usersService: UsersService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  // ─────────────────────────── Student ───────────────────────────

  async student(
    studentId: string,
    requester: AuthenticatedUser,
  ): Promise<StudentAnalytics> {
    await this.usersService.findOne(studentId);
    await this.assertStudentAccess(studentId, requester);

    const assessments =
      await this.analyticsRepository.completedForStudent(studentId);

    if (assessments.length === 0) {
      return { studentId, scaleMax: 0, periods: [], trends: [], latest: null };
    }

    const scaleMax = await this.scaleMaxFor(assessments[0].period.cohortId);

    const periods: PeriodRadar[] = assessments.map((a) => {
      const scores = this.agreedScores(a);
      return {
        periodId: a.periodId,
        periodName: a.period.name,
        average: average(scores.map((s) => s.agreedScore)),
        scores,
      };
    });

    const trends = this.buildTrends(assessments);
    const latest = this.buildLatest(
      assessments[assessments.length - 1],
      scaleMax,
    );

    return { studentId, scaleMax, periods, trends, latest };
  }

  // ─────────────────────────── Cohort ───────────────────────────

  async cohort(cohortId: string): Promise<CohortAnalytics> {
    const cohort = await this.cohortsService.findOne(cohortId);
    const scaleMax = cohort.scoringScaleMax;

    const [dimensions, periods, avgByDimension, periodStatusCounts, completed] =
      await Promise.all([
        this.analyticsRepository.dimensionsForCohort(cohortId),
        this.analyticsRepository.periodsForCohort(cohortId),
        this.analyticsRepository.avgAgreedByCohortDimension(cohortId),
        this.analyticsRepository.countsByPeriodStatus(cohortId),
        this.analyticsRepository.completedForCohort(cohortId),
      ]);

    const dimensionNames = new Map(dimensions.map((d) => [d.id, d.name]));

    return {
      cohortId,
      scaleMax,
      weakestDimensions: avgByDimension
        .map((row) => ({
          dimensionId: row.dimensionId,
          dimensionName: dimensionNames.get(row.dimensionId) ?? row.dimensionId,
          average: round2(row._avg.agreedScore ?? 0),
        }))
        .sort((x, y) => x.average - y.average),
      completionRates: this.completionRates(periodStatusCounts, periods),
      heatmap: this.heatmap(completed, dimensions),
      atRiskStudents: this.atRiskStudents(completed, scaleMax),
    };
  }

  // ─────────────────────────── Overview ───────────────────────────

  async overview(): Promise<OverviewAnalytics> {
    const [byRole, totalCohorts, byStatus, completedAssessments, facilitators] =
      await Promise.all([
        this.analyticsRepository.usersByRole(),
        this.analyticsRepository.totalCohorts(),
        this.analyticsRepository.periodsByStatus(),
        this.analyticsRepository.completedAssessmentCount(),
        this.analyticsRepository.facilitators(),
      ]);

    const usersByRole: Record<string, number> = {};
    let totalUsers = 0;
    for (const row of byRole) {
      usersByRole[row.role] = row._count._all;
      totalUsers += row._count._all;
    }
    const openPeriods =
      byStatus.find((s) => s.status === 'open')?._count._all ?? 0;

    const mentorWorkload = await Promise.all(
      facilitators.map(async (f) => {
        const studentIds =
          await this.assignmentsService.studentIdsForFacilitator(f.id);
        const completedReviews =
          await this.analyticsRepository.countCompletedForStudents(studentIds);
        return {
          facilitatorId: f.id,
          name: f.name,
          assignedStudents: studentIds.length,
          completedReviews,
        };
      }),
    );

    return {
      kpis: {
        totalUsers,
        usersByRole,
        totalCohorts,
        openPeriods,
        completedAssessments,
      },
      mentorWorkload,
    };
  }

  // ─────────────────────────── Gap (self vs mentor) ───────────────────────────

  async gap(
    assessmentId: string,
    requester: AuthenticatedUser,
  ): Promise<GapAnalytics> {
    const assessment =
      await this.analyticsRepository.findAssessment(assessmentId);
    if (!assessment) {
      throw new NotFoundException(`Assessment ${assessmentId} not found`);
    }
    await this.assertStudentAccess(assessment.studentId, requester);

    return {
      assessmentId,
      periodName: assessment.period.name,
      studentId: assessment.studentId,
      dimensions: this.gapEntries(assessment),
    };
  }

  // ─────────────────────────── Helpers ───────────────────────────

  private agreedScores(a: AssessmentForStudent): DimensionScore[] {
    return a.scores
      .filter((s) => s.agreedScore !== null)
      .sort((x, y) => x.dimension.order - y.dimension.order)
      .map((s) => ({
        dimensionId: s.dimensionId,
        dimensionName: s.dimension.name,
        agreedScore: s.agreedScore as number,
      }));
  }

  private buildTrends(assessments: AssessmentForStudent[]): DimensionTrend[] {
    const trends = new Map<string, DimensionTrend>();
    for (const a of assessments) {
      for (const s of a.scores) {
        if (s.agreedScore === null) continue;
        let trend = trends.get(s.dimensionId);
        if (!trend) {
          trend = {
            dimensionId: s.dimensionId,
            dimensionName: s.dimension.name,
            points: [],
          };
          trends.set(s.dimensionId, trend);
        }
        const previous = trend.points[trend.points.length - 1]?.agreedScore;
        trend.points.push({
          periodId: a.periodId,
          periodName: a.period.name,
          agreedScore: s.agreedScore,
          delta: delta(s.agreedScore, previous),
        });
      }
    }
    return [...trends.values()];
  }

  private buildLatest(
    a: AssessmentForStudent,
    scaleMax: number,
  ): StudentAnalytics['latest'] {
    const agreed = this.agreedScores(a);
    return {
      periodId: a.periodId,
      periodName: a.period.name,
      overallAverage: average(agreed.map((s) => s.agreedScore)),
      zones: agreed.map((s) => ({
        dimensionId: s.dimensionId,
        dimensionName: s.dimensionName,
        agreedScore: s.agreedScore,
        zone: classifyZone(s.agreedScore, scaleMax),
      })),
      gaps: this.gapEntries(a),
    };
  }

  private gapEntries(a: {
    scores: AssessmentForStudent['scores'];
  }): GapEntry[] {
    return a.scores
      .slice()
      .sort((x, y) => x.dimension.order - y.dimension.order)
      .map((s) => ({
        dimensionId: s.dimensionId,
        dimensionName: s.dimension.name,
        selfScore: s.selfScore,
        mentorScore: s.mentorScore,
        agreedScore: s.agreedScore,
        selfMentorGap:
          s.mentorScore !== null && s.selfScore !== null
            ? s.mentorScore - s.selfScore
            : null,
      }));
  }

  private completionRates(
    counts: Array<{
      periodId: string;
      status: string;
      _count: { _all: number };
    }>,
    periods: Array<{ id: string; name: string }>,
  ): CohortAnalytics['completionRates'] {
    const names = new Map(periods.map((p) => [p.id, p.name]));
    const byPeriod = new Map<string, { total: number; completed: number }>();
    for (const row of counts) {
      const entry = byPeriod.get(row.periodId) ?? { total: 0, completed: 0 };
      entry.total += row._count._all;
      if (row.status === 'completed') entry.completed += row._count._all;
      byPeriod.set(row.periodId, entry);
    }
    return [...byPeriod.entries()].map(([periodId, e]) => ({
      periodId,
      periodName: names.get(periodId) ?? periodId,
      total: e.total,
      completed: e.completed,
      rate: e.total > 0 ? round2(e.completed / e.total) : 0,
    }));
  }

  /** Each student's most recent completed assessment (input is completed-only). */
  private latestCompletedByStudent(
    assessments: AssessmentForCohort[],
  ): Map<string, AssessmentForCohort> {
    const latest = new Map<string, AssessmentForCohort>();
    for (const a of assessments) {
      // assessments arrive ordered by period.startDate asc, so the last wins.
      latest.set(a.studentId, a);
    }
    return latest;
  }

  private heatmap(
    assessments: AssessmentForCohort[],
    dimensions: Array<{ id: string }>,
  ): CohortAnalytics['heatmap'] {
    const dimensionIds = dimensions.map((d) => d.id);
    const latest = this.latestCompletedByStudent(assessments);
    return [...latest.values()].map((a) => {
      const scoreByDim = new Map(
        a.scores.map((s) => [s.dimensionId, s.agreedScore]),
      );
      return {
        studentId: a.studentId,
        studentName: a.student.name,
        scores: dimensionIds.map((dimensionId) => ({
          dimensionId,
          agreedScore: scoreByDim.get(dimensionId) ?? null,
        })),
      };
    });
  }

  private atRiskStudents(
    assessments: AssessmentForCohort[],
    scaleMax: number,
  ): CohortAnalytics['atRiskStudents'] {
    const latest = this.latestCompletedByStudent(assessments);
    const atRisk: CohortAnalytics['atRiskStudents'] = [];
    for (const a of latest.values()) {
      const agreed = a.scores
        .filter((s) => s.agreedScore !== null)
        .map((s) => s.agreedScore as number);
      const latestAverage = average(agreed);
      const coachingFlags = a.scores.filter(
        (s) => s.coachingRecommended,
      ).length;
      if (isAtRisk(latestAverage, scaleMax, coachingFlags)) {
        atRisk.push({
          studentId: a.studentId,
          studentName: a.student.name,
          latestAverage,
          coachingFlags,
        });
      }
    }
    return atRisk.sort((x, y) => x.latestAverage - y.latestAverage);
  }

  private async scaleMaxFor(cohortId: string): Promise<number> {
    const cohort = await this.cohortsService.findOne(cohortId);
    return cohort.scoringScaleMax;
  }

  private async assertStudentAccess(
    studentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (user.role === Role.program_coordinator) return;
    if (user.role === Role.self_assessor) {
      if (studentId === user.id) return;
      throw new ForbiddenException('Cannot access another student’s analytics');
    }
    const assigned = await this.assignmentsService.isAssigned(
      user.id,
      studentId,
    );
    if (!assigned)
      throw new ForbiddenException('Student is not assigned to you');
  }
}
