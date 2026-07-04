import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Records every successful mutating request made by a program coordinator to the
 * audit log — a single cross-cutting place instead of per-service calls.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;

    if (
      !user ||
      user.role !== Role.program_coordinator ||
      !MUTATION_METHODS.has(req.method)
    ) {
      return next.handle();
    }

    const entity = this.entityFromPath(req.path);
    const paramId = this.paramId(req.params);

    return next.handle().pipe(
      tap((body: unknown) => {
        void this.auditService.record({
          actorId: user.id,
          action: req.method,
          entity,
          entityId: this.entityId(body, paramId),
        });
      }),
    );
  }

  /** First path segment after the `/api/v1` prefix, e.g. `cohorts`. */
  private entityFromPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[2] ?? 'unknown';
  }

  private paramId(params: unknown): string | undefined {
    if (params && typeof params === 'object') {
      const p = params as Record<string, unknown>;
      const candidate = p.id ?? p.cohortId;
      if (typeof candidate === 'string') return candidate;
    }
    return undefined;
  }

  private entityId(body: unknown, fallbackId?: string): string {
    if (body && typeof body === 'object' && 'id' in body) {
      const id = (body as { id?: unknown }).id;
      if (typeof id === 'string') return id;
    }
    return fallbackId ?? 'n/a';
  }
}
