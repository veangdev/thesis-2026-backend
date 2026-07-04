import { Injectable, NotFoundException } from '@nestjs/common';
import { CohortsRepository } from './cohorts.repository';
import { CreateCohortDto } from './dto/create-cohort.dto';
import { UpdateCohortDto } from './dto/update-cohort.dto';
import {
  Paginated,
  PaginationQueryDto,
  paginate,
} from '../../common/dto/pagination.dto';
import { Cohort, Prisma } from '../../../generated/prisma/client';

@Injectable()
export class CohortsService {
  constructor(private readonly cohortsRepository: CohortsRepository) {}

  create(dto: CreateCohortDto): Promise<Cohort> {
    return this.cohortsRepository.create({
      name: dto.name,
      startDate: new Date(dto.startDate),
      expectedEndDate: new Date(dto.expectedEndDate),
      scoringScaleMax: dto.scoringScaleMax ?? 5,
    });
  }

  async findAll(pagination: PaginationQueryDto): Promise<Paginated<Cohort>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? 20;
    const [data, total] = await Promise.all([
      this.cohortsRepository.findAll({
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.cohortsRepository.count(),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string): Promise<Cohort> {
    const cohort = await this.cohortsRepository.findById(id);
    if (!cohort) throw new NotFoundException(`Cohort ${id} not found`);
    return cohort;
  }

  async update(id: string, dto: UpdateCohortDto): Promise<Cohort> {
    await this.findOne(id);
    const data: Prisma.CohortUpdateInput = {
      name: dto.name,
      scoringScaleMax: dto.scoringScaleMax,
    };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.expectedEndDate)
      data.expectedEndDate = new Date(dto.expectedEndDate);
    return this.cohortsRepository.update(id, data);
  }
}
