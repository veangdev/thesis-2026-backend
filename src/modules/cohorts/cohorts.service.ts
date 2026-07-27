import { Injectable, NotFoundException } from '@nestjs/common';
import { CohortWithMemberCount, CohortsRepository } from './cohorts.repository';
import { CreateCohortDto } from './dto/create-cohort.dto';
import { UpdateCohortDto } from './dto/update-cohort.dto';
import { CohortQueryDto } from './dto/cohort-query.dto';
import { CohortResponseDto } from './dto/cohort-response.dto';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { Cohort, Prisma } from '../../../generated/prisma/client';

@Injectable()
export class CohortsService {
  constructor(private readonly cohortsRepository: CohortsRepository) {}

  async create(dto: CreateCohortDto): Promise<CohortResponseDto> {
    return this.toResponse(
      await this.cohortsRepository.create({
        name: dto.name,
        description: dto.description,
        startDate: new Date(dto.startDate),
        expectedEndDate: new Date(dto.expectedEndDate),
        scoringScaleMax: dto.scoringScaleMax ?? 5,
        status: dto.status,
      }),
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

  async findOne(id: string): Promise<CohortResponseDto> {
    const cohort = await this.cohortsRepository.findById(id);
    if (!cohort) throw new NotFoundException(`Cohort ${id} not found`);
    return this.toResponse(cohort);
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
    return this.toResponse(await this.cohortsRepository.update(id, data));
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
