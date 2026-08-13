import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CoachingScope, CoachingStatus } from '../../../common/enums';

export class CoachingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by facilitator id' })
  @IsString()
  @IsOptional()
  facilitatorId?: string;

  @ApiPropertyOptional({
    description: 'Filter to sessions with this participant',
  })
  @IsString()
  @IsOptional()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Filter by the session cohort' })
  @IsString()
  @IsOptional()
  cohortId?: string;

  @ApiPropertyOptional({ enum: CoachingStatus })
  @IsEnum(CoachingStatus)
  @IsOptional()
  status?: CoachingStatus;

  @ApiPropertyOptional({ enum: CoachingScope })
  @IsEnum(CoachingScope)
  @IsOptional()
  scope?: CoachingScope;

  @ApiPropertyOptional({ description: 'Scheduled at or after (ISO date)' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Scheduled at or before (ISO date)' })
  @IsDateString()
  @IsOptional()
  to?: string;
}
