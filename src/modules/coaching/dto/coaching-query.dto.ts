import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

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

  @ApiPropertyOptional({ description: 'Scheduled at or after (ISO date)' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Scheduled at or before (ISO date)' })
  @IsDateString()
  @IsOptional()
  to?: string;
}
