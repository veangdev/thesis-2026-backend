import { join, resolve } from 'path';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  appPrefix: string;
  database: { url: string };
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  cors: { origins: string[] };
  uploads: { dir: string; publicPath: string };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  };
}

/**
 * Where uploaded files live on disk. Configurable so the directory can be
 * moved off the project — a mounted volume, a shared drive — without a code
 * change. Relative values resolve against the process working directory.
 */
export const uploadsDir = (): string =>
  resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'));

/** URL prefix those files are served under, e.g. `/uploads/avatars/x.png`. */
export const uploadsPublicPath = (): string =>
  process.env.UPLOAD_PUBLIC_PATH ?? '/uploads';

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  appPrefix: process.env.APP_PREFIX ?? 'api/v1',
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  jwt: {
    accessSecret: process.env.JWT_SECRET ?? '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  cors: {
    origins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  uploads: {
    dir: uploadsDir(),
    publicPath: uploadsPublicPath(),
  },
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from:
      process.env.MAIL_FROM ??
      'PNC Journey Star <no-reply@journey-star.pnc.edu>',
  },
});
