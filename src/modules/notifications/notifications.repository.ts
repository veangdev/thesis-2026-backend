import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Notification, Prisma } from '../../../generated/prisma/client';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.NotificationUncheckedCreateInput): Promise<Notification> {
    return this.prisma.notification.create({ data });
  }

  createMany(
    data: Prisma.NotificationUncheckedCreateInput[],
  ): Promise<{ count: number }> {
    return this.prisma.notification.createMany({ data });
  }
}
