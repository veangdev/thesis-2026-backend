import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../enums';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const contextWithUser = (user: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows the request when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextWithUser({ role: Role.STUDENT }))).toBe(
      true,
    );
  });

  it('allows the request when the user has a required role', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMIN, Role.MENTOR]);
    expect(guard.canActivate(contextWithUser({ role: Role.ADMIN }))).toBe(true);
  });

  it('denies the request when the user lacks the required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(contextWithUser({ role: Role.STUDENT }))).toBe(
      false,
    );
  });

  it('denies the request when there is no user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(contextWithUser(undefined))).toBe(false);
  });
});
