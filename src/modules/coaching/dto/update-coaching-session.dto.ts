import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CoachingScope, CoachingStatus } from '../../../common/enums';

export class UpdateCoachingSessionDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ enum: CoachingScope })
  @IsEnum(CoachingScope)
  @IsOptional()
  scope?: CoachingScope;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ enum: CoachingStatus })
  @IsEnum(CoachingStatus)
  @IsOptional()
  status?: CoachingStatus;

  @ApiPropertyOptional({ description: 'Follow-up date (ISO)' })
  @IsDateString()
  @IsOptional()
  followUpAt?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Replaces the participant list wholesale when supplied',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  participantIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Replaces the target dimension list wholesale when supplied',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetDimensionIds?: string[];

  @ApiPropertyOptional({ description: 'Reassign the session to a cohort' })
  @IsString()
  @IsOptional()
  cohortId?: string;
}
