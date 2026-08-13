import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CohortStatus } from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * `GET /cohorts` filters, on top of pagination.
 *
 * Declared so `?search=` and `?status=` are applied in SQL. Without them the
 * global `ValidationPipe({ forbidNonWhitelisted: true })` would 400 the
 * request, which is what pushed the frontend into filtering a single page
 * client-side — and that silently drops matches on every page but the first.
 */
export class CohortQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match on cohort name' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: CohortStatus })
  @IsEnum(CohortStatus)
  @IsOptional()
  status?: CohortStatus;
}
