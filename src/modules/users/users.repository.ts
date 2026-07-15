import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, User } from '../../../generated/prisma/client';

/**
 * Data-access layer for the User model. The service layer talks to this
 * repository rather than to PrismaService directly.
 */
/** Pull each user's (single) cohort membership so the API can expose it. */
const WITH_COHORT = {
  cohortMemberships: {
    take: 1,
    include: { cohort: { select: { id: true, name: true } } },
  },
} satisfies Prisma.UserInclude;

export type UserWithCohort = Prisma.UserGetPayload<{
  include: typeof WITH_COHORT;
}>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.UserWhereInput;
  }): Promise<UserWithCohort[]> {
    return this.prisma.user.findMany({
      where: params?.where,
      orderBy: { createdAt: 'desc' },
      skip: params?.skip,
      take: params?.take,
      include: WITH_COHORT,
    });
  }

  cohortExists(cohortId: string): Promise<number> {
    return this.prisma.cohort.count({ where: { id: cohortId } });
  }

  /** Set the user's cohort, replacing any existing membership (one per user). */
  async setCohort(userId: string, cohortId: string): Promise<void> {
    await this.prisma.cohortMember.deleteMany({ where: { userId } });
    await this.prisma.cohortMember.create({ data: { userId, cohortId } });
  }

  count(where?: Prisma.UserWhereInput): Promise<number> {
    return this.prisma.user.count({ where });
  }

  /**
   * Create many users (optionally enrolling each into a cohort) atomically — a
   * duplicate email or any other failure rolls the whole batch back.
   */
  createMany(
    records: Array<{ data: Prisma.UserCreateInput; cohortId?: string }>,
  ): Promise<User[]> {
    return this.prisma.$transaction(async (tx) => {
      const created: User[] = [];
      for (const { data, cohortId } of records) {
        const user = await tx.user.create({ data });
        if (cohortId) {
          await tx.cohortMember.create({
            data: { userId: user.id, cohortId },
          });
        }
        created.push(user);
      }
      return created;
    });
  }

  findById(id: string): Promise<UserWithCohort | null> {
    return this.prisma.user.findUnique({ where: { id }, include: WITH_COHORT });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  delete(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }
}
