import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomInt, randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { OtpCodeRepository } from './otp-code.repository';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/** Matches the `ms`-style duration strings accepted by @nestjs/jwt. */
type JwtExpiry = `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

/** Password-reset one-time code: 6 digits, valid for 10 minutes, single-use. */
const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;

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
    private readonly otpCodes: OtpCodeRepository,
    private readonly mailService: MailService,
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
   * Emails a single-use, 6-digit reset code. Always resolves (even for an
   * unknown email) so the endpoint never reveals which accounts exist. Any
   * previously issued codes for the account are invalidated first. In
   * non-production environments the code is also logged for manual testing.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return;

    await this.otpCodes.invalidateAll(user.id, 'password_reset');

    const code = this.generateOtp();
    await this.otpCodes.create({
      userId: user.id,
      purpose: 'password_reset',
      codeHash: this.hashToken(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    // Send without blocking the response: keeps the endpoint fast and its
    // timing constant, so it can't be used to probe which emails exist.
    void this.mailService
      .sendPasswordResetOtp(user.email, code)
      .catch((err) =>
        this.logger.error(
          `Failed to send password reset email to ${user.email}`,
          err instanceof Error ? err.stack : String(err),
        ),
      );

    if (this.config.get<string>('nodeEnv') !== 'production') {
      this.logger.log(`Password reset code for ${email}: ${code}`);
    }
  }

  /**
   * Validates an emailed reset code, sets the new password, consumes the code,
   * and revokes all sessions. Errors are deliberately generic so a caller can't
   * distinguish an unknown email from a wrong/expired code.
   */
  async resetPassword(
    email: string,
    otp: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid or expired code');

    const active = await this.otpCodes.findActive(user.id, 'password_reset');
    const codeHash = this.hashToken(otp);
    const match = active.find((otpRecord) => otpRecord.codeHash === codeHash);
    if (!match) throw new UnauthorizedException('Invalid or expired code');

    await this.otpCodes.consume(match.id);
    await this.usersService.updatePassword(user.id, newPassword);
    // Force re-authentication everywhere after a password change.
    await this.refreshTokens.revokeAllForUser(user.id);
  }

  /** Cryptographically random, zero-padded numeric code. */
  private generateOtp(): string {
    return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
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
    // Opportunistically clear this user's spent tokens.
    await this.refreshTokens.pruneForUser(user.id);

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
