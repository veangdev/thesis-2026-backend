import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CoachingScope } from '../../../common/enums';

export class CreateCoachingSessionDto {
  @ApiProperty({ example: 'Presentation skills workshop' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ enum: CoachingScope })
  @IsEnum(CoachingScope)
  scope: CoachingScope;

  @ApiProperty({ example: '2026-07-10T09:00:00.000Z' })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({ default: 60 })
  @IsInt()
  @Min(1)
  @IsOptional()
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Explicit participant student ids (for individual scope)',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  participantIds?: string[];

  @ApiPropertyOptional({
    description:
      'For group/class/batch scope — enrols every active student of this cohort',
  })
  @IsString()
  @IsOptional()
  cohortId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Target dimension ids' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetDimensionIds?: string[];
}
