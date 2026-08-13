import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActionItemWithAssignee,
  CoachingRepository,
  SessionWithRelations,
} from './coaching.repository';
import { CreateCoachingSessionDto } from './dto/create-coaching-session.dto';
import { UpdateCoachingSessionDto } from './dto/update-coaching-session.dto';
import {
  CreateActionItemDto,
  UpdateActionItemDto,
} from './dto/action-item.dto';
import { CoachingQueryDto } from './dto/coaching-query.dto';
import { CoachingScope, Role } from '../../common/enums';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class CoachingService {
  constructor(private readonly coachingRepository: CoachingRepository) {}

  async create(
    dto: CreateCoachingSessionDto,
    user: AuthenticatedUser,
  ): Promise<SessionWithRelations> {
    const participantIds = await this.resolveParticipants(dto);

    const session = await this.coachingRepository.create({
      facilitatorId: user.id,
      title: dto.title,
      scope: dto.scope,
      cohortId: await this.resolveCohortId(dto.cohortId, participantIds),
      scheduledAt: new Date(dto.scheduledAt),
      durationMinutes: dto.durationMinutes ?? 60,
      notes: dto.notes,
      followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
      participantIds,
      dimensionIds: dto.targetDimensionIds ?? [],
    });

    return session;
  }

  async findAll(
    query: CoachingQueryDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<SessionWithRelations>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildScopedWhere(query, user);

    const [data, total] = await Promise.all([
      this.coachingRepository.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.coachingRepository.count(where),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(
    id: string,
    user: AuthenticatedUser,
  ): Promise<SessionWithRelations> {
    const session = await this.getOrThrow(id);
    this.assertCanRead(session, user);
    return session;
  }

  async update(
    id: string,
    dto: UpdateCoachingSessionDto,
    user: AuthenticatedUser,
  ): Promise<SessionWithRelations> {
    const session = await this.getOrThrow(id);
    this.assertCanManage(session, user);

    const scope = dto.scope ?? session.scope;
    if (
      dto.participantIds &&
      !dto.participantIds.length &&
      scope === CoachingScope.individual
    ) {
      throw new BadRequestException('individual scope requires participantIds');
    }

    const data: Prisma.CoachingSessionUncheckedUpdateInput = {
      title: dto.title,
      scope: dto.scope,
      notes: dto.notes,
      durationMinutes: dto.durationMinutes,
      status: dto.status,
      cohortId: dto.cohortId,
    };
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    if (dto.followUpAt) data.followUpAt = new Date(dto.followUpAt);

    const updated = await this.coachingRepository.update(id, data, {
      participantIds: dto.participantIds
        ? [...new Set(dto.participantIds)]
        : undefined,
      dimensionIds: dto.targetDimensionIds
        ? [...new Set(dto.targetDimensionIds)]
        : undefined,
    });
    return updated;
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const session = await this.getOrThrow(id);
    this.assertCanManage(session, user);
    await this.coachingRepository.delete(id);
  }

  async addActionItem(
    sessionId: string,
    dto: CreateActionItemDto,
    user: AuthenticatedUser,
  ): Promise<ActionItemWithAssignee> {
    const session = await this.getOrThrow(sessionId);
    this.assertCanManage(session, user);
    return this.coachingRepository.addActionItem({
      sessionId,
      description: dto.description,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      assigneeId: dto.assigneeId,
    });
  }

  async updateActionItem(
    id: string,
    dto: UpdateActionItemDto,
    user: AuthenticatedUser,
  ): Promise<ActionItemWithAssignee> {
    const item = await this.coachingRepository.findActionItem(id);
    if (!item) throw new NotFoundException(`Action item ${id} not found`);
    const session = await this.getOrThrow(item.sessionId);
    this.assertCanManage(session, user);

    const data: Prisma.ActionItemUncheckedUpdateInput = {
      description: dto.description,
      done: dto.done,
      assigneeId: dto.assigneeId,
    };
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    return this.coachingRepository.updateActionItem(id, data);
  }

  async removeActionItem(id: string, user: AuthenticatedUser): Promise<void> {
    const item = await this.coachingRepository.findActionItem(id);
    if (!item) throw new NotFoundException(`Action item ${id} not found`);
    const session = await this.getOrThrow(item.sessionId);
    this.assertCanManage(session, user);
    await this.coachingRepository.deleteActionItem(id);
  }

  // ─────────────────────────── Helpers ───────────────────────────

  private async resolveParticipants(
    dto: CreateCoachingSessionDto,
  ): Promise<string[]> {
    if (dto.scope === CoachingScope.individual) {
      if (!dto.participantIds?.length) {
        throw new BadRequestException(
          'individual scope requires participantIds',
        );
      }
      return [...new Set(dto.participantIds)];
    }
    // group / class / batch — enrol the whole cohort when provided.
    if (dto.cohortId) {
      return this.coachingRepository.activeStudentIdsInCohort(dto.cohortId);
    }
    return [...new Set(dto.participantIds ?? [])];
  }

  /**
   * A session belongs to a cohort so cohort-scoped views can filter on it.
   * An explicit `cohortId` wins; otherwise derive it from the participants when
   * they all share exactly one cohort. Sessions spanning cohorts stay
   * unassigned — the same rule the backfill migration applied to older rows.
   */
  private async resolveCohortId(
    cohortId: string | undefined,
    participantIds: string[],
  ): Promise<string | undefined> {
    if (cohortId) return cohortId;
    return this.coachingRepository.sharedCohortId(participantIds);
  }

  private async getOrThrow(id: string): Promise<SessionWithRelations> {
    const session = await this.coachingRepository.findById(id);
    if (!session) {
      throw new NotFoundException(`Coaching session ${id} not found`);
    }
    return session;
  }

  private buildScopedWhere(
    query: CoachingQueryDto,
    user: AuthenticatedUser,
  ): Prisma.CoachingSessionWhereInput {
    const where: Prisma.CoachingSessionWhereInput = {};

    if (user.role === Role.facilitator) {
      where.facilitatorId = user.id;
    } else if (user.role === Role.self_assessor) {
      where.participants = { some: { userId: user.id } };
    } else {
      if (query.facilitatorId) where.facilitatorId = query.facilitatorId;
      if (query.studentId) {
        where.participants = { some: { userId: query.studentId } };
      }
    }

    if (query.cohortId) where.cohortId = query.cohortId;
    if (query.status) where.status = query.status;
    if (query.scope) where.scope = query.scope;

    if (query.from || query.to) {
      const scheduledAt: Prisma.DateTimeFilter = {};
      if (query.from) scheduledAt.gte = new Date(query.from);
      if (query.to) scheduledAt.lte = new Date(query.to);
      where.scheduledAt = scheduledAt;
    }

    return where;
  }

  private assertCanRead(
    session: SessionWithRelations,
    user: AuthenticatedUser,
  ): void {
    if (user.role === Role.program_coordinator) return;
    if (user.role === Role.facilitator && session.facilitatorId === user.id) {
      return;
    }
    if (
      user.role === Role.self_assessor &&
      session.participants.some((p) => p.userId === user.id)
    ) {
      return;
    }
    throw new ForbiddenException('You cannot access this coaching session');
  }

  private assertCanManage(
    session: SessionWithRelations,
    user: AuthenticatedUser,
  ): void {
    if (user.role === Role.program_coordinator) return;
    if (user.role === Role.facilitator && session.facilitatorId === user.id) {
      return;
    }
    throw new ForbiddenException('You cannot manage this coaching session');
  }
}
