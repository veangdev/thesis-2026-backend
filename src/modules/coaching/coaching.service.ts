import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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
import { ActionItem, Prisma } from '../../../generated/prisma/client';

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
      scheduledAt: new Date(dto.scheduledAt),
      durationMinutes: dto.durationMinutes ?? 60,
      notes: dto.notes,
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

    const data: Prisma.CoachingSessionUncheckedUpdateInput = {
      title: dto.title,
      notes: dto.notes,
      durationMinutes: dto.durationMinutes,
      status: dto.status,
    };
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);

    const updated = await this.coachingRepository.update(id, data);
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
  ): Promise<ActionItem> {
    const session = await this.getOrThrow(sessionId);
    this.assertCanManage(session, user);
    return this.coachingRepository.addActionItem({
      sessionId,
      description: dto.description,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    });
  }

  async updateActionItem(
    id: string,
    dto: UpdateActionItemDto,
    user: AuthenticatedUser,
  ): Promise<ActionItem> {
    const item = await this.coachingRepository.findActionItem(id);
    if (!item) throw new NotFoundException(`Action item ${id} not found`);
    const session = await this.getOrThrow(item.sessionId);
    this.assertCanManage(session, user);

    const data: Prisma.ActionItemUncheckedUpdateInput = {
      description: dto.description,
      done: dto.done,
    };
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    return this.coachingRepository.updateActionItem(id, data);
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
