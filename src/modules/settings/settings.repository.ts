import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationRule } from '../../../generated/prisma/client';

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findNotificationRules(): Promise<NotificationRule[]> {
    return this.prisma.notificationRule.findMany();
  }

  upsertNotificationRule(
    key: string,
    enabled: boolean,
  ): Promise<NotificationRule> {
    return this.prisma.notificationRule.upsert({
      where: { key },
      create: { key, enabled },
      update: { enabled },
    });
  }
}
