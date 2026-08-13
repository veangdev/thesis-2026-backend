import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { GoalStatus } from '../../../common/enums';

export class GoalQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by self-assessor id' })
  @IsString()
  @IsOptional()
  studentId?: string;

  @ApiPropertyOptional({ enum: GoalStatus, description: 'Filter by lifecycle' })
  @IsEnum(GoalStatus)
  @IsOptional()
  status?: GoalStatus;
}
