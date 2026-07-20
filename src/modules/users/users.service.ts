import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersRepository, UserWithCohort } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import { Role } from '../../common/enums';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { BulkCreateUsersDto } from './dto/bulk-create-users.dto';
import { Prisma, User } from '../../../generated/prisma/client';

const SALT_ROUNDS = 12;

/** Today as YYYY-MM-DD, in the server's local calendar. */
function todayKey(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Canonical form for stored tags: trimmed, blank-free, case-insensitively
 * deduped, and ordered — so the column reads the same no matter which client
 * wrote it.
 */
function normaliseTags(tags: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of tags) {
    const tag = raw.trim();
    // First spelling wins: re-typing a tag shouldn't restyle the original.
    if (tag && !seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Canonical form for availability: deduped, sorted, and pruned of past days.
 * Without the prune the array grows without bound as time passes, since a
 * client only ever sends back the days it is currently showing.
 */
function normaliseAvailability(days: string[]): string[] {
  const today = todayKey();
  return [...new Set(days)].filter((day) => day >= today).sort();
}

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(dto: CreateUserDto): Promise<AuthenticatedUser> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    const { password, cohortId, ...rest } = dto;
    // Validate the cohort before creating so a bad id can't orphan a new user.
    if (cohortId) await this.assertCohortExists(cohortId);
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.usersRepository.create({ ...rest, passwordHash });
    if (cohortId) await this.usersRepository.setCohort(user.id, cohortId);
    return this.findOne(user.id);
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

  /**
   * Bulk-create users — atomic. `cohortId` is a relation (not a User column),
   * so it's pulled out of each record and each user is enrolled into their own
   * cohort (falling back to the batch-level `cohortId` when a row omits one).
   */
  async createMany(dto: BulkCreateUsersDto): Promise<AuthenticatedUser[]> {
    const records = await Promise.all(
      dto.users.map(async ({ password, cohortId, ...rest }) => ({
        data: {
          ...rest,
          passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
        },
        cohortId: cohortId ?? dto.cohortId,
      })),
    );
    const created = await this.usersRepository.createMany(records);
    return created.map((user) => this.sanitize(user));
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
  findByEmail(email: string): Promise<UserWithCohort | null> {
    return this.usersRepository.findByEmail(email);
  }

  /** Same as `findByEmail` but by id — auth layer only (password changes). */
  findByIdWithSecrets(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async update(id: string, dto: UpdateUserDto): Promise<AuthenticatedUser> {
    await this.findOne(id);
    const { cohortId, ...rest } = dto;
    if (cohortId) await this.assertCohortExists(cohortId);
    await this.usersRepository.update(id, rest);
    if (cohortId) await this.usersRepository.setCohort(id, cohortId);
    return this.findOne(id);
  }

  /**
   * Self-service profile update. Only the narrow set of fields on `UpdateMeDto`
   * can be changed — role, email and cohort remain coordinator-controlled.
   *
   * Coaching fields are facilitator-only. Rather than 400 on a field the
   * caller cannot own, they are dropped: the DTO documents them as ignored for
   * other roles, and a self-assessor sending one is a client bug, not an
   * attack worth failing the whole request over.
   */
  async updateMe(id: string, dto: UpdateMeDto): Promise<AuthenticatedUser> {
    const current = await this.findOne(id);
    const isFacilitator = current.role === Role.facilitator;

    await this.usersRepository.update(id, {
      name: dto.name,
      expertiseTags:
        isFacilitator && dto.expertiseTags
          ? normaliseTags(dto.expertiseTags)
          : undefined,
      availability:
        isFacilitator && dto.availability
          ? normaliseAvailability(dto.availability)
          : undefined,
    });
    return this.findOne(id);
  }

  /** Stores the public URL of a freshly uploaded avatar. */
  async setAvatar(id: string, avatarUrl: string): Promise<AuthenticatedUser> {
    await this.findOne(id);
    await this.usersRepository.update(id, { avatarUrl });
    return this.findOne(id);
  }

  private async assertCohortExists(cohortId: string): Promise<void> {
    const exists = await this.usersRepository.cohortExists(cohortId);
    if (!exists) throw new NotFoundException(`Cohort ${cohortId} not found`);
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

  /**
   * Strips the password hash so it can never leak through a response, and
   * flattens the user's cohort membership onto `cohortId`/`cohortName`.
   */
  sanitize(
    user: User & {
      cohortMemberships?: Array<{ cohort: { id: string; name: string } }>;
    },
  ): AuthenticatedUser {
    const { passwordHash: _passwordHash, cohortMemberships, ...safe } = user;
    void _passwordHash;
    const cohort = cohortMemberships?.[0]?.cohort ?? null;
    return {
      ...safe,
      cohortId: cohort?.id ?? null,
      cohortName: cohort?.name ?? null,
    };
  }
}
