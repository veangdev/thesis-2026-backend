import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CohortWithMemberCount, CohortsRepository } from './cohorts.repository';
import { CreateCohortDto } from './dto/create-cohort.dto';
import { UpdateCohortDto } from './dto/update-cohort.dto';
import { CohortQueryDto } from './dto/cohort-query.dto';
import { CohortResponseDto } from './dto/cohort-response.dto';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { Cohort, Prisma } from '../../../generated/prisma/client';

@Injectable()
export class CohortsService {
  constructor(private readonly cohortsRepository: CohortsRepository) {}

  async create(dto: CreateCohortDto): Promise<CohortResponseDto> {
    return this.toResponse(
      await this.asConflict(dto.name, () =>
        this.cohortsRepository.create({
          name: dto.name,
          description: dto.description,
          startDate: new Date(dto.startDate),
          expectedEndDate: new Date(dto.expectedEndDate),
          scoringScaleMax: dto.scoringScaleMax ?? 5,
          status: dto.status,
        }),
      ),
    );
  }

  async findAll(query: CohortQueryDto): Promise<Paginated<CohortResponseDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildWhere(query);
    const [data, total] = await Promise.all([
      this.cohortsRepository.findAll({
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      this.cohortsRepository.count(where),
    ]);
    return paginate(
      data.map((cohort) => this.toResponse(cohort)),
      total,
      page,
      pageSize,
    );
  }

  async findOne(
    id: string,
    user?: AuthenticatedUser,
  ): Promise<CohortResponseDto> {
    const cohort = await this.cohortsRepository.findById(id);
    if (!cohort) throw new NotFoundException(`Cohort ${id} not found`);
    await this.assertCanRead(id, user);
    return this.toResponse(cohort);
  }

  /**
   * Self-assessors may read **their own** cohort, and only that one.
   *
   * They need it: the scoring scale and the dimension list come from the cohort,
   * and without them the self-assessment wizard cannot render at all. Staff keep
   * unrestricted read access, so this narrows nothing that worked before — it
   * opens exactly the row the caller is enrolled in.
   */
  async assertCanRead(
    cohortId: string,
    user?: AuthenticatedUser,
  ): Promise<void> {
    if (!user || user.role !== Role.self_assessor) return;
    const isMember = await this.cohortsRepository.isMember(cohortId, user.id);
    if (!isMember) {
      throw new ForbiddenException('You are not enrolled in this cohort');
    }
  }

  /**
   * The bare row, for internal callers that only need existence or a scalar
   * like `scoringScaleMax`. Kept separate from `findOne` so those paths don't
   * pay for the membership aggregate on every call.
   */
  async findRaw(id: string): Promise<Cohort> {
    const cohort = await this.cohortsRepository.findRawById(id);
    if (!cohort) throw new NotFoundException(`Cohort ${id} not found`);
    return cohort;
  }

  async update(id: string, dto: UpdateCohortDto): Promise<CohortResponseDto> {
    await this.findRaw(id);
    const data: Prisma.CohortUpdateInput = {
      name: dto.name,
      description: dto.description,
      scoringScaleMax: dto.scoringScaleMax,
      status: dto.status,
    };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.expectedEndDate)
      data.expectedEndDate = new Date(dto.expectedEndDate);
    return this.toResponse(
      await this.asConflict(dto.name, () =>
        this.cohortsRepository.update(id, data),
      ),
    );
  }

  /**
   * Turns the unique-index violation on `cohorts.name` into a 409 that names
   * the offending batch, instead of the raw P2002 the client would otherwise
   * see as a 500. `name` is pinned to `Batch YYYY` by the DTO, so a collision
   * here always means "that intake year already has a batch" — the one thing
   * the caller needs told. Other Prisma errors are rethrown untouched.
   */
  private async asConflict<T>(
    name: string | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `${name ?? 'That batch'} already exists — one batch per intake year`,
        );
      }
      throw error;
    }
  }

  private buildWhere(query: CohortQueryDto): Prisma.CohortWhereInput {
    const where: Prisma.CohortWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    return where;
  }

  /** Flattens the membership aggregate onto the scalar `studentCount`. */
  private toResponse(cohort: CohortWithMemberCount): CohortResponseDto {
    const { _count, ...rest } = cohort;
    return { ...rest, studentCount: _count.members };
  }
}
