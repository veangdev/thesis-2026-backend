import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface HealthStatus {
  status: 'ok';
  database: 'up';
  uptime: number;
  timestamp: string;
}

/** Max time to wait for the DB ping before reporting the service unhealthy. */
const DB_PING_TIMEOUT_MS = 3000;

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthStatus> {
    try {
      await this.pingDatabase();
    } catch {
      throw new ServiceUnavailableException('Database connection failed');
    }

    return {
      status: 'ok',
      database: 'up',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Pings the database, failing fast if it does not respond within the
   * timeout — so the probe never hangs when the DB is unreachable.
   */
  private async pingDatabase(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Database ping timed out')),
        DB_PING_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
