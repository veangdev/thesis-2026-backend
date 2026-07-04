import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { LoginDto } from './dto/login.dto';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

interface ResetPayload {
  sub: string;
  purpose: typeof PASSWORD_RESET_PURPOSE;
}

/** Matches the `ms`-style duration strings accepted by @nestjs/jwt. */
type JwtExpiry = `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

const PASSWORD_RESET_PURPOSE = 'password_reset';
const PASSWORD_RESET_EXPIRES_IN: JwtExpiry = '1h';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;
    void _passwordHash;
    return this.issueTokens(safeUser);
  }

  /**
   * Validates a stored refresh token and issues a new access token. The refresh
   * token itself remains valid until it expires or the user logs out, matching
   * the `{ accessToken }` contract the frontend is built against.
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const stored = await this.refreshTokens.findValidByUser(payload.sub);
    const tokenHash = this.hashToken(refreshToken);
    const match = stored.find((token) => token.tokenHash === tokenHash);
    if (!match)
      throw new UnauthorizedException('Invalid or expired refresh token');

    const user = await this.usersService.findOne(payload.sub);
    return { accessToken: await this.signAccessToken(user) };
  }

  /** Revokes every active refresh token for the user (logout everywhere). */
  async logout(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  /**
   * Issues a single-use password reset token. Always resolves (even for an
   * unknown email) so the endpoint never reveals which accounts exist. In
   * non-production environments the token is logged for manual testing.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return;

    const token = await this.jwtService.signAsync(
      { sub: user.id, purpose: PASSWORD_RESET_PURPOSE },
      {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: PASSWORD_RESET_EXPIRES_IN,
      },
    );

    if (this.config.get<string>('nodeEnv') !== 'production') {
      this.logger.log(`Password reset token for ${email}: ${token}`);
    }
  }

  /** Validates a reset token, sets the new password, and revokes all sessions. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    let payload: ResetPayload;
    try {
      payload = await this.jwtService.verifyAsync<ResetPayload>(token, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (payload.purpose !== PASSWORD_RESET_PURPOSE) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    await this.usersService.updatePassword(payload.sub, newPassword);
    // Force re-authentication everywhere after a password change.
    await this.refreshTokens.revokeAllForUser(payload.sub);
  }

  private async issueTokens(user: AuthenticatedUser): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.signAccessToken(user);

    // A unique `jti` guarantees every refresh token is distinct even when
    // issued within the same second, which keeps them unambiguous.
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: this.config.getOrThrow<string>(
          'jwt.refreshExpiresIn',
        ) as JwtExpiry,
      },
    );

    const decoded = this.jwtService.decode<{ exp: number }>(refreshToken);
    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(decoded.exp * 1000),
    });

    return { accessToken, refreshToken, user };
  }

  private signAccessToken(user: AuthenticatedUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: this.config.getOrThrow<string>(
        'jwt.accessExpiresIn',
      ) as JwtExpiry,
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
