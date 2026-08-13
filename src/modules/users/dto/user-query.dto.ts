import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { Gender, Role, StudentClass } from '../../../common/enums';
import {
  PaginationQuery,
  ROSTER_MAX_PAGE_SIZE,
} from '../../../common/dto/pagination.dto';

/** Sort keys the roster screens offer. */
export const USER_SORT_KEYS = ['name', 'gender', 'class'] as const;
export type UserSortKey = (typeof USER_SORT_KEYS)[number];

/**
 * `GET /users` filters, on top of pagination.
 *
 * Every filter and sort key the frontend sends must be declared here: the
 * global `ValidationPipe({ forbidNonWhitelisted: true })` rejects an undeclared
 * query param with a 400 rather than ignoring it.
 *
 * Paged with the roster ceiling: the coordinator roster screens fetch a whole
 * roster in one request to derive per-row facts across it.
 */
export class UserQueryDto extends PaginationQuery(ROSTER_MAX_PAGE_SIZE) {
  @ApiPropertyOptional({ enum: Role })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ description: 'Only users belonging to this cohort' })
  @IsString()
  @IsOptional()
  cohortId?: string;

  @ApiPropertyOptional({
    description:
      'Only self-assessors actively assigned to this facilitator, resolved through MentorAssignment',
  })
  @IsString()
  @IsOptional()
  facilitatorId?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ enum: StudentClass })
  @IsEnum(StudentClass)
  @IsOptional()
  studentClass?: StudentClass;

  @ApiPropertyOptional({
    description:
      'Account status. The frontend models this as active/inactive; the wire format is the boolean the column actually stores.',
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Case-insensitive match on name, email or student ID (studentCode)',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    enum: USER_SORT_KEYS,
    description: 'Defaults to newest first when omitted',
  })
  @IsIn(USER_SORT_KEYS)
  @IsOptional()
  sortBy?: UserSortKey;
}
