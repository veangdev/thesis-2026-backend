import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationRule } from '../../../generated/prisma/client';

@Injectable()
export class NotificationRulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<NotificationRule[]> {
    return this.prisma.notificationRule.findMany();
  }

  findByKey(key: string): Promise<NotificationRule | null> {
    return this.prisma.notificationRule.findUnique({ where: { key } });
  }

  /**
   * Upsert rather than update: the first time a rule is toggled there is no row
   * yet, because the catalogue default stands in until then.
   */
  upsert(key: string, enabled: boolean): Promise<NotificationRule> {
    return this.prisma.notificationRule.upsert({
      where: { key },
      create: { key, enabled },
      update: { enabled },
    });
  }
}
