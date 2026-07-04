import { PartialType } from '@nestjs/swagger';
import { CreateCohortDto } from './create-cohort.dto';

/** All CreateCohort fields optional; `scoringScaleMax` may be adjusted here. */
export class UpdateCohortDto extends PartialType(CreateCohortDto) {}
