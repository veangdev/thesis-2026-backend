import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Ceiling on `pageSize` for ordinary, incrementally-paged list endpoints. */
export const DEFAULT_MAX_PAGE_SIZE = 100;

/**
 * Ceiling for the roster endpoints. The coordinator roster screens derive
 * per-row facts across the whole roster (which facilitator a student belongs
 * to, who is assignable) rather than showing one server page at a time, so they
 * ask for the full list in one request. Capping them at
 * `DEFAULT_MAX_PAGE_SIZE` does not make those screens paginate — it makes them
 * compute over a truncated set and quietly render wrong totals.
 */
export const ROSTER_MAX_PAGE_SIZE = 500;

/**
 * Standard `?page=&pageSize=` query for list endpoints, as a mixin so an
 * endpoint can raise its own `pageSize` ceiling.
 *
 * A subclass cannot simply redeclare `pageSize` with a larger `@Max`:
 * class-validator collects constraints from the whole prototype chain, so the
 * inherited `@Max(100)` would still run and the stricter of the two would win.
 * Generating a fresh base class per ceiling keeps exactly one `@Max` in play.
 */
export function PaginationQuery(
  maxPageSize: number = DEFAULT_MAX_PAGE_SIZE,
): new () => { page?: number; pageSize?: number } {
  class PaginationQueryBase {
    @ApiPropertyOptional({ default: 1, minimum: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    page?: number = 1;

    @ApiPropertyOptional({ default: 20, minimum: 1, maximum: maxPageSize })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(maxPageSize)
    @IsOptional()
    pageSize?: number = 20;
  }
  return PaginationQueryBase;
}

/** Standard `?page=&pageSize=` query for list endpoints. */
export class PaginationQueryDto extends PaginationQuery() {}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

/** Shared list envelope: `{ data: [...], meta: { page, pageSize, total } }`. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): Paginated<T> {
  return { data, meta: { page, pageSize, total } };
}
