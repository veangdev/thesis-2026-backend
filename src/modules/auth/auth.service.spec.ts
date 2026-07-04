import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { Role } from '../../common/enums';

describe('AuthService', () => {
  let service: AuthService;

  const usersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findOne: jest.fn(),
    updatePassword: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
    decode: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => key),
    get: jest.fn((key: string) => (key === 'nodeEnv' ? 'test' : undefined)),
  };
  const refreshTokens = {
    create: jest.fn(),
    findValidByUser: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
    pruneForUser: jest.fn(),
  };

  const safeUser = {
    id: 'user-1',
    name: 'Jane',
    email: 'jane@pnc.edu',
    role: Role.self_assessor,
    avatarUrl: null,
    expertiseTags: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    jwtService.decode.mockReturnValue({
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
        { provide: RefreshTokenRepository, useValue: refreshTokens },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('returns a token pair for valid credentials', async () => {
      const passwordHash = await bcrypt.hash('password123', 4);
      usersService.findByEmail.mockResolvedValue({ ...safeUser, passwordHash });

      const result = await service.login({
        email: safeUser.email,
        password: 'password123',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(refreshTokens.create).toHaveBeenCalledTimes(1);
    });

    it('throws when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'x@y.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the password does not match', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      usersService.findByEmail.mockResolvedValue({ ...safeUser, passwordHash });
      await expect(
        service.login({ email: safeUser.email, password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('rejects a disabled account', async () => {
      const passwordHash = await bcrypt.hash('password123', 4);
      usersService.findByEmail.mockResolvedValue({
        ...safeUser,
        isActive: false,
        passwordHash,
      });
      await expect(
        service.login({ email: safeUser.email, password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('issues a new access token without revoking the refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: safeUser.id,
        email: safeUser.email,
        role: safeUser.role,
      });
      // hashToken is sha256; provide a stored record matching the incoming token.
      const incoming = 'refresh-token-value';
      const { createHash } = await import('crypto');
      const tokenHash = createHash('sha256').update(incoming).digest('hex');
      refreshTokens.findValidByUser.mockResolvedValue([
        { id: 'rt-1', tokenHash },
      ]);
      usersService.findOne.mockResolvedValue(safeUser);

      const result = await service.refresh(incoming);

      expect(result).toEqual({ accessToken: 'access-token' });
      // The presented refresh token stays valid (non-rotating, per contract).
      expect(refreshTokens.revoke).not.toHaveBeenCalled();
    });

    it('throws when the token is not recognised', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: safeUser.id,
        email: safeUser.email,
        role: safeUser.role,
      });
      refreshTokens.findValidByUser.mockResolvedValue([]);
      await expect(service.refresh('unknown')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when the JWT is invalid', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad token'));
      await expect(service.refresh('bad')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes all refresh tokens for the user', async () => {
      await service.logout('user-1');
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('forgotPassword', () => {
    it('signs a reset token for a known email', async () => {
      usersService.findByEmail.mockResolvedValue({ ...safeUser });
      await service.forgotPassword(safeUser.email);
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: safeUser.id,
          purpose: 'password_reset',
        }),
        expect.any(Object),
      );
    });

    it('is a no-op for an unknown email (no account enumeration)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await service.forgotPassword('nobody@pnc.edu');
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates the password and revokes sessions for a valid token', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: safeUser.id,
        purpose: 'password_reset',
      });

      await service.resetPassword('reset-token', 'NewPassword123!');

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        safeUser.id,
        'NewPassword123!',
      );
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(safeUser.id);
    });

    it('throws when the token has the wrong purpose', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: safeUser.id,
        purpose: 'access',
      });
      await expect(
        service.resetPassword('bad', 'NewPassword123!'),
      ).rejects.toThrow(UnauthorizedException);
      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });

    it('throws when the token is invalid', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad token'));
      await expect(
        service.resetPassword('bad', 'NewPassword123!'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
