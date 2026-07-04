import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCohortDto {
  @ApiProperty({ example: 'Batch 2026 — Software Engineering' })
  @IsString()
  @IsNotEmpty()
  name: string;

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
}
