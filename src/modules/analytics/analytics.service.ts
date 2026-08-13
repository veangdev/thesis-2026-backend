import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AnalyticsRepository } from './analytics.repository';
import { CohortsService } from '../cohorts/cohorts.service';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { AssessmentStatus, Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
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
  Trend,
  WeekBucket,
  Zone,
} from './analytics-logic';
import type {
  AssessmentForCohort,
  AssessmentForStudent,
  AssessmentWithScale,
  CohortPeriod,
  RecentAssessmentRow,
  RecentCoachingRow,
  RecentGoalRow,
  RecentUserRow,
} from './analytics.repository';

/** Trailing window and page size for the coordinator activity widgets. */
const ACTIVITY_WEEKS = 6;
const ACTIVITY_FEED_SIZE = 8;

/** Scale quoted publicly when no active cohort exists to read one from. */
const DEFAULT_SCALE_MAX = 5;

/** A `groupBy(periodId, status)` row from the assessments table. */
interface PeriodStatusCount {
  periodId: string;
  status: AssessmentStatus;
  _count: { _all: number };
}

interface PeriodTally {
  total: number;
  completed: number;
  /** Anything past `draft` — the student has engaged with the cycle. */
  started: number;
}

// ── Activity feed row → feed entry ───────────────────────────────────────────

function assessmentActivity(row: RecentAssessmentRow): ActivityFeedEntry {
  const verb =
    row.status === 'completed'
      ? `completed ${row.period.name}`
      : `submitted a self-assessment (${row.period.name})`;
  return {
    id: `assessment-${row.id}`,
    message: `${row.student.name} ${verb}`,
    timestamp: row.updatedAt.toISOString(),
    category: 'assessment',
  };
}

function coachingActivity(row: RecentCoachingRow): ActivityFeedEntry {
  return {
    id: `coaching-${row.id}`,
    message: `${row.facilitator.name} scheduled “${row.title}”`,
    timestamp: row.createdAt.toISOString(),
    category: 'coaching',
  };
}

function goalActivity(row: RecentGoalRow): ActivityFeedEntry {
  return {
    id: `goal-${row.id}`,
    message: `${row.student.name} set the goal “${row.title}”`,
    timestamp: row.createdAt.toISOString(),
    category: 'goal',
  };
}

function userActivity(row: RecentUserRow): ActivityFeedEntry {
  return {
    id: `user-${row.id}`,
    message: `${row.name} joined as ${row.role.replace(/_/g, ' ')}`,
    timestamp: row.createdAt.toISOString(),
    category: 'user',
  };
}

interface DimensionScore {
  dimensionId: string;
  dimensionName: string;
  agreedScore: number;
}
/**
 * One cycle on the student radar. Covers every period in the cohort, so a
 * period the student has not finished yet appears with `average: null` rather
 * than being missing — that is what makes "2 of 4 cycles" readable.
 */
interface PeriodRadar {
  periodId: string;
  periodName: string;
  average: number | null;
  scores: PeriodDimensionScore[];
}
/** Self / mentor / agreed side by side, for every cycle rather than the last. */
interface PeriodDimensionScore {
  dimensionId: string;
  dimensionName: string;
  selfScore: number | null;
  mentorScore: number | null;
  agreedScore: number | null;
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
  mentorNote: string | null;
}

export interface DimensionAverage {
  dimensionId: string;
  dimensionName: string;
  /** `null` when nobody has been scored on this dimension yet. */
  average: number | null;
}

export interface StudentAnalytics {
  studentId: string;
  studentName: string;
  /** Empty string when the student is not enrolled in a cohort. */
  cohortId: string;
  scaleMax: number;
  /** Direction of travel across the student's last two graded cycles. */
  trend: Trend;
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
  cohortName: string;
  scaleMax: number;
  /** Percentage of assessments in the cohort's open periods already started. */
  participationRate: number;
  /** Every dimension in the cohort, weakest first; unscored ones are `null`. */
  dimensionAverages: DimensionAverage[];
  /** The three lowest-scoring dimensions that actually have data. */
  weakestDimensions: DimensionAverage[];
  completionRates: {
    periodId: string;
    periodName: string;
    total: number;
    completed: number;
    rate: number;
  }[];
  /** Cohort-wide average per period, chronological — the growth line. */
  trendline: {
    periodId: string;
    periodName: string;
    average: number | null;
  }[];
  heatmap: {
    studentId: string;
    studentName: string;
    trend: Trend;
    average: number | null;
    scores: { dimensionId: string; agreedScore: number | null }[];
  }[];
  atRiskStudents: {
    studentId: string;
    studentName: string;
    latestAverage: number;
    coachingFlags: number;
  }[];
}

export interface ActivityFeedEntry {
  id: string;
  message: string;
  /** ISO-8601. */
  timestamp: string;
  category: 'assessment' | 'coaching' | 'goal' | 'user';
}

/**
 * Aggregate programme facts for the public landing page — the only analytics
 * readable without a token.
 *
 * Deliberately counts and names only: no person, cohort roster, or score is
 * exposed, because this is served unauthenticated. Everything here was
 * previously hard-coded in the marketing components, where "8 dimensions"
 * contradicted the fact that dimensions are configured per cohort.
 */
export interface PublicProgrammeSummary {
  /** Active self-assessors currently on the programme. */
  selfAssessorCount: number;
  activeCohortCount: number;
  completedAssessmentCount: number;
  /** Roles the product supports — derived from the enum, not a literal. */
  roleCount: number;
  /** Scoring scale bounds across active cohorts (`1..scaleMax`). */
  scaleMin: number;
  scaleMax: number;
  /** Dimensions of the current cohort, in display order. */
  dimensions: { name: string; description: string | null }[];
}

export interface OverviewAnalytics {
  kpis: {
    totalUsers: number;
    usersByRole: Record<string, number>;
    totalCohorts: number;
    activeCohorts: number;
    openPeriods: number;
    completedAssessments: number;
    /** Percentage of assessments in open periods that are completed. */
    completionRate: number;
    /** Distinct self-assessors flagged at risk in any cohort. */
    atRiskCount: number;
  };
  mentorWorkload: {
    facilitatorId: string;
    name: string;
    assignedStudents: number;
    completedReviews: number;
    /** Submitted assessments still waiting on this facilitator. */
    pendingReviews: number;
  }[];
  activityFeed: ActivityFeedEntry[];
  /** Self-assessment submissions per week, most recent last. */
  activityTrend: WeekBucket[];
}

export interface GapAnalytics {
  assessmentId: string;
  periodName: string;
  studentId: string;
  studentName: string;
  scaleMax: number;
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
    const student = await this.usersService.findOne(studentId);
    await this.assertStudentAccess(studentId, requester);

    const cohortId = student.cohortId;
    if (!cohortId) {
      // Not enrolled yet — a normal state for a freshly created account.
      return {
        studentId,
        studentName: student.name,
        cohortId: '',
        scaleMax: 0,
        trend: 'stagnant',
        periods: [],
        trends: [],
        latest: null,
      };
    }

    const [cohort, cohortPeriods, all, completed] = await Promise.all([
      this.cohortsService.findRaw(cohortId),
      this.analyticsRepository.periodsForCohort(cohortId),
      this.analyticsRepository.allForStudent(studentId),
      this.analyticsRepository.completedForStudent(studentId),
    ]);
    const scaleMax = cohort.scoringScaleMax;

    const byPeriod = new Map(all.map((a) => [a.periodId, a]));
    const periods: PeriodRadar[] = cohortPeriods.map((period) => {
      const assessment = byPeriod.get(period.id);
      const scores = assessment ? this.periodScores(assessment) : [];
      return {
        periodId: period.id,
        periodName: period.name,
        // A cycle counts as graded only once it is complete — that is what the
        // journey-progress bar and the growth line both read.
        average:
          assessment?.status === 'completed'
            ? averageOrNull(
                scores
                  .map((s) => s.agreedScore)
                  .filter((value): value is number => value !== null),
              )
            : null,
        scores,
      };
    });

    const latest =
      completed.length > 0
        ? this.buildLatest(completed[completed.length - 1], scaleMax)
        : null;

    return {
      studentId,
      studentName: student.name,
      cohortId,
      scaleMax,
      trend: classifyTrend(periods.map((p) => p.average)),
      periods,
      trends: this.buildTrends(completed),
      latest,
    };
  }

  // ─────────────────────────── Cohort ───────────────────────────

  async cohort(cohortId: string): Promise<CohortAnalytics> {
    const cohort = await this.cohortsService.findRaw(cohortId);
    const scaleMax = cohort.scoringScaleMax;

    const [dimensions, periods, avgByDimension, periodStatusCounts, completed] =
      await Promise.all([
        this.analyticsRepository.dimensionsForCohort(cohortId),
        this.analyticsRepository.periodsForCohort(cohortId),
        this.analyticsRepository.avgAgreedByCohortDimension(cohortId),
        this.analyticsRepository.countsByPeriodStatus(cohortId),
        this.analyticsRepository.completedForCohort(cohortId),
      ]);

    const averageByDimension = new Map(
      avgByDimension.map((row) => [row.dimensionId, row._avg.agreedScore]),
    );
    // Every dimension in the cohort, not only those that happen to be scored —
    // an unscored dimension is `null`, never 0, so it cannot fake "weakest".
    const dimensionAverages: DimensionAverage[] = dimensions
      .map((d) => {
        const raw = averageByDimension.get(d.id);
        return {
          dimensionId: d.id,
          dimensionName: d.name,
          average: raw === undefined || raw === null ? null : round2(raw),
        };
      })
      .sort((x, y) => (x.average ?? Infinity) - (y.average ?? Infinity));

    const completionRates = this.completionRates(periodStatusCounts, periods);

    return {
      cohortId,
      cohortName: cohort.name,
      scaleMax,
      participationRate: this.participationRate(periodStatusCounts, periods),
      dimensionAverages,
      weakestDimensions: dimensionAverages
        .filter((d) => d.average !== null)
        .slice(0, 3),
      completionRates,
      trendline: this.trendline(completed, periods),
      heatmap: this.heatmap(completed, dimensions),
      atRiskStudents: this.atRiskStudents(completed, scaleMax),
    };
  }

  // ─────────────────────────── Public summary ───────────────────────────

  /**
   * §Landing — aggregate programme facts, served without authentication.
   *
   * The dimension list comes from the current active cohort rather than a
   * constant, because dimensions are configured per cohort: any fixed list in the
   * UI is wrong for every cohort that does not happen to match it.
   */
  async publicSummary(): Promise<PublicProgrammeSummary> {
    const [
      selfAssessorCount,
      activeCohortCount,
      completedAssessmentCount,
      scale,
      cohort,
    ] = await Promise.all([
      this.analyticsRepository.countActiveByRole(Role.self_assessor),
      this.analyticsRepository.activeCohorts(),
      this.analyticsRepository.countCompletedAssessments(),
      this.analyticsRepository.activeScaleRange(),
      this.analyticsRepository.currentCohort(),
    ]);

    // With no active cohort there is no scale to quote; fall back to the
    // product's supported bounds rather than rendering "1–null".
    const scaleMin = scale._min.scoringScaleMax ?? DEFAULT_SCALE_MAX;
    const scaleMax = scale._max.scoringScaleMax ?? DEFAULT_SCALE_MAX;

    const dimensions = cohort
      ? await this.analyticsRepository.describedDimensionsForCohort(cohort.id)
      : [];

    return {
      selfAssessorCount,
      activeCohortCount,
      completedAssessmentCount,
      roleCount: Object.keys(Role).length,
      scaleMin,
      scaleMax,
      dimensions,
    };
  }

  // ─────────────────────────── Overview ───────────────────────────

  async overview(): Promise<OverviewAnalytics> {
    const [
      byRole,
      totalCohorts,
      activeCohorts,
      byStatus,
      completedAssessments,
      facilitators,
      assignments,
      openPeriodCounts,
      completedWithScale,
      submissions,
    ] = await Promise.all([
      this.analyticsRepository.usersByRole(),
      this.analyticsRepository.totalCohorts(),
      this.analyticsRepository.activeCohorts(),
      this.analyticsRepository.periodsByStatus(),
      this.analyticsRepository.completedAssessmentCount(),
      this.analyticsRepository.facilitators(),
      this.analyticsRepository.activeAssignments(),
      this.analyticsRepository.countsByStatusForOpenPeriods(),
      this.analyticsRepository.completedWithScale(),
      this.analyticsRepository.submissionTimestampsSince(
        new Date(Date.now() - ACTIVITY_WEEKS * 7 * 24 * 60 * 60 * 1000),
      ),
    ]);

    const usersByRole: Record<string, number> = {};
    let totalUsers = 0;
    for (const row of byRole) {
      usersByRole[row.role] = row._count._all;
      totalUsers += row._count._all;
    }
    const openPeriods =
      byStatus.find((s) => s.status === 'active')?._count._all ?? 0;

    let openTotal = 0;
    let openCompleted = 0;
    for (const row of openPeriodCounts) {
      openTotal += row._count._all;
      if (row.status === 'completed') openCompleted += row._count._all;
    }

    return {
      kpis: {
        totalUsers,
        usersByRole,
        totalCohorts,
        activeCohorts,
        openPeriods,
        completedAssessments,
        completionRate: percentage(openCompleted, openTotal),
        atRiskCount: this.atRiskCountAcrossCohorts(completedWithScale),
      },
      mentorWorkload: await this.mentorWorkload(facilitators, assignments),
      activityFeed: await this.activityFeed(),
      activityTrend: weeklyCounts(submissions, new Date(), ACTIVITY_WEEKS),
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
      studentName: assessment.student.name,
      scaleMax: await this.scaleMaxFor(assessment.period.cohortId),
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
        mentorNote: s.mentorNote,
      }));
  }

  /** All three scores per dimension for one cycle, in dimension order. */
  private periodScores(a: AssessmentForStudent): PeriodDimensionScore[] {
    return a.scores
      .slice()
      .sort((x, y) => x.dimension.order - y.dimension.order)
      .map((s) => ({
        dimensionId: s.dimensionId,
        dimensionName: s.dimension.name,
        selfScore: s.selfScore,
        mentorScore: s.mentorScore,
        agreedScore: s.agreedScore,
      }));
  }

  /** Assessment totals per period, keyed by period id. */
  private tallyByPeriod(counts: PeriodStatusCount[]): Map<string, PeriodTally> {
    const byPeriod = new Map<string, PeriodTally>();
    for (const row of counts) {
      const entry = byPeriod.get(row.periodId) ?? {
        total: 0,
        completed: 0,
        started: 0,
      };
      entry.total += row._count._all;
      if (row.status === 'completed') entry.completed += row._count._all;
      if (row.status !== 'draft') entry.started += row._count._all;
      byPeriod.set(row.periodId, entry);
    }
    return byPeriod;
  }

  /**
   * Completion per period, chronological. Driven by `periods` rather than the
   * groupBy result so the series keeps period order and includes periods with
   * no assessments yet.
   */
  private completionRates(
    counts: PeriodStatusCount[],
    periods: CohortPeriod[],
  ): CohortAnalytics['completionRates'] {
    const byPeriod = this.tallyByPeriod(counts);
    return periods.map((period) => {
      const tally = byPeriod.get(period.id) ?? {
        total: 0,
        completed: 0,
        started: 0,
      };
      return {
        periodId: period.id,
        periodName: period.name,
        total: tally.total,
        completed: tally.completed,
        rate: tally.total > 0 ? round2(tally.completed / tally.total) : 0,
      };
    });
  }

  /**
   * Share of the currently open cycle that has been started (anything past
   * `draft`). With no open period there is no cycle to participate in, so 0.
   */
  private participationRate(
    counts: PeriodStatusCount[],
    periods: CohortPeriod[],
  ): number {
    const byPeriod = this.tallyByPeriod(counts);
    let total = 0;
    let started = 0;
    for (const period of periods) {
      if (period.status !== 'active') continue;
      const tally = byPeriod.get(period.id);
      if (!tally) continue;
      total += tally.total;
      started += tally.started;
    }
    return percentage(started, total);
  }

  /** Cohort-wide average per period, chronological, from completed cycles. */
  private trendline(
    assessments: AssessmentForCohort[],
    periods: CohortPeriod[],
  ): CohortAnalytics['trendline'] {
    const byPeriod = new Map<string, number[]>();
    for (const a of assessments) {
      const value = averageOrNull(this.agreedValues(a));
      if (value === null) continue;
      const bucket = byPeriod.get(a.periodId) ?? [];
      bucket.push(value);
      byPeriod.set(a.periodId, bucket);
    }
    return periods.map((period) => ({
      periodId: period.id,
      periodName: period.name,
      average: averageOrNull(byPeriod.get(period.id) ?? []),
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
    // Each student's full history, so the row can carry a direction of travel
    // rather than every row reading "stagnant".
    const history = new Map<string, Array<number | null>>();
    for (const a of assessments) {
      const bucket = history.get(a.studentId) ?? [];
      bucket.push(averageOrNull(this.agreedValues(a)));
      history.set(a.studentId, bucket);
    }

    return [...latest.values()].map((a) => {
      const scoreByDim = new Map(
        a.scores.map((s) => [s.dimensionId, s.agreedScore]),
      );
      return {
        studentId: a.studentId,
        studentName: a.student.name,
        trend: classifyTrend(history.get(a.studentId) ?? []),
        average: averageOrNull(this.agreedValues(a)),
        scores: dimensionIds.map((dimensionId) => ({
          dimensionId,
          agreedScore: scoreByDim.get(dimensionId) ?? null,
        })),
      };
    });
  }

  /** Non-null agreed scores on one assessment. */
  private agreedValues(a: { scores: Array<{ agreedScore: number | null }> }) {
    return a.scores
      .map((s) => s.agreedScore)
      .filter((value): value is number => value !== null);
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

  /**
   * Roster size plus completed and pending review counts per facilitator.
   * Assignments and assessment counts are each fetched once and grouped in
   * memory — the previous shape issued two queries per facilitator.
   */
  private async mentorWorkload(
    facilitators: Array<{ id: string; name: string }>,
    assignments: Array<{ facilitatorId: string; selfAssessorId: string }>,
  ): Promise<OverviewAnalytics['mentorWorkload']> {
    const studentsByFacilitator = new Map<string, string[]>();
    for (const assignment of assignments) {
      const bucket = studentsByFacilitator.get(assignment.facilitatorId) ?? [];
      bucket.push(assignment.selfAssessorId);
      studentsByFacilitator.set(assignment.facilitatorId, bucket);
    }

    const counts = await this.analyticsRepository.countsByStudentAndStatus(
      assignments.map((a) => a.selfAssessorId),
    );
    const completedByStudent = new Map<string, number>();
    const pendingByStudent = new Map<string, number>();
    for (const row of counts) {
      if (row.status === 'completed') {
        completedByStudent.set(row.studentId, row._count._all);
      } else if (
        row.status === 'self_submitted' ||
        row.status === 'mentor_review'
      ) {
        pendingByStudent.set(
          row.studentId,
          (pendingByStudent.get(row.studentId) ?? 0) + row._count._all,
        );
      }
    }

    const sum = (ids: string[], source: Map<string, number>): number =>
      ids.reduce((total, id) => total + (source.get(id) ?? 0), 0);

    return facilitators.map((facilitator) => {
      const studentIds = studentsByFacilitator.get(facilitator.id) ?? [];
      return {
        facilitatorId: facilitator.id,
        name: facilitator.name,
        assignedStudents: studentIds.length,
        completedReviews: sum(studentIds, completedByStudent),
        pendingReviews: sum(studentIds, pendingByStudent),
      };
    });
  }

  /**
   * Distinct self-assessors at risk anywhere in the programme. Risk is scored
   * against each student's own cohort scale, so a 4/10 and a 4/5 are not
   * conflated.
   */
  private atRiskCountAcrossCohorts(assessments: AssessmentWithScale[]): number {
    // Ordered oldest first, so the last write per student is their latest.
    const latest = new Map<string, AssessmentWithScale>();
    for (const a of assessments) latest.set(a.studentId, a);

    let count = 0;
    for (const a of latest.values()) {
      const scaleMax = a.period.cohort.scoringScaleMax;
      const coachingFlags = a.scores.filter(
        (s) => s.coachingRecommended,
      ).length;
      if (isAtRisk(average(this.agreedValues(a)), scaleMax, coachingFlags)) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Newest activity across the four things a coordinator tracks. There is no
   * event log to read from — no module writes `AuditLog` — so the feed is
   * assembled from the domain tables themselves and merged by recency.
   */
  private async activityFeed(): Promise<ActivityFeedEntry[]> {
    const [assessments, sessions, goals, users] = await Promise.all([
      this.analyticsRepository.recentAssessments(ACTIVITY_FEED_SIZE),
      this.analyticsRepository.recentCoachingSessions(ACTIVITY_FEED_SIZE),
      this.analyticsRepository.recentGoals(ACTIVITY_FEED_SIZE),
      this.analyticsRepository.recentUsers(ACTIVITY_FEED_SIZE),
    ]);

    return [
      ...assessments.map(assessmentActivity),
      ...sessions.map(coachingActivity),
      ...goals.map(goalActivity),
      ...users.map(userActivity),
    ]
      .sort((x, y) => y.timestamp.localeCompare(x.timestamp))
      .slice(0, ACTIVITY_FEED_SIZE);
  }

  private async scaleMaxFor(cohortId: string): Promise<number> {
    const cohort = await this.cohortsService.findRaw(cohortId);
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
