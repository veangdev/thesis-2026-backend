import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService, AuditEntry } from './audit.service';
import { Role } from '../../common/enums';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let recorded: AuditEntry[];

  const auditService = {
    record: jest.fn((entry: AuditEntry) => {
      recorded.push(entry);
      return Promise.resolve();
    }),
  };

  /** Minimal ExecutionContext carrying one request. */
  const contextFor = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const handlerReturning = (body: unknown): CallHandler => ({
    handle: () => of(body),
  });

  const coordinator = { id: 'coordinator-1', role: Role.program_coordinator };

  /**
   * Runs the interceptor to completion and resolves after the tap fires.
   *
   * The response body is passed as a single-element tuple rather than a plain
   * optional argument, so a test can distinguish "no body" from "argument
   * omitted" — a bare default would swallow an explicit `undefined`.
   */
  const run = async (
    request: Record<string, unknown>,
    responseBody: [unknown] = [{ id: 'entity-1' }],
  ): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      interceptor
        .intercept(contextFor(request), handlerReturning(responseBody[0]))
        .subscribe({ complete: resolve, error: reject });
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    recorded = [];
    interceptor = new AuditInterceptor(auditService as unknown as AuditService);
  });

  it('records a readable action instead of the bare HTTP verb', async () => {
    await run({
      user: coordinator,
      method: 'PATCH',
      path: '/api/v1/cohorts/c1',
      params: { id: 'c1' },
      body: { scoringScaleMax: 10 },
    });

    expect(recorded[0].action).toBe('cohorts.updated');
    expect(recorded[0].entity).toBe('cohorts');
    expect(recorded[0].entityId).toBe('entity-1');
  });

  it('maps each mutating method to a past-tense verb', async () => {
    const cases: Array<[string, string]> = [
      ['POST', 'cohorts.created'],
      ['PATCH', 'cohorts.updated'],
      ['PUT', 'cohorts.updated'],
      ['DELETE', 'cohorts.deleted'],
    ];

    for (const [method, expected] of cases) {
      recorded = [];
      await run({
        user: coordinator,
        method,
        path: '/api/v1/cohorts/c1',
        params: { id: 'c1' },
        body: {},
      });
      expect(recorded[0].action).toBe(expected);
    }
  });

  it('records which fields changed, so Details is not empty', async () => {
    await run({
      user: coordinator,
      method: 'PATCH',
      path: '/api/v1/cohorts/c1',
      params: { id: 'c1' },
      body: { name: 'Batch 2026', scoringScaleMax: 10 },
    });

    expect(recorded[0].metadata).toEqual({
      fields: ['name', 'scoringScaleMax'],
    });
  });

  it('never records field values, only names', async () => {
    await run({
      user: coordinator,
      method: 'PATCH',
      path: '/api/v1/cohorts/c1',
      params: { id: 'c1' },
      body: { name: 'Secret Batch Name' },
    });

    expect(JSON.stringify(recorded[0].metadata)).not.toContain(
      'Secret Batch Name',
    );
  });

  it('withholds credential field names entirely', async () => {
    await run({
      user: coordinator,
      method: 'POST',
      path: '/api/v1/users',
      params: {},
      body: {
        name: 'Jane',
        email: 'jane@pnc.edu',
        password: 'Password123!',
        refreshToken: 'abc',
      },
    });

    expect(recorded[0].metadata).toEqual({ fields: ['email', 'name'] });
  });

  it('omits metadata rather than storing an empty field list', async () => {
    await run({
      user: coordinator,
      method: 'DELETE',
      path: '/api/v1/periods/p1',
      params: { id: 'p1' },
      body: {},
    });

    expect(recorded[0].metadata).toBeUndefined();
  });

  it('falls back to the path param when the response carries no id', async () => {
    await run(
      {
        user: coordinator,
        method: 'DELETE',
        path: '/api/v1/periods/p1',
        params: { id: 'p1' },
        body: {},
      },
      [undefined],
    );

    expect(recorded[0].entityId).toBe('p1');
  });

  it('identifies the record by its `key` when it has no `id`', async () => {
    // Notification rules are addressed as /notification-rules/:key, and the
    // response body carries `key` rather than `id`.
    await run(
      {
        user: coordinator,
        method: 'PATCH',
        path: '/api/v1/notification-rules/weekly-digest',
        params: { key: 'weekly-digest' },
        body: { enabled: true },
      },
      [{ key: 'weekly-digest', enabled: true }],
    );

    expect(recorded[0].action).toBe('notification-rules.updated');
    expect(recorded[0].entityId).toBe('weekly-digest');
  });

  it('skips session endpoints, which change nothing and would swamp the log', async () => {
    for (const path of [
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/auth/refresh',
    ]) {
      await run({
        user: coordinator,
        method: 'POST',
        path,
        params: {},
        body: {},
      });
    }

    expect(recorded).toHaveLength(0);
  });

  it('still records a password change — a real account change', async () => {
    await run({
      user: coordinator,
      method: 'PATCH',
      path: '/api/v1/auth/change-password',
      params: {},
      body: { currentPassword: 'old-secret', newPassword: 'new-secret' },
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].entity).toBe('auth');
    // Both field names are credentials, so nothing is recorded about them.
    expect(recorded[0].metadata).toBeUndefined();
  });

  it('ignores reads, and writes by anyone who is not a coordinator', async () => {
    await run({
      user: coordinator,
      method: 'GET',
      path: '/api/v1/cohorts',
      params: {},
      body: {},
    });
    await run({
      user: { id: 'f1', role: Role.facilitator },
      method: 'PATCH',
      path: '/api/v1/cohorts/c1',
      params: { id: 'c1' },
      body: { name: 'X' },
    });
    await run({
      method: 'PATCH',
      path: '/api/v1/cohorts/c1',
      params: { id: 'c1' },
      body: { name: 'X' },
    });

    expect(recorded).toHaveLength(0);
  });
});
