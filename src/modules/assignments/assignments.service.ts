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
import {
  Paginated,
  PaginationQueryDto,
  paginate,
} from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import { MentorAssignment } from '../../../generated/prisma/client';

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
    await this.cohortsService.findOne(cohortId);

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

  async findAll(
    pagination: PaginationQueryDto,
  ): Promise<Paginated<MentorAssignment>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? 20;
    const [data, total] = await Promise.all([
      this.assignmentsRepository.findAll({
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.assignmentsRepository.count(),
    ]);
    return paginate(data, total, page, pageSize);
  }

  studentsForFacilitator(facilitatorId: string): Promise<AuthenticatedUser[]> {
    return this.assignmentsRepository.studentsForFacilitator(facilitatorId);
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
