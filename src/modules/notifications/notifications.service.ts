import { Injectable } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';
import { NotificationType } from '../../common/enums';
import { Notification } from '../../../generated/prisma/client';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  create(input: NotificationInput): Promise<Notification> {
    return this.notificationsRepository.create(input);
  }

  /** Fan a single message out to many recipients (e.g. period reminders). */
  async notifyMany(
    userIds: string[],
    message: Omit<NotificationInput, 'userId'>,
  ): Promise<void> {
    if (userIds.length === 0) return;
    await this.notificationsRepository.createMany(
      userIds.map((userId) => ({ userId, ...message })),
    );
  }
}
