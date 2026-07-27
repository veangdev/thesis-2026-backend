import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NOTIFICATION_CATEGORY_BY_TYPE,
  NotificationCategory,
  typesForCategory,
} from './notification-category';
import { NotificationType } from '../../common/enums';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import { Notification, Prisma } from '../../../generated/prisma/client';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Root-relative in-app destination, e.g. `/assessments/abc`. */
  href?: string;
}

/**
 * What the API returns: the row plus the category its type belongs to, so the
 * client filters and labels without re-deriving the mapping. Built by `shape`.
 */
export type NotificationResponse = Notification & {
  category: NotificationCategory;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  async create(input: NotificationInput): Promise<NotificationResponse> {
    return this.shape(await this.notificationsRepository.create(input));
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
  ): Promise<Paginated<NotificationResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildWhere(user, query);

    const [data, total] = await Promise.all([
      this.notificationsRepository.findByUser(where, {
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.notificationsRepository.count(where),
    ]);
    return paginate(
      data.map((row) => this.shape(row)),
      total,
      page,
      pageSize,
    );
  }

  async markRead(
    id: string,
    user: AuthenticatedUser,
  ): Promise<NotificationResponse> {
    const notification = await this.notificationsRepository.findById(id);
    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    if (notification.userId !== user.id) {
      throw new ForbiddenException('Not your notification');
    }
    return this.shape(await this.notificationsRepository.markRead(id));
  }

  markAllRead(user: AuthenticatedUser): Promise<{ count: number }> {
    return this.notificationsRepository.markAllRead(user.id);
  }

  // ─────────────────────────── Helpers ───────────────────────────

  /**
   * A notification is always scoped to its recipient — no role widens this, so
   * the caller's id is part of the `where` rather than an authorization check
   * applied afterwards.
   */
  private buildWhere(
    user: AuthenticatedUser,
    query: NotificationQueryDto,
  ): Prisma.NotificationWhereInput {
    const where: Prisma.NotificationWhereInput = { userId: user.id };

    // `type` is the narrower of the two, so it wins when both are sent.
    if (query.type) {
      where.type = query.type;
    } else if (query.category) {
      where.type = { in: typesForCategory(query.category) };
    }

    // Three-state: omitted means both. `read: false` must still filter, which is
    // why this tests against `undefined` rather than truthiness.
    if (query.read !== undefined) {
      where.readAt = query.read ? { not: null } : null;
    }

    return where;
  }

  private shape(notification: Notification): NotificationResponse {
    return {
      ...notification,
      category: NOTIFICATION_CATEGORY_BY_TYPE[notification.type],
    };
  }
}
