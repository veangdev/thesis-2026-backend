import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Assessment, Prisma } from '../../../generated/prisma/client';

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

const ASSESSMENT_INCLUDE = {
  scores: { include: { dimension: true } },
  period: true,
  student: { select: SAFE_USER_SELECT },
} satisfies Prisma.AssessmentInclude;

export type AssessmentWithRelations = Prisma.AssessmentGetPayload<{
  include: typeof ASSESSMENT_INCLUDE;
}>;

@Injectable()
export class AssessmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Active self-assessor members of a cohort (targets for a new period). */
  async activeStudentIdsInCohort(cohortId: string): Promise<string[]> {
    const rows = await this.prisma.cohortMember.findMany({
      where: { cohortId, user: { role: 'self_assessor', isActive: true } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async studentIdsWithAssessmentForPeriod(
    periodId: string,
  ): Promise<Set<string>> {
    const rows = await this.prisma.assessment.findMany({
      where: { periodId },
      select: { studentId: true },
    });
    return new Set(rows.map((row) => row.studentId));
  }

  /** Atomically create draft assessments (one per student) for a period. */
  async createDrafts(
    periodId: string,
    studentIds: string[],
    dimensionIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction(
      studentIds.map((studentId) =>
        this.prisma.assessment.create({
          data: {
            studentId,
            periodId,
            scores: {
              create: dimensionIds.map((dimensionId) => ({ dimensionId })),
            },
          },
        }),
      ),
    );
  }

  findById(id: string): Promise<AssessmentWithRelations | null> {
    return this.prisma.assessment.findUnique({
      where: { id },
      include: ASSESSMENT_INCLUDE,
    });
  }

  findMany(params: {
    where: Prisma.AssessmentWhereInput;
    skip?: number;
    take?: number;
  }): Promise<AssessmentWithRelations[]> {
    return this.prisma.assessment.findMany({
      where: params.where,
      include: ASSESSMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  count(where: Prisma.AssessmentWhereInput): Promise<number> {
    return this.prisma.assessment.count({ where });
  }

  setStatus(
    id: string,
    data: Prisma.AssessmentUncheckedUpdateInput,
  ): Promise<Assessment> {
    return this.prisma.assessment.update({ where: { id }, data });
  }

  /**
   * Atomically apply per-dimension score updates and (optionally) an assessment
   * status change in a single transaction, so a mid-way failure can't leave the
   * assessment in a partially-updated state.
   */
  async applyScoreUpdates(
    assessmentId: string,
    updates: {
      dimensionId: string;
      data: Prisma.AssessmentScoreUncheckedUpdateInput;
    }[],
    assessmentData?: Prisma.AssessmentUncheckedUpdateInput,
  ): Promise<void> {
    const ops: Prisma.PrismaPromise<unknown>[] = updates.map((u) =>
      this.prisma.assessmentScore.update({
        where: {
          assessmentId_dimensionId: {
            assessmentId,
            dimensionId: u.dimensionId,
          },
        },
        data: u.data,
      }),
    );
    if (assessmentData) {
      ops.push(
        this.prisma.assessment.update({
          where: { id: assessmentId },
          data: assessmentData,
        }),
      );
    }
    await this.prisma.$transaction(ops);
  }

  /** Agreed scores (by dimension) from the student's prior completed period. */
  async previousAgreedScores(
    studentId: string,
    cohortId: string,
    beforeStart: Date,
  ): Promise<Map<string, number>> {
    const previous = await this.prisma.assessment.findFirst({
      where: {
        studentId,
        status: 'completed',
        period: { cohortId, startDate: { lt: beforeStart } },
      },
      orderBy: { period: { startDate: 'desc' } },
      include: { scores: true },
    });

    const map = new Map<string, number>();
    for (const score of previous?.scores ?? []) {
      if (score.agreedScore !== null) {
        map.set(score.dimensionId, score.agreedScore);
      }
    }
    return map;
  }
}
