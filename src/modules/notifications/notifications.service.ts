import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationType } from '../../common/enums';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import { Notification, Prisma } from '../../../generated/prisma/client';

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

  async findForUser(
    user: AuthenticatedUser,
    query: NotificationQueryDto,
  ): Promise<Paginated<Notification>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.NotificationWhereInput = { userId: user.id };
    if (query.type) where.type = query.type;
    if (query.unread) where.readAt = null;

    const [data, total] = await Promise.all([
      this.notificationsRepository.findByUser(where, {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.notificationsRepository.count(where),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async markRead(id: string, user: AuthenticatedUser): Promise<Notification> {
    const notification = await this.notificationsRepository.findById(id);
    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    if (notification.userId !== user.id) {
      throw new ForbiddenException('Not your notification');
    }
    return this.notificationsRepository.markRead(id);
  }

  markAllRead(user: AuthenticatedUser): Promise<{ count: number }> {
    return this.notificationsRepository.markAllRead(user.id);
  }
}
