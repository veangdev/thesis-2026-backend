import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Goal, Prisma } from '../../../generated/prisma/client';

/** Expose the target dimension's name so the frontend can label goals. */
const GOAL_INCLUDE = {
  targetDimension: { select: { id: true, name: true } },
} satisfies Prisma.GoalInclude;

@Injectable()
export class GoalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.GoalUncheckedCreateInput): Promise<Goal> {
    return this.prisma.goal.create({ data, include: GOAL_INCLUDE });
  }

  findMany(
    where: Prisma.GoalWhereInput,
    params?: { skip?: number; take?: number },
  ): Promise<Goal[]> {
    return this.prisma.goal.findMany({
      where,
      include: GOAL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: params?.skip,
      take: params?.take,
    });
  }

  count(where: Prisma.GoalWhereInput): Promise<number> {
    return this.prisma.goal.count({ where });
  }

  findById(id: string): Promise<Goal | null> {
    return this.prisma.goal.findUnique({
      where: { id },
      include: GOAL_INCLUDE,
    });
  }

  update(id: string, data: Prisma.GoalUncheckedUpdateInput): Promise<Goal> {
    return this.prisma.goal.update({
      where: { id },
      data,
      include: GOAL_INCLUDE,
    });
  }

  delete(id: string): Promise<Goal> {
    return this.prisma.goal.delete({ where: { id } });
  }
}
