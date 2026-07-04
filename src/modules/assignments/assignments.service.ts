import { BadRequestException, Injectable } from '@nestjs/common';
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

    await this.cohortsService.findOne(dto.cohortId);

    return this.assignmentsRepository.create({
      facilitatorId: dto.facilitatorId,
      selfAssessorId: dto.selfAssessorId,
      cohortId: dto.cohortId,
    });
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

  facilitatorIdForStudent(selfAssessorId: string): Promise<string | null> {
    return this.assignmentsRepository.facilitatorIdForStudent(selfAssessorId);
  }
}
