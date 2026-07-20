import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { AssessmentStatus } from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class AssessmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by self-assessor id' })
  @IsString()
  @IsOptional()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Filter by period id' })
  @IsString()
  @IsOptional()
  periodId?: string;

  @ApiPropertyOptional({ enum: AssessmentStatus })
  @IsEnum(AssessmentStatus)
  @IsOptional()
  status?: AssessmentStatus;

  @ApiPropertyOptional({
    description: 'When true, restrict to the caller’s own assessments',
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  mine?: boolean;
}
