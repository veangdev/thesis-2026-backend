import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GoalsRepository } from './goals.repository';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { AuditService } from '../audit/audit.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalQueryDto } from './dto/goal-query.dto';
import { Role } from '../../common/enums';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import { Goal, Prisma } from '../../../generated/prisma/client';

const NO_MATCH = '__none__';

@Injectable()
export class GoalsService {
  constructor(
    private readonly goalsRepository: GoalsRepository,
    private readonly usersService: UsersService,
    private readonly assignmentsService: AssignmentsService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateGoalDto, user: AuthenticatedUser): Promise<Goal> {
    const studentId = this.resolveStudentId(dto.studentId, user);
    await this.usersService.findOne(studentId);

    const goal = await this.goalsRepository.create({
      studentId,
      title: dto.title,
      description: dto.description,
      targetDimensionId: dto.targetDimensionId,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      progressPercent: dto.progressPercent ?? 0,
      milestones: this.toJson(dto.milestones),
    });

    await this.audit(user, 'create', goal.id);
    return goal;
  }

  async findAll(
    query: GoalQueryDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<Goal>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = await this.buildScopedWhere(query, user);

    const [data, total] = await Promise.all([
      this.goalsRepository.findMany(where, {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.goalsRepository.count(where),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Goal> {
    const goal = await this.getOrThrow(id);
    await this.assertCanRead(goal, user);
    return goal;
  }

  async update(
    id: string,
    dto: UpdateGoalDto,
    user: AuthenticatedUser,
  ): Promise<Goal> {
    const goal = await this.getOrThrow(id);
    this.assertCanModify(goal, user);

    const data: Prisma.GoalUncheckedUpdateInput = {
      title: dto.title,
      description: dto.description,
      targetDimensionId: dto.targetDimensionId,
      progressPercent: dto.progressPercent,
    };
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.milestones) data.milestones = this.toJson(dto.milestones);

    const updated = await this.goalsRepository.update(id, data);
    await this.audit(user, 'update', id);
    return updated;
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const goal = await this.getOrThrow(id);
    this.assertCanModify(goal, user);
    await this.goalsRepository.delete(id);
    await this.audit(user, 'delete', id);
  }

  // ─────────────────────────── Helpers ───────────────────────────

  private resolveStudentId(
    studentId: string | undefined,
    user: AuthenticatedUser,
  ): string {
    if (user.role === Role.self_assessor) return user.id;
    if (!studentId) {
      throw new BadRequestException('studentId is required');
    }
    return studentId;
  }

  private async getOrThrow(id: string): Promise<Goal> {
    const goal = await this.goalsRepository.findById(id);
    if (!goal) throw new NotFoundException(`Goal ${id} not found`);
    return goal;
  }

  private async buildScopedWhere(
    query: GoalQueryDto,
    user: AuthenticatedUser,
  ): Promise<Prisma.GoalWhereInput> {
    if (user.role === Role.self_assessor) {
      return { studentId: user.id };
    }
    if (user.role === Role.facilitator) {
      const studentIds = await this.assignmentsService.studentIdsForFacilitator(
        user.id,
      );
      if (query.studentId) {
        return {
          studentId: studentIds.includes(query.studentId)
            ? query.studentId
            : NO_MATCH,
        };
      }
      return { studentId: { in: studentIds.length ? studentIds : [NO_MATCH] } };
    }
    return query.studentId ? { studentId: query.studentId } : {};
  }

  private async assertCanRead(
    goal: Goal,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (user.role === Role.program_coordinator) return;
    if (user.role === Role.self_assessor) {
      if (goal.studentId === user.id) return;
      throw new ForbiddenException('Not your goal');
    }
    const assigned = await this.assignmentsService.isAssigned(
      user.id,
      goal.studentId,
    );
    if (!assigned)
      throw new ForbiddenException('Student is not assigned to you');
  }

  private assertCanModify(goal: Goal, user: AuthenticatedUser): void {
    if (user.role === Role.program_coordinator) return;
    if (user.role === Role.self_assessor && goal.studentId === user.id) return;
    throw new ForbiddenException('You cannot modify this goal');
  }

  private toJson(milestones?: unknown): Prisma.InputJsonValue | undefined {
    return milestones === undefined
      ? undefined
      : (milestones as Prisma.InputJsonValue);
  }

  private async audit(
    user: AuthenticatedUser,
    action: string,
    entityId: string,
  ): Promise<void> {
    if (user.role !== Role.program_coordinator) return;
    await this.auditService.record({
      actorId: user.id,
      action,
      entity: 'Goal',
      entityId,
    });
  }
}
