import { Injectable, NotFoundException } from '@nestjs/common';
import { DimensionsRepository } from './dimensions.repository';
import { CohortsService } from '../cohorts/cohorts.service';
import { CreateDimensionDto } from './dto/create-dimension.dto';
import { UpdateDimensionDto } from './dto/update-dimension.dto';
import { Dimension } from '../../../generated/prisma/client';

@Injectable()
export class DimensionsService {
  constructor(
    private readonly dimensionsRepository: DimensionsRepository,
    private readonly cohortsService: CohortsService,
  ) {}

  async create(cohortId: string, dto: CreateDimensionDto): Promise<Dimension> {
    await this.cohortsService.findOne(cohortId);
    return this.dimensionsRepository.create({
      cohort: { connect: { id: cohortId } },
      name: dto.name,
      description: dto.description,
      order: dto.order ?? 0,
      isActive: dto.isActive ?? true,
    });
  }

  async findByCohort(cohortId: string): Promise<Dimension[]> {
    await this.cohortsService.findOne(cohortId);
    return this.dimensionsRepository.findByCohort(cohortId);
  }

  /** Active dimensions used to seed assessment scores when a period opens. */
  findActiveByCohort(cohortId: string): Promise<Dimension[]> {
    return this.dimensionsRepository.findActiveByCohort(cohortId);
  }

  async findOne(id: string): Promise<Dimension> {
    const dimension = await this.dimensionsRepository.findById(id);
    if (!dimension) throw new NotFoundException(`Dimension ${id} not found`);
    return dimension;
  }

  async update(id: string, dto: UpdateDimensionDto): Promise<Dimension> {
    await this.findOne(id);
    return this.dimensionsRepository.update(id, {
      name: dto.name,
      description: dto.description,
      order: dto.order,
      isActive: dto.isActive,
    });
  }

  /** Soft-deactivate — preserves historical scores that reference this dimension. */
  async deactivate(id: string): Promise<void> {
    await this.findOne(id);
    await this.dimensionsRepository.update(id, { isActive: false });
  }
}
