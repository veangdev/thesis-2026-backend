import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GoalsRepository } from './goals.repository';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalQueryDto } from './dto/goal-query.dto';
import { GoalStatus, NotificationType, Role } from '../../common/enums';
import { APP_ROUTES } from '../../common/constants/app-routes';
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
    private readonly notificationsService: NotificationsService,
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
      targetScore: dto.targetScore,
      status: dto.status,
      milestones: this.toJson(dto.milestones),
    });

    await this.notifyGoalSet(goal, user);
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
      targetScore: dto.targetScore,
      status: dto.status,
    };
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.milestones) data.milestones = this.toJson(dto.milestones);

    const updated = await this.goalsRepository.update(id, data);
    if (
      updated.status === GoalStatus.achieved &&
      goal.status !== GoalStatus.achieved
    ) {
      await this.notifyGoalAchieved(updated, user);
    }
    return updated;
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const goal = await this.getOrThrow(id);
    this.assertCanModify(goal, user);
    await this.goalsRepository.delete(id);
  }

  // ─────────────────────────── Notifications ───────────────────────────

  /**
   * A goal someone else set for the student is news to them; a goal they set for
   * themselves is not, so self-authored goals stay silent.
   */
  private async notifyGoalSet(
    goal: Goal,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (goal.studentId === actor.id) return;
    await this.notificationsService.create({
      userId: goal.studentId,
      type: NotificationType.goal,
      title: 'New goal set for you',
      body: `"${goal.title}" was added to your goals.`,
      href: APP_ROUTES.goals,
    });
  }

  /**
   * Tell the party who did not mark it: the student when a mentor closed the
   * goal, otherwise the student's mentor. Nobody is notified of their own click.
   */
  private async notifyGoalAchieved(
    goal: Goal,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (goal.studentId !== actor.id) {
      await this.notificationsService.create({
        userId: goal.studentId,
        type: NotificationType.goal,
        title: 'Goal achieved',
        body: `"${goal.title}" was marked achieved.`,
        href: APP_ROUTES.goals,
      });
      return;
    }

    const facilitatorId = await this.assignmentsService.facilitatorIdForStudent(
      goal.studentId,
    );
    if (!facilitatorId) return;

    const student = await this.usersService.findOne(goal.studentId);
    await this.notificationsService.create({
      userId: facilitatorId,
      type: NotificationType.goal,
      title: 'Goal achieved',
      body: `${student.name} marked "${goal.title}" as achieved.`,
      // The facilitator has no `/goals` of their own — land them on the
      // student's panel, goals tab, where the closed goal actually is.
      href: APP_ROUTES.studentDetail(goal.studentId, 'goals'),
    });
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

  /**
   * Role scoping and the requested filters, combined. The student scope always
   * wins: a facilitator naming a student who is not theirs narrows to nothing
   * rather than widening to someone else's goals.
   */
  private async buildScopedWhere(
    query: GoalQueryDto,
    user: AuthenticatedUser,
  ): Promise<Prisma.GoalWhereInput> {
    const where: Prisma.GoalWhereInput = await this.buildStudentScope(
      query.studentId,
      user,
    );
    if (query.status) where.status = query.status;
    return where;
  }

  private async buildStudentScope(
    studentId: string | undefined,
    user: AuthenticatedUser,
  ): Promise<Prisma.GoalWhereInput> {
    if (user.role === Role.self_assessor) {
      return { studentId: user.id };
    }
    if (user.role === Role.facilitator) {
      const studentIds = await this.assignmentsService.studentIdsForFacilitator(
        user.id,
      );
      if (studentId) {
        return {
          studentId: studentIds.includes(studentId) ? studentId : NO_MATCH,
        };
      }
      return { studentId: { in: studentIds.length ? studentIds : [NO_MATCH] } };
    }
    return studentId ? { studentId } : {};
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
}
