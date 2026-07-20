import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { uploadsPublicPath } from '../../config/configuration';

/**
 * Uploaded files are stored as a path relative to the upload root
 * (`avatars/x.png`), never with the public prefix baked in. Changing
 * UPLOAD_PUBLIC_PATH then re-points every existing avatar instead of leaving
 * rows pointing at a URL that no longer resolves.
 *
 * The prefix is applied here, on the way out, so every response carries a
 * usable URL — `avatarUrl` is returned from the users, assessments,
 * assignments and coaching modules, and composing it in each of them would be
 * four places to forget.
 */
@Injectable()
export class AvatarUrlInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((body) => expand(body)));
  }
}

/** Absolute URLs are left alone: they did not come from our storage. */
function toPublicUrl(value: string): string {
  if (/^(https?:|data:|blob:|\/)/i.test(value)) return value;
  return `${uploadsPublicPath()}/${value}`;
}

function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (node === null || typeof node !== 'object') return node;
  // Dates, Buffers and the like must survive untouched.
  if (node instanceof Date || Buffer.isBuffer(node)) return node;

  const source = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] =
      key === 'avatarUrl' && typeof value === 'string'
        ? toPublicUrl(value)
        : expand(value);
  }
  return result;
}
