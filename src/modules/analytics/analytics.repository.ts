import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import {
  AssessmentPeriodStatus,
  AssessmentStatus,
  Role,
} from '../../common/enums';

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarUrl: true,
  expertiseTags: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const WITH_SCORES = {
  scores: { include: { dimension: true } },
  period: true,
} satisfies Prisma.AssessmentInclude;

const WITH_SCORES_AND_STUDENT = {
  scores: { include: { dimension: true } },
  period: true,
  student: { select: SAFE_USER_SELECT },
} satisfies Prisma.AssessmentInclude;

/** Completed assessments program-wide need their cohort's scale to score risk. */
const WITH_SCORES_STUDENT_AND_SCALE = {
  scores: { include: { dimension: true } },
  period: { include: { cohort: { select: { scoringScaleMax: true } } } },
  student: { select: SAFE_USER_SELECT },
} satisfies Prisma.AssessmentInclude;

export type AssessmentForStudent = Prisma.AssessmentGetPayload<{
  include: typeof WITH_SCORES;
}>;
export type AssessmentForCohort = Prisma.AssessmentGetPayload<{
  include: typeof WITH_SCORES_AND_STUDENT;
}>;
export type GapAssessment = Prisma.AssessmentGetPayload<{
  include: typeof WITH_SCORES_AND_STUDENT;
}>;
export type AssessmentWithScale = Prisma.AssessmentGetPayload<{
  include: typeof WITH_SCORES_STUDENT_AND_SCALE;
}>;

export interface CohortPeriod {
  id: string;
  name: string;
  status: AssessmentPeriodStatus;
}

// ── Raw rows feeding the coordinator activity feed ───────────────────────────

export interface RecentAssessmentRow {
  id: string;
  status: AssessmentStatus;
  updatedAt: Date;
  student: { name: string };
  period: { name: string };
}

export interface RecentCoachingRow {
  id: string;
  title: string;
  createdAt: Date;
  facilitator: { name: string };
}

export interface RecentGoalRow {
  id: string;
  title: string;
  createdAt: Date;
  student: { name: string };
}

export interface RecentUserRow {
  id: string;
  name: string;
  role: Role;
  createdAt: Date;
}

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  completedForStudent(studentId: string): Promise<AssessmentForStudent[]> {
    return this.prisma.assessment.findMany({
      where: { studentId, status: 'completed' },
      include: WITH_SCORES,
      orderBy: { period: { startDate: 'asc' } },
    });
  }

  /**
   * Every assessment for a student regardless of status. The student radar
   * charts one entry per cohort period — including cycles still in progress —
   * so journey progress can read "2 of 4 cycles" rather than always 100%.
   */
  allForStudent(studentId: string): Promise<AssessmentForStudent[]> {
    return this.prisma.assessment.findMany({
      where: { studentId },
      include: WITH_SCORES,
      orderBy: { period: { startDate: 'asc' } },
    });
  }

  /** Completed assessments only — used for the heatmap and at-risk detection. */
  completedForCohort(cohortId: string): Promise<AssessmentForCohort[]> {
    return this.prisma.assessment.findMany({
      where: { period: { cohortId }, status: 'completed' },
      include: WITH_SCORES_AND_STUDENT,
      orderBy: { period: { startDate: 'asc' } },
    });
  }

  /** Average agreed score per dimension across completed assessments (SQL-side). */
  avgAgreedByCohortDimension(cohortId: string) {
    return this.prisma.assessmentScore.groupBy({
      by: ['dimensionId'],
      where: {
        agreedScore: { not: null },
        assessment: { status: 'completed', period: { cohortId } },
      },
      _avg: { agreedScore: true },
    });
  }

  /** Assessment counts per period+status, for completion rates (SQL-side). */
  countsByPeriodStatus(cohortId: string) {
    return this.prisma.assessment.groupBy({
      by: ['periodId', 'status'],
      where: { period: { cohortId } },
      _count: { _all: true },
    });
  }

  dimensionsForCohort(
    cohortId: string,
  ): Promise<Array<{ id: string; name: string; order: number }>> {
    return this.prisma.dimension.findMany({
      where: { cohortId },
      select: { id: true, name: true, order: true },
      orderBy: { order: 'asc' },
    });
  }

  /** Chronological — completion rates and the trendline are read as a series. */
  periodsForCohort(cohortId: string): Promise<CohortPeriod[]> {
    return this.prisma.assessmentPeriod.findMany({
      where: { cohortId },
      select: { id: true, name: true, status: true },
      orderBy: { startDate: 'asc' },
    });
  }

  findAssessment(id: string): Promise<GapAssessment | null> {
    return this.prisma.assessment.findUnique({
      where: { id },
      include: WITH_SCORES_AND_STUDENT,
    });
  }

  usersByRole() {
    return this.prisma.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    });
  }

  totalCohorts(): Promise<number> {
    return this.prisma.cohort.count();
  }

  activeCohorts(): Promise<number> {
    return this.prisma.cohort.count({ where: { status: 'active' } });
  }

  /**
   * Every completed assessment program-wide, carrying its cohort's scoring
   * scale. One query feeds the at-risk KPI across all cohorts — the alternative
   * was the frontend fetching full analytics per cohort and summing.
   */
  completedWithScale(): Promise<AssessmentWithScale[]> {
    return this.prisma.assessment.findMany({
      where: { status: 'completed' },
      include: WITH_SCORES_STUDENT_AND_SCALE,
      orderBy: { period: { startDate: 'asc' } },
    });
  }

  /** Assessment counts per status within currently open periods (SQL-side). */
  countsByStatusForOpenPeriods() {
    return this.prisma.assessment.groupBy({
      by: ['status'],
      where: { period: { status: AssessmentPeriodStatus.active } },
      _count: { _all: true },
    });
  }

  /** Assessment counts per student+status — powers facilitator workload. */
  countsByStudentAndStatus(studentIds: string[]) {
    if (studentIds.length === 0) return Promise.resolve([]);
    return this.prisma.assessment.groupBy({
      by: ['studentId', 'status'],
      where: { studentId: { in: studentIds } },
      _count: { _all: true },
    });
  }

  /** Self-assessor ids per facilitator, for every active assignment at once. */
  activeAssignments(): Promise<
    Array<{ facilitatorId: string; selfAssessorId: string }>
  > {
    return this.prisma.mentorAssignment.findMany({
      where: { active: true },
      select: { facilitatorId: true, selfAssessorId: true },
    });
  }

  /** Submission timestamps within the window, for the weekly activity trend. */
  async submissionTimestampsSince(since: Date): Promise<Date[]> {
    const rows = await this.prisma.assessment.findMany({
      where: { submittedAt: { gte: since } },
      select: { submittedAt: true },
    });
    return rows
      .map((row) => row.submittedAt)
      .filter((at): at is Date => at !== null);
  }

  // ── Activity feed sources ──────────────────────────────────────────────────

  recentAssessments(take: number): Promise<RecentAssessmentRow[]> {
    return this.prisma.assessment.findMany({
      where: { status: { not: 'draft' } },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        student: { select: { name: true } },
        period: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take,
    });
  }

  recentCoachingSessions(take: number): Promise<RecentCoachingRow[]> {
    return this.prisma.coachingSession.findMany({
      select: {
        id: true,
        title: true,
        createdAt: true,
        facilitator: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  recentGoals(take: number): Promise<RecentGoalRow[]> {
    return this.prisma.goal.findMany({
      select: {
        id: true,
        title: true,
        createdAt: true,
        student: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  recentUsers(take: number): Promise<RecentUserRow[]> {
    return this.prisma.user.findMany({
      select: { id: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  periodsByStatus() {
    return this.prisma.assessmentPeriod.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
  }

  completedAssessmentCount(): Promise<number> {
    return this.prisma.assessment.count({ where: { status: 'completed' } });
  }

  facilitators(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.user.findMany({
      where: { role: 'facilitator' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
