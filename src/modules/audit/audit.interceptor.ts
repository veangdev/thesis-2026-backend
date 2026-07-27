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

/** HTTP method → the past-tense verb the audit log reads better with. */
const VERB_BY_METHOD: Record<string, string> = {
  POST: 'created',
  PATCH: 'updated',
  PUT: 'updated',
  DELETE: 'deleted',
};

/**
 * Session endpoints, excluded from the log.
 *
 * They are POSTs, so they used to be recorded — and because a coordinator signs
 * in far more often than they change anything, they crowded out the
 * administrative entries the Settings audit table exists to show. They also
 * carry nothing meaningful under "what changed": this log answers *who changed
 * what*, and a login changes nothing.
 *
 * `change-password` is deliberately **not** excluded — that is a real account
 * change and belongs in the trail (its field names are redacted below).
 */
const UNAUDITED_PATHS = new Set(['login', 'logout', 'refresh']);

/**
 * Request-body keys never written to the log, at any nesting level. The log
 * records *which* fields a request touched, never their values — but these are
 * withheld even as field names would be, so a credential rotation cannot be
 * inferred from the trail.
 */
const REDACTED_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'otp',
  'secret',
]);

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
      !MUTATION_METHODS.has(req.method) ||
      this.isUnaudited(req.path)
    ) {
      return next.handle();
    }

    const entity = this.entityFromPath(req.path);
    const paramId = this.paramId(req.params);
    // Read before the handler runs: a service is free to mutate the DTO it was
    // given, so the field list has to be captured from the inbound request.
    const fields = this.changedFields(req.body);

    return next.handle().pipe(
      tap((body: unknown) => {
        void this.auditService.record({
          actorId: user.id,
          // `cohorts.updated` rather than the bare `PATCH` this used to store —
          // the Settings audit table shows this column verbatim, and an HTTP
          // verb on its own tells a coordinator nothing.
          action: `${entity}.${VERB_BY_METHOD[req.method] ?? req.method}`,
          entity,
          entityId: this.entityId(body, paramId),
          ...(fields.length ? { metadata: { fields } } : {}),
        });
      }),
    );
  }

  /**
   * The field names a write touched, sorted, with credentials withheld.
   *
   * Only names — never values. The log is readable by any coordinator, so
   * recording what changed is useful while recording the new value would turn
   * the audit trail into a second copy of the data (and of its secrets).
   */
  private changedFields(body: unknown): string[] {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
    return Object.keys(body as Record<string, unknown>)
      .filter((key) => !REDACTED_KEYS.has(key))
      .sort();
  }

  /** First path segment after the `/api/v1` prefix, e.g. `cohorts`. */
  private entityFromPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[2] ?? 'unknown';
  }

  /** True for session endpoints — see `UNAUDITED_PATHS`. */
  private isUnaudited(path: string): boolean {
    const segments = path.split('/').filter(Boolean);
    return UNAUDITED_PATHS.has(segments[segments.length - 1] ?? '');
  }

  /**
   * The record's identifier from the route params. `key` is included because
   * not every resource is keyed by `id` — notification rules are addressed as
   * `/notification-rules/:key`, and without it those entries recorded `n/a`,
   * leaving the log unable to say *which* rule a coordinator changed.
   */
  private paramId(params: unknown): string | undefined {
    if (params && typeof params === 'object') {
      const p = params as Record<string, unknown>;
      const candidate = p.id ?? p.key ?? p.cohortId;
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
