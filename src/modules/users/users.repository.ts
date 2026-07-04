import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { Prisma, User } from '../../../generated/prisma/client';

/**
 * Data-access layer for the User model. The service layer talks to this
 * repository rather than to PrismaService directly.
 */
@Injectable()
export class UsersRepository extends BaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput
> {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

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

  addToCohort(userId: string, cohortId: string): Promise<unknown> {
    return this.prisma.cohortMember.create({ data: { userId, cohortId } });
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
