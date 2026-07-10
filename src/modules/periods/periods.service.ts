import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PeriodsRepository } from './periods.repository';
import { CohortsService } from '../cohorts/cohorts.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { CreatePeriodDto } from './dto/create-period.dto';
import { UpdatePeriodDto } from './dto/update-period.dto';
import { AssessmentPeriodStatus } from '../../common/enums';
import { AssessmentPeriod, Prisma } from '../../../generated/prisma/client';

@Injectable()
export class PeriodsService {
  constructor(
    private readonly periodsRepository: PeriodsRepository,
    private readonly cohortsService: CohortsService,
    private readonly assessmentsService: AssessmentsService,
  ) {}

  async create(
    cohortId: string,
    dto: CreatePeriodDto,
  ): Promise<AssessmentPeriod> {
    await this.cohortsService.findOne(cohortId);
    return this.periodsRepository.create({
      cohort: { connect: { id: cohortId } },
      name: dto.name,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
    });
  }

  async findByCohort(cohortId: string): Promise<AssessmentPeriod[]> {
    await this.cohortsService.findOne(cohortId);
    return this.periodsRepository.findByCohort(cohortId);
  }

  async findOne(id: string): Promise<AssessmentPeriod> {
    const period = await this.periodsRepository.findById(id);
    if (!period) throw new NotFoundException(`Period ${id} not found`);
    return period;
  }

  /**
   * Updates a period. Opening it (status → `open`) generates the draft
   * assessments for every active student in the cohort and notifies them.
   */
  async update(id: string, dto: UpdatePeriodDto): Promise<AssessmentPeriod> {
    const period = await this.findOne(id);

    const data: Prisma.AssessmentPeriodUpdateInput = {
      name: dto.name,
      status: dto.status,
    };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);

    const updated = await this.periodsRepository.update(id, data);

    const isOpening =
      dto.status === AssessmentPeriodStatus.open &&
      period.status !== AssessmentPeriodStatus.open;
    if (isOpening) {
      await this.assessmentsService.generateForPeriod(updated);
    }

    return updated;
  }

  /**
   * Deletes a period. Only `upcoming` periods can be removed — once a cycle is
   * opened it has generated assessments and scores that must be preserved.
   */
  async remove(id: string): Promise<void> {
    const period = await this.findOne(id);
    if (period.status !== AssessmentPeriodStatus.upcoming) {
      throw new BadRequestException(
        'Only upcoming periods can be deleted; open or completed cycles are kept for their assessment history.',
      );
    }
    await this.periodsRepository.delete(id);
  }
}
