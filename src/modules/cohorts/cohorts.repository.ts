import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Cohort, Prisma } from '../../../generated/prisma/client';

@Injectable()
export class CohortsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.CohortCreateInput): Promise<Cohort> {
    return this.prisma.cohort.create({ data });
  }

  findAll(params?: { skip?: number; take?: number }): Promise<Cohort[]> {
    return this.prisma.cohort.findMany({
      orderBy: { startDate: 'desc' },
      skip: params?.skip,
      take: params?.take,
    });
  }

  count(): Promise<number> {
    return this.prisma.cohort.count();
  }

  findById(id: string): Promise<Cohort | null> {
    return this.prisma.cohort.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.CohortUpdateInput): Promise<Cohort> {
    return this.prisma.cohort.update({ where: { id }, data });
  }
}
