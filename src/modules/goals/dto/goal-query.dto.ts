import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class GoalQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by self-assessor id' })
  @IsString()
  @IsOptional()
  studentId?: string;
}
