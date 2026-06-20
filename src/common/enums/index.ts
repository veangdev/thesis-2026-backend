/**
 * Single source of truth for role/status enums: re-exported from the generated
 * Prisma client so the application and database always agree. The generated
 * `Role`/`Status` are `const` objects plus matching union types, which work
 * with `@IsEnum()` and as TypeScript types.
 */
export { Role, Status } from '../../../generated/prisma/enums';
