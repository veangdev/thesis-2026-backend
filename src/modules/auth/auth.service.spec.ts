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
  };
  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
    decode: jest.fn(),
  };
  const config = { getOrThrow: jest.fn((key: string) => key) };
  const refreshTokens = {
    create: jest.fn(),
    findValidByUser: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
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

  describe('register', () => {
    it('creates a self_assessor and issues tokens', async () => {
      usersService.create.mockResolvedValue(safeUser);

      const result = await service.register({
        name: 'Jane',
        email: safeUser.email,
        password: 'password123',
      });

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.self_assessor }),
      );
      expect(result.accessToken).toBe('access-token');
    });
  });

  describe('refresh', () => {
    it('rotates a valid refresh token', async () => {
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

      expect(refreshTokens.revoke).toHaveBeenCalledWith('rt-1');
      expect(result.accessToken).toBe('access-token');
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
});
