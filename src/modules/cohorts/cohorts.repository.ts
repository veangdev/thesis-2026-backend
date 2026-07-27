import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Cohort, Prisma } from '../../../generated/prisma/client';

/**
 * Enrolment is counted in the same query as the row itself. Counting per cohort
 * in the service would be one extra query per cohort — an N+1 on a screen that
 * lists every batch.
 */
const WITH_MEMBER_COUNT = {
  _count: { select: { members: true } },
} satisfies Prisma.CohortInclude;

export type CohortWithMemberCount = Prisma.CohortGetPayload<{
  include: typeof WITH_MEMBER_COUNT;
}>;

@Injectable()
export class CohortsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.CohortCreateInput): Promise<CohortWithMemberCount> {
    return this.prisma.cohort.create({ data, include: WITH_MEMBER_COUNT });
  }

  findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.CohortWhereInput;
  }): Promise<CohortWithMemberCount[]> {
    return this.prisma.cohort.findMany({
      where: params?.where,
      orderBy: { startDate: 'desc' },
      skip: params?.skip,
      take: params?.take,
      include: WITH_MEMBER_COUNT,
    });
  }

  count(where?: Prisma.CohortWhereInput): Promise<number> {
    return this.prisma.cohort.count({ where });
  }

  findById(id: string): Promise<CohortWithMemberCount | null> {
    return this.prisma.cohort.findUnique({
      where: { id },
      include: WITH_MEMBER_COUNT,
    });
  }

  update(
    id: string,
    data: Prisma.CohortUpdateInput,
  ): Promise<CohortWithMemberCount> {
    return this.prisma.cohort.update({
      where: { id },
      data,
      include: WITH_MEMBER_COUNT,
    });
  }

  /** Raw row without the count — for callers that only need scalar fields. */
  findRawById(id: string): Promise<Cohort | null> {
    return this.prisma.cohort.findUnique({ where: { id } });
  }
}
