import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CoachingTag } from '../../../common/enums';

export class MentorScoreItemDto {
  @ApiProperty({ description: 'Dimension being scored' })
  @IsString()
  @IsNotEmpty()
  dimensionId: string;

  @ApiPropertyOptional({
    description: 'Facilitator score (1..cohort scale max)',
  })
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

  @ApiPropertyOptional({
    enum: CoachingTag,
    description:
      'The facilitator’s judgement on this dimension. Independent of the system-derived `coachingRecommended` flag, which is computed at completion and never accepted from a client.',
  })
  @IsEnum(CoachingTag)
  @IsOptional()
  coachingTag?: CoachingTag;
}

export class UpdateMentorAssessmentDto {
  @ApiProperty({ type: [MentorScoreItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MentorScoreItemDto)
  scores: MentorScoreItemDto[];

  @ApiPropertyOptional({
    description:
      'The facilitator’s closing summary, shared with the student once the cycle completes.',
  })
  @IsString()
  @IsOptional()
  overallFeedback?: string;

  @ApiPropertyOptional({
    description:
      'Advances mentor_review → agreed once the discussion concludes. Requires an agreed score on every dimension; the cycle can only be completed from `agreed`.',
  })
  @IsBoolean()
  @IsOptional()
  markAgreed?: boolean;
}
