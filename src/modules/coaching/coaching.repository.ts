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
  availability: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ACTION_ITEM_INCLUDE = {
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.ActionItemInclude;

const SESSION_INCLUDE = {
  facilitator: { select: SAFE_USER_SELECT },
  participants: { include: { user: { select: SAFE_USER_SELECT } } },
  targetDimensions: { include: { dimension: true } },
  actionItems: { include: ACTION_ITEM_INCLUDE, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CoachingSessionInclude;

export type SessionWithRelations = Prisma.CoachingSessionGetPayload<{
  include: typeof SESSION_INCLUDE;
}>;

/** The action-item shape the API actually returns — `assignee` included. */
export type ActionItemWithAssignee = Prisma.ActionItemGetPayload<{
  include: typeof ACTION_ITEM_INCLUDE;
}>;

/**
 * Join-table members of a session. Supplying either array replaces that list
 * wholesale; omitting it leaves the existing rows untouched.
 */
export interface SessionRelationUpdate {
  participantIds?: string[];
  dimensionIds?: string[];
}

@Injectable()
export class CoachingRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(params: {
    facilitatorId: string;
    title: string;
    scope: Prisma.CoachingSessionCreateInput['scope'];
    cohortId?: string;
    scheduledAt: Date;
    durationMinutes: number;
    notes?: string;
    followUpAt?: Date;
    participantIds: string[];
    dimensionIds: string[];
  }): Promise<SessionWithRelations> {
    return this.prisma.coachingSession.create({
      data: {
        facilitatorId: params.facilitatorId,
        title: params.title,
        scope: params.scope,
        cohortId: params.cohortId,
        scheduledAt: params.scheduledAt,
        durationMinutes: params.durationMinutes,
        notes: params.notes,
        followUpAt: params.followUpAt,
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
    relations?: SessionRelationUpdate,
  ): Promise<SessionWithRelations> {
    if (!relations?.participantIds && !relations?.dimensionIds) {
      return this.prisma.coachingSession.update({
        where: { id },
        data,
        include: SESSION_INCLUDE,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const { participantIds, dimensionIds } = relations;

      if (participantIds) {
        await tx.coachingParticipant.deleteMany({ where: { sessionId: id } });
        await tx.coachingParticipant.createMany({
          data: participantIds.map((userId) => ({ sessionId: id, userId })),
        });
        // An action item may only be assigned to a current participant, which
        // the assignee picker relies on. Drop assignments the new list removed.
        await tx.actionItem.updateMany({
          where: {
            sessionId: id,
            assigneeId: participantIds.length
              ? { not: null, notIn: participantIds }
              : { not: null },
          },
          data: { assigneeId: null },
        });
      }

      if (dimensionIds) {
        await tx.coachingSessionDimension.deleteMany({
          where: { sessionId: id },
        });
        await tx.coachingSessionDimension.createMany({
          data: dimensionIds.map((dimensionId) => ({
            sessionId: id,
            dimensionId,
          })),
        });
      }

      return tx.coachingSession.update({
        where: { id },
        data,
        include: SESSION_INCLUDE,
      });
    });
  }

  delete(id: string): Promise<CoachingSession> {
    return this.prisma.coachingSession.delete({ where: { id } });
  }

  addActionItem(
    data: Prisma.ActionItemUncheckedCreateInput,
  ): Promise<ActionItemWithAssignee> {
    return this.prisma.actionItem.create({
      data,
      include: ACTION_ITEM_INCLUDE,
    });
  }

  findActionItem(id: string): Promise<ActionItem | null> {
    return this.prisma.actionItem.findUnique({ where: { id } });
  }

  updateActionItem(
    id: string,
    data: Prisma.ActionItemUncheckedUpdateInput,
  ): Promise<ActionItemWithAssignee> {
    return this.prisma.actionItem.update({
      where: { id },
      data,
      include: ACTION_ITEM_INCLUDE,
    });
  }

  deleteActionItem(id: string): Promise<ActionItem> {
    return this.prisma.actionItem.delete({ where: { id } });
  }

  /** The one cohort every given user belongs to, or undefined if not unanimous. */
  async sharedCohortId(userIds: string[]): Promise<string | undefined> {
    if (!userIds.length) return undefined;
    const rows = await this.prisma.cohortMember.findMany({
      where: { userId: { in: userIds } },
      select: { cohortId: true },
      distinct: ['cohortId'],
      take: 2,
    });
    return rows.length === 1 ? rows[0].cohortId : undefined;
  }

  async activeStudentIdsInCohort(cohortId: string): Promise<string[]> {
    const rows = await this.prisma.cohortMember.findMany({
      where: { cohortId, user: { role: 'self_assessor', isActive: true } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }
}
