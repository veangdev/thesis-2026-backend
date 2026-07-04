import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

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

export type AssessmentForStudent = Prisma.AssessmentGetPayload<{
  include: typeof WITH_SCORES;
}>;
export type AssessmentForCohort = Prisma.AssessmentGetPayload<{
  include: typeof WITH_SCORES_AND_STUDENT;
}>;
export type GapAssessment = Prisma.AssessmentGetPayload<{
  include: typeof WITH_SCORES_AND_STUDENT;
}>;

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

  assessmentsForCohort(cohortId: string): Promise<AssessmentForCohort[]> {
    return this.prisma.assessment.findMany({
      where: { period: { cohortId } },
      include: WITH_SCORES_AND_STUDENT,
      orderBy: { period: { startDate: 'asc' } },
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

  countCompletedForStudents(studentIds: string[]): Promise<number> {
    if (studentIds.length === 0) return Promise.resolve(0);
    return this.prisma.assessment.count({
      where: { status: 'completed', studentId: { in: studentIds } },
    });
  }
}
