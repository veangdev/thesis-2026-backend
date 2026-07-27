import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { AssessmentStatus } from '../../../common/enums';
import {
  PaginationQuery,
  ROSTER_MAX_PAGE_SIZE,
} from '../../../common/dto/pagination.dto';

/**
 * Paged at the roster ceiling rather than the default 100. The report and
 * review-queue screens derive per-cycle aggregates across a facilitator's whole
 * roster history — a roster average, a growth line, a zone split — so a page is
 * not a unit they can render. Capping them at `DEFAULT_MAX_PAGE_SIZE` does not
 * make them paginate; it makes them average a truncated set and show it as the
 * whole thing.
 */
export class AssessmentQueryDto extends PaginationQuery(ROSTER_MAX_PAGE_SIZE) {
  @ApiPropertyOptional({ description: 'Filter by self-assessor id' })
  @IsString()
  @IsOptional()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Filter by period id' })
  @IsString()
  @IsOptional()
  periodId?: string;

  @ApiPropertyOptional({
    description:
      'Filter by cohort, resolved through the assessment’s period. Narrows within whatever the caller’s role already permits — it never widens access.',
  })
  @IsString()
  @IsOptional()
  cohortId?: string;

  @ApiPropertyOptional({
    description:
      'Filter to self-assessors actively assigned to this facilitator. Narrows within the caller’s permitted scope only.',
  })
  @IsString()
  @IsOptional()
  facilitatorId?: string;

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
