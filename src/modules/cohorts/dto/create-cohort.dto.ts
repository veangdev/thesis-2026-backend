import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CohortStatus } from '../../../common/enums';

/**
 * Canonical batch name. A batch **is** its intake year, so the name carries the
 * year and nothing else — this pattern is what turns the unique index on
 * `cohorts.name` into a uniqueness rule about the *year*. Allowing a qualifier
 * ("Batch 2026 — Data Science") would let two rows describe one generation and
 * still satisfy the index.
 */
export const BATCH_NAME_PATTERN = /^Batch (20\d{2})$/;

export class CreateCohortDto {
  @ApiProperty({
    example: 'Batch 2026',
    description:
      'Exactly `Batch YYYY`. One batch per intake year — put the track, scale or any other qualifier in `description`, never in the name.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(BATCH_NAME_PATTERN, {
    message:
      'name must be exactly "Batch YYYY" (e.g. "Batch 2026") — a batch is identified by its intake year alone; put the track in description',
  })
  name: string;

  @ApiPropertyOptional({
    example: 'Full-stack track. Two-year programme on a 5-point scale.',
    description: 'Free-text summary shown on the cohort card',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '2026-01-15T00:00:00.000Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    example: '2028-01-15T00:00:00.000Z',
    description: 'Expected end date (typically ~2 years after start)',
  })
  @IsDateString()
  expectedEndDate: string;

  @ApiPropertyOptional({
    enum: [5, 10],
    default: 5,
    description: 'Maximum score on the assessment scale (5 or 10)',
  })
  @IsIn([5, 10])
  @IsOptional()
  scoringScaleMax?: number;

  @ApiPropertyOptional({
    enum: CohortStatus,
    default: CohortStatus.active,
    description:
      'Lifecycle state. Only `active` cohorts count towards the coordinator overview KPI.',
  })
  @IsEnum(CohortStatus)
  @IsOptional()
  status?: CohortStatus;
}
