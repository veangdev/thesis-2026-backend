import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MentorAssignment, Prisma } from '../../../generated/prisma/client';

/**
 * Everything a user response needs, minus the password hash.
 * `cohortMemberships` and `selfAssessorAssignments` are included because
 * `UsersService.sanitize` flattens them into `cohortId`/`cohortName` and
 * `facilitatorId`, which every user-shaped response carries.
 */
const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarUrl: true,
  expertiseTags: true,
  availability: true,
  isActive: true,
  gender: true,
  studentClass: true,
  studentCode: true,
  createdAt: true,
  updatedAt: true,
  cohortMemberships: {
    select: { cohort: { select: { id: true, name: true } } },
  },
  selfAssessorAssignments: {
    take: 1,
    where: { active: true },
    select: { facilitatorId: true },
  },
} as const;

/** A user row as selected above — safe to return, not yet flattened. */
export type SafeUserRow = Prisma.UserGetPayload<{
  select: typeof SAFE_USER_SELECT;
}>;

@Injectable()
export class AssignmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    facilitatorId: string;
    selfAssessorId: string;
    cohortId: string;
  }): Promise<MentorAssignment> {
    return this.prisma.mentorAssignment.create({ data });
  }

  findById(id: string): Promise<MentorAssignment | null> {
    return this.prisma.mentorAssignment.findUnique({ where: { id } });
  }

  delete(id: string): Promise<MentorAssignment> {
    return this.prisma.mentorAssignment.delete({ where: { id } });
  }

  /** The cohort a student belongs to (assignments are cohort-scoped). */
  async cohortIdForStudent(userId: string): Promise<string | null> {
    const row = await this.prisma.cohortMember.findFirst({
      where: { userId },
      select: { cohortId: true },
    });
    return row?.cohortId ?? null;
  }

  findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.MentorAssignmentWhereInput;
  }): Promise<MentorAssignment[]> {
    return this.prisma.mentorAssignment.findMany({
      where: params?.where,
      orderBy: { createdAt: 'desc' },
      skip: params?.skip,
      take: params?.take,
    });
  }

  count(where?: Prisma.MentorAssignmentWhereInput): Promise<number> {
    return this.prisma.mentorAssignment.count({ where });
  }

  /**
   * Retire every active assignment a student currently holds, so a reassignment
   * cannot leave them on two facilitators' rosters at once. Rows are kept rather
   * than deleted — assessment history references the assignment that was in
   * force at the time.
   */
  async deactivateForStudent(
    selfAssessorId: string,
    exceptFacilitatorId?: string,
  ): Promise<void> {
    await this.prisma.mentorAssignment.updateMany({
      where: {
        selfAssessorId,
        active: true,
        ...(exceptFacilitatorId
          ? { facilitatorId: { not: exceptFacilitatorId } }
          : {}),
      },
      data: { active: false },
    });
  }

  /** An existing row for this exact trio, whatever its active flag. */
  findByTrio(data: {
    facilitatorId: string;
    selfAssessorId: string;
    cohortId: string;
  }): Promise<MentorAssignment | null> {
    return this.prisma.mentorAssignment.findUnique({
      where: {
        facilitatorId_selfAssessorId_cohortId: data,
      },
    });
  }

  /** Bring a previously-retired assignment back into force. */
  reactivate(id: string): Promise<MentorAssignment> {
    return this.prisma.mentorAssignment.update({
      where: { id },
      data: { active: true },
    });
  }

  /** Active students assigned to a facilitator. Shaped by the service. */
  async studentsForFacilitator(facilitatorId: string): Promise<SafeUserRow[]> {
    const rows = await this.prisma.mentorAssignment.findMany({
      where: { facilitatorId, active: true },
      select: { selfAssessor: { select: SAFE_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => row.selfAssessor);
  }

  async studentIdsForFacilitator(facilitatorId: string): Promise<string[]> {
    const rows = await this.prisma.mentorAssignment.findMany({
      where: { facilitatorId, active: true },
      select: { selfAssessorId: true },
    });
    return rows.map((row) => row.selfAssessorId);
  }

  async isAssigned(
    facilitatorId: string,
    selfAssessorId: string,
  ): Promise<boolean> {
    const count = await this.prisma.mentorAssignment.count({
      where: { facilitatorId, selfAssessorId, active: true },
    });
    return count > 0;
  }

  /** The active facilitator for a student (used to notify on self-submission). */
  async facilitatorIdForStudent(
    selfAssessorId: string,
  ): Promise<string | null> {
    const row = await this.prisma.mentorAssignment.findFirst({
      where: { selfAssessorId, active: true },
      select: { facilitatorId: true },
      orderBy: { createdAt: 'desc' },
    });
    return row?.facilitatorId ?? null;
  }
}
