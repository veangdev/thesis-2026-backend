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

export class SelfScoreItemDto {
  @ApiProperty({ description: 'Dimension being scored' })
  @IsString()
  @IsNotEmpty()
  dimensionId: string;

  @ApiPropertyOptional({ description: 'Self score (1..cohort scale max)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  selfScore?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  selfReflection?: string;
}

export class UpdateSelfAssessmentDto {
  @ApiProperty({ type: [SelfScoreItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SelfScoreItemDto)
  scores: SelfScoreItemDto[];
}
