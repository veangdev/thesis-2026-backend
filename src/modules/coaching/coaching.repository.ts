import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ActionItem,
  CoachingSession,
  Prisma,
} from '../../../generated/prisma/client';

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

const SESSION_INCLUDE = {
  facilitator: { select: SAFE_USER_SELECT },
  participants: { include: { user: { select: SAFE_USER_SELECT } } },
  targetDimensions: { include: { dimension: true } },
  actionItems: true,
} satisfies Prisma.CoachingSessionInclude;

export type SessionWithRelations = Prisma.CoachingSessionGetPayload<{
  include: typeof SESSION_INCLUDE;
}>;

@Injectable()
export class CoachingRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(params: {
    facilitatorId: string;
    title: string;
    scope: Prisma.CoachingSessionCreateInput['scope'];
    scheduledAt: Date;
    durationMinutes: number;
    notes?: string;
    participantIds: string[];
    dimensionIds: string[];
  }): Promise<SessionWithRelations> {
    return this.prisma.coachingSession.create({
      data: {
        facilitatorId: params.facilitatorId,
        title: params.title,
        scope: params.scope,
        scheduledAt: params.scheduledAt,
        durationMinutes: params.durationMinutes,
        notes: params.notes,
        participants: {
          create: params.participantIds.map((userId) => ({ userId })),
        },
        targetDimensions: {
          create: params.dimensionIds.map((dimensionId) => ({ dimensionId })),
        },
      },
      include: SESSION_INCLUDE,
    });
  }

  findMany(params: {
    where: Prisma.CoachingSessionWhereInput;
    skip?: number;
    take?: number;
  }): Promise<SessionWithRelations[]> {
    return this.prisma.coachingSession.findMany({
      where: params.where,
      include: SESSION_INCLUDE,
      orderBy: { scheduledAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  count(where: Prisma.CoachingSessionWhereInput): Promise<number> {
    return this.prisma.coachingSession.count({ where });
  }

  findById(id: string): Promise<SessionWithRelations | null> {
    return this.prisma.coachingSession.findUnique({
      where: { id },
      include: SESSION_INCLUDE,
    });
  }

  update(
    id: string,
    data: Prisma.CoachingSessionUncheckedUpdateInput,
  ): Promise<SessionWithRelations> {
    return this.prisma.coachingSession.update({
      where: { id },
      data,
      include: SESSION_INCLUDE,
    });
  }

  delete(id: string): Promise<CoachingSession> {
    return this.prisma.coachingSession.delete({ where: { id } });
  }

  addActionItem(
    data: Prisma.ActionItemUncheckedCreateInput,
  ): Promise<ActionItem> {
    return this.prisma.actionItem.create({ data });
  }

  findActionItem(id: string): Promise<ActionItem | null> {
    return this.prisma.actionItem.findUnique({ where: { id } });
  }

  updateActionItem(
    id: string,
    data: Prisma.ActionItemUncheckedUpdateInput,
  ): Promise<ActionItem> {
    return this.prisma.actionItem.update({ where: { id }, data });
  }

  deleteActionItem(id: string): Promise<ActionItem> {
    return this.prisma.actionItem.delete({ where: { id } });
  }

  async activeStudentIdsInCohort(cohortId: string): Promise<string[]> {
    const rows = await this.prisma.cohortMember.findMany({
      where: { cohortId, user: { role: 'self_assessor', isActive: true } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }
}
