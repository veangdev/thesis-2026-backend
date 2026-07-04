import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/** `GET /users` filters, on top of pagination. */
export class UserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Role })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ description: 'Only users belonging to this cohort' })
  @IsString()
  @IsOptional()
  cohortId?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive match on name or email',
  })
  @IsString()
  @IsOptional()
  search?: string;
}
