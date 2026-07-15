import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MentorAssignment } from '../../../generated/prisma/client';
import { AuthenticatedUser } from '../../common/interfaces';

/** Columns safe to expose for a user (never the password hash). */
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
  }): Promise<MentorAssignment[]> {
    return this.prisma.mentorAssignment.findMany({
      orderBy: { createdAt: 'desc' },
      skip: params?.skip,
      take: params?.take,
    });
  }

  count(): Promise<number> {
    return this.prisma.mentorAssignment.count();
  }

  /** Active students assigned to a facilitator, as sanitized user records. */
  async studentsForFacilitator(
    facilitatorId: string,
  ): Promise<AuthenticatedUser[]> {
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
