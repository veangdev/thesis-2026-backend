import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import {
  PaginationQuery,
  ROSTER_MAX_PAGE_SIZE,
} from '../../../common/dto/pagination.dto';

/**
 * `GET /assignments` filters, on top of pagination.
 *
 * Every filter the frontend sends must be declared here: the global
 * `ValidationPipe({ forbidNonWhitelisted: true })` rejects an undeclared query
 * param with a 400 rather than ignoring it.
 *
 * Paged with the roster ceiling — the coordinator team panel resolves a
 * student's assignment id out of the full list in order to unassign them, so a
 * truncated page means the row it needs may simply be missing.
 */
export class AssignmentQueryDto extends PaginationQuery(ROSTER_MAX_PAGE_SIZE) {
  @ApiPropertyOptional({
    description: 'Only assignments belonging to this cohort',
  })
  @IsString()
  @IsOptional()
  cohortId?: string;

  @ApiPropertyOptional({
    description: 'Only assignments held by this facilitator',
  })
  @IsString()
  @IsOptional()
  facilitatorId?: string;
}
