import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MilestoneDto {
  @ApiProperty({ example: 'Draft first presentation' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  done?: boolean;
}

export class CreateGoalDto {
  @ApiProperty({ example: 'Improve public speaking' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Dimension this goal targets' })
  @IsString()
  @IsOptional()
  targetDimensionId?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressPercent?: number;

  @ApiPropertyOptional({ type: [MilestoneDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  @IsOptional()
  milestones?: MilestoneDto[];

  @ApiPropertyOptional({
    description:
      'Target self-assessor (Coordinator only; self-assessors default to self)',
  })
  @IsString()
  @IsOptional()
  studentId?: string;
}
