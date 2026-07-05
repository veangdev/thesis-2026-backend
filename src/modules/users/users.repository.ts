import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, User } from '../../../generated/prisma/client';

/**
 * Data-access layer for the User model. The service layer talks to this
 * repository rather than to PrismaService directly.
 */
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
  }): Promise<User[]> {
    return this.prisma.user.findMany({
      where: params?.where,
      orderBy: { createdAt: 'desc' },
      skip: params?.skip,
      take: params?.take,
    });
  }

  count(where?: Prisma.UserWhereInput): Promise<number> {
    return this.prisma.user.count({ where });
  }

  /**
   * Create many users (optionally enrolling each into a cohort) atomically — a
   * duplicate email or any other failure rolls the whole batch back.
   */
  createMany(
    records: Prisma.UserCreateInput[],
    cohortId?: string,
  ): Promise<User[]> {
    return this.prisma.$transaction(async (tx) => {
      const created: User[] = [];
      for (const data of records) {
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

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
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
