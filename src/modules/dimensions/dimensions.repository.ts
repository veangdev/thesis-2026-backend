import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Dimension, Prisma } from '../../../generated/prisma/client';

@Injectable()
export class DimensionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.DimensionCreateInput): Promise<Dimension> {
    return this.prisma.dimension.create({ data });
  }

  findByCohort(cohortId: string): Promise<Dimension[]> {
    return this.prisma.dimension.findMany({
      where: { cohortId },
      orderBy: { order: 'asc' },
    });
  }

  findActiveByCohort(cohortId: string): Promise<Dimension[]> {
    return this.prisma.dimension.findMany({
      where: { cohortId, isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  findById(id: string): Promise<Dimension | null> {
    return this.prisma.dimension.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.DimensionUpdateInput): Promise<Dimension> {
    return this.prisma.dimension.update({ where: { id }, data });
  }
}
