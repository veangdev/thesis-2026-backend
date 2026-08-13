import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * `GET /audit-logs` filters, on top of pagination.
 *
 * Both filters have to run in SQL. Filtering a single fetched page in the
 * client looks like it works — the first page of results is correct — but it
 * silently drops every match beyond `pageSize` and reports a `total` for the
 * unfiltered set, so the pager disagrees with the rows on screen.
 */
export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive match on actor name, action or entity. The `metadata` blob is deliberately not searched — it is a `Json` column, so matching inside it would need a raw text cast and could not use an index.',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    example: 'User',
    description: 'Exact entity name, e.g. `User` or `Cohort`',
  })
  @IsString()
  @IsOptional()
  entity?: string;
}
