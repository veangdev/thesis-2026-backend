import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { BulkCreateUsersDto } from './dto/bulk-create-users.dto';
import { Prisma, User } from '../../../generated/prisma/client';

const SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(dto: CreateUserDto): Promise<AuthenticatedUser> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    const { password, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.usersRepository.create({ ...rest, passwordHash });
    return this.sanitize(user);
  }

  async findAll(query: UserQueryDto): Promise<Paginated<AuthenticatedUser>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildWhere(query);
    const [users, total] = await Promise.all([
      this.usersRepository.findAll({
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      this.usersRepository.count(where),
    ]);
    return paginate(
      users.map((user) => this.sanitize(user)),
      total,
      page,
      pageSize,
    );
  }

  /** Bulk-create users, optionally adding each to a cohort in one call. */
  async createMany(dto: BulkCreateUsersDto): Promise<AuthenticatedUser[]> {
    const created: AuthenticatedUser[] = [];
    for (const userDto of dto.users) {
      const user = await this.create(userDto);
      if (dto.cohortId) {
        await this.usersRepository.addToCohort(user.id, dto.cohortId);
      }
      created.push(user);
    }
    return created;
  }

  private buildWhere(query: UserQueryDto): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.cohortId) {
      where.cohortMemberships = { some: { cohortId: query.cohortId } };
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async findOne(id: string): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.sanitize(user);
  }

  /**
   * Returns the full user record including the password hash.
   * For internal use by the auth layer only — never expose this to HTTP.
   */
  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async update(id: string, dto: UpdateUserDto): Promise<AuthenticatedUser> {
    await this.findOne(id);
    const user = await this.usersRepository.update(id, dto);
    return this.sanitize(user);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.usersRepository.delete(id);
  }

  /** Hashes and stores a new password for the user (used by the reset flow). */
  async updatePassword(id: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.usersRepository.update(id, { passwordHash });
  }

  /** Strips the password hash so it can never leak through a response. */
  private sanitize(user: User): AuthenticatedUser {
    const { passwordHash: _passwordHash, ...safe } = user;
    void _passwordHash;
    return safe;
  }
}
