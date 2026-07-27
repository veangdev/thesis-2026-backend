import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CohortStatus } from '../../../common/enums';

export class CreateCohortDto {
  @ApiProperty({ example: 'Batch 2026 — Software Engineering' })
  @IsString()
  @IsNotEmpty()
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
