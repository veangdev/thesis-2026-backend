import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class MentorScoreItemDto {
  @ApiProperty({ description: 'Dimension being scored' })
  @IsString()
  @IsNotEmpty()
  dimensionId: string;

  @ApiPropertyOptional({ description: 'Mentor score (1..cohort scale max)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  mentorScore?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mentorNote?: string;

  @ApiPropertyOptional({
    description: 'Final agreed score (1..cohort scale max)',
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  agreedScore?: number;
}

export class UpdateMentorAssessmentDto {
  @ApiProperty({ type: [MentorScoreItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MentorScoreItemDto)
  scores: MentorScoreItemDto[];
}
