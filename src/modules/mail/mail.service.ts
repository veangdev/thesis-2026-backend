import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

/** Both transports we create (real SMTP + Ethereal) are SMTP-based. */
type SmtpTransporter = Transporter<SMTPTransport.SentMessageInfo>;

/**
 * Thin wrapper around nodemailer. The transporter is created lazily on first
 * send so the app boots even without SMTP configured.
 *
 * - When `SMTP_HOST` is set, mail is sent through that real SMTP server.
 * - Otherwise a throwaway Ethereal test account is used so the password-reset
 *   flow works in development: nothing is actually delivered, but a preview URL
 *   is logged for every message.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: SmtpTransporter;
  private usingTestAccount = false;

  constructor(private readonly config: ConfigService) {}

  private async getTransporter(): Promise<SmtpTransporter> {
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('mail.host');
    if (host) {
      const user = this.config.get<string>('mail.user');
      const pass = this.config.get<string>('mail.pass');
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('mail.port') ?? 587,
        secure: this.config.get<boolean>('mail.secure') ?? false,
        auth: user ? { user, pass } : undefined,
      });
    } else {
      const testAccount = await nodemailer.createTestAccount();
      this.usingTestAccount = true;
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      this.logger.warn(
        'SMTP is not configured (no SMTP_HOST). Falling back to an Ethereal ' +
          'test account — emails are NOT delivered; a preview URL is logged instead.',
      );
    }
    return this.transporter;
  }

  /** Emails a single-use password-reset code. */
  async sendPasswordResetOtp(to: string, code: string): Promise<void> {
    const transporter = await this.getTransporter();
    const from = this.config.get<string>('mail.from');

    const info = await transporter.sendMail({
      from,
      to,
      subject: 'Your PNC Journey Star password reset code',
      text: `Your password reset code is ${code}. It expires in 10 minutes. If you didn't request this, you can safely ignore this email.`,
      html: this.otpTemplate(code),
    });

    if (this.usingTestAccount) {
      this.logger.log(
        `Password reset email preview (Ethereal): ${nodemailer.getTestMessageUrl(info)}`,
      );
    }
  }

  private otpTemplate(code: string): string {
    return `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="margin: 0 0 8px;">Password reset</h2>
        <p style="color: #475569; margin: 0 0 24px;">
          Use the code below to reset your PNC Journey Star password. It expires in 10 minutes.
        </p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center;
                    background: #f1f5f9; border-radius: 12px; padding: 16px 0; color: #0f172a;">
          ${code}
        </div>
        <p style="color: #94a3b8; font-size: 13px; margin: 24px 0 0;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `;
  }
}
