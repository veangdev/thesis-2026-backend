import { Injectable } from '@nestjs/common';
import { AssessmentPeriod, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PeriodsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.AssessmentPeriodCreateInput): Promise<AssessmentPeriod> {
    return this.prisma.assessmentPeriod.create({ data });
  }

  findByCohort(cohortId: string): Promise<AssessmentPeriod[]> {
    return this.prisma.assessmentPeriod.findMany({
      where: { cohortId },
      orderBy: { startDate: 'desc' },
    });
  }

  findById(id: string): Promise<AssessmentPeriod | null> {
    return this.prisma.assessmentPeriod.findUnique({ where: { id } });
  }

  update(
    id: string,
    data: Prisma.AssessmentPeriodUpdateInput,
  ): Promise<AssessmentPeriod> {
    return this.prisma.assessmentPeriod.update({ where: { id }, data });
  }

  delete(id: string): Promise<AssessmentPeriod> {
    return this.prisma.assessmentPeriod.delete({ where: { id } });
  }
}
