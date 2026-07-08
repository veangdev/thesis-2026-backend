import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpCode } from '../../../generated/prisma/client';

/**
 * Persistence for hashed one-time codes, scoped by `purpose` so a single table
 * serves every OTP feature (password reset, email verification, …). The
 * plaintext code never reaches this layer — the service hashes it first — and
 * every code is single-use.
 */
@Injectable()
export class OtpCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(params: {
    userId: string;
    purpose: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<OtpCode> {
    return this.prisma.otpCode.create({ data: params });
  }

  /** Codes for a purpose that are neither consumed nor expired for the user. */
  findActive(userId: string, purpose: string): Promise<OtpCode[]> {
    return this.prisma.otpCode.findMany({
      where: {
        userId,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  consume(id: string): Promise<OtpCode> {
    return this.prisma.otpCode.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  }

  /** Invalidate every outstanding code of a purpose for a user. */
  invalidateAll(userId: string, purpose: string): Promise<{ count: number }> {
    return this.prisma.otpCode.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }
}
