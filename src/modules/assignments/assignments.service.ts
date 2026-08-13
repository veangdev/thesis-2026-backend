import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentsRepository } from './assignments.repository';
import { UsersService } from '../users/users.service';
import { CohortsService } from '../cohorts/cohorts.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { Role } from '../../common/enums';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import { MentorAssignment, Prisma } from '../../../generated/prisma/client';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly assignmentsRepository: AssignmentsRepository,
    private readonly usersService: UsersService,
    private readonly cohortsService: CohortsService,
  ) {}

  async create(dto: CreateAssignmentDto): Promise<MentorAssignment> {
    const facilitator = await this.usersService.findOne(dto.facilitatorId);
    if (facilitator.role !== Role.facilitator) {
      throw new BadRequestException('facilitatorId must be a facilitator');
    }

    const student = await this.usersService.findOne(dto.selfAssessorId);
    if (student.role !== Role.self_assessor) {
      throw new BadRequestException('selfAssessorId must be a self-assessor');
    }

    // Assignments are cohort-scoped. The UI assigns by facilitator + student
    // without a cohort, so default to the student's cohort when omitted.
    const cohortId =
      dto.cohortId ??
      (await this.assignmentsRepository.cohortIdForStudent(dto.selfAssessorId));
    if (!cohortId) {
      throw new BadRequestException(
        'Student is not enrolled in a cohort; provide a cohortId explicitly.',
      );
    }
    await this.cohortsService.findRaw(cohortId);

    // A self-assessor has exactly one facilitator. Assigning them to a new one
    // retires the previous assignment rather than adding a second — otherwise
    // they appear on both rosters and `facilitatorId` on their user record
    // resolves to whichever active row Prisma returns first.
    await this.assignmentsRepository.deactivateForStudent(
      dto.selfAssessorId,
      dto.facilitatorId,
    );

    // The trio is unique, so a student returning to an earlier facilitator has
    // a retired row waiting rather than room for a new one.
    const existing = await this.assignmentsRepository.findByTrio({
      facilitatorId: dto.facilitatorId,
      selfAssessorId: dto.selfAssessorId,
      cohortId,
    });
    if (existing) {
      return existing.active
        ? existing
        : this.assignmentsRepository.reactivate(existing.id);
    }

    return this.assignmentsRepository.create({
      facilitatorId: dto.facilitatorId,
      selfAssessorId: dto.selfAssessorId,
      cohortId,
    });
  }

  async remove(id: string): Promise<void> {
    const assignment = await this.assignmentsRepository.findById(id);
    if (!assignment) {
      throw new NotFoundException(`Assignment ${id} not found`);
    }
    await this.assignmentsRepository.delete(id);
  }

  /**
   * Current assignments, newest first. Retired rows are excluded: the list is
   * read as "who mentors whom right now", and a caller resolving a student's
   * assignment id from it would otherwise be handed a historical row and unassign
   * nothing.
   */
  async findAll(
    query: AssignmentQueryDto,
  ): Promise<Paginated<MentorAssignment>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.MentorAssignmentWhereInput = { active: true };
    if (query.cohortId) where.cohortId = query.cohortId;
    if (query.facilitatorId) where.facilitatorId = query.facilitatorId;
    const [data, total] = await Promise.all([
      this.assignmentsRepository.findAll({
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      this.assignmentsRepository.count(where),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async studentsForFacilitator(
    facilitatorId: string,
  ): Promise<AuthenticatedUser[]> {
    const rows =
      await this.assignmentsRepository.studentsForFacilitator(facilitatorId);
    return rows.map((row) => this.usersService.sanitize(row));
  }

  studentIdsForFacilitator(facilitatorId: string): Promise<string[]> {
    return this.assignmentsRepository.studentIdsForFacilitator(facilitatorId);
  }

  isAssigned(facilitatorId: string, selfAssessorId: string): Promise<boolean> {
    return this.assignmentsRepository.isAssigned(facilitatorId, selfAssessorId);
  }

  /**
   * The facilitator assigned to a self-assessor, for their own profile.
   * Returns null when nobody is assigned yet — that is a normal state, not an
   * error, so the caller can render an empty row rather than handle a 404.
   */
  async facilitatorForStudent(
    selfAssessorId: string,
  ): Promise<AuthenticatedUser | null> {
    const facilitatorId =
      await this.assignmentsRepository.facilitatorIdForStudent(selfAssessorId);
    if (!facilitatorId) return null;
    return this.usersService.findOne(facilitatorId);
  }

  facilitatorIdForStudent(selfAssessorId: string): Promise<string | null> {
    return this.assignmentsRepository.facilitatorIdForStudent(selfAssessorId);
  }
}
