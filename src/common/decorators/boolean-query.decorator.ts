import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * An optional `?flag=true|false` query parameter.
 *
 * Query strings carry no types, so a boolean needs converting — but the global
 * pipe runs with `enableImplicitConversion: true`, which converts using the
 * declared TypeScript type. For a `boolean` that means `Boolean('false')`, which
 * is `true`: the string `'false'` arrives as `true` and the distinction is gone
 * before any `@Transform` can read it. `@Type(() => String)` keeps the raw
 * string intact so the value below is interpreted rather than coerced.
 *
 * Omitting the parameter leaves the property `undefined`, which callers must
 * treat as "no filter" — distinct from an explicit `false`.
 */
export function BooleanQuery(description?: string): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ type: Boolean, description }),
    Type(() => String),
    Transform(({ value }) => value === true || value === 'true'),
    IsBoolean(),
    IsOptional(),
  );
}
