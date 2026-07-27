import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import {
  NOTIFICATION_CATEGORY_BY_TYPE,
  NotificationCategory,
  typesForCategory,
} from './notification-category';
import { NotificationType, Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { Notification } from '../../../generated/prisma/client';

const asUser = (id: string): AuthenticatedUser =>
  ({ id, role: Role.self_assessor }) as AuthenticatedUser;

const row = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  userId: 'u1',
  type: NotificationType.assessment_reminder,
  title: 'Assessment open',
  body: 'Complete your self-assessment.',
  href: '/assessments',
  readAt: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  ...overrides,
});

describe('NotificationsService', () => {
  let service: NotificationsService;

  const repo = {
    create: jest.fn(),
    createMany: jest.fn(),
    findById: jest.fn(),
    findByUser: jest.fn(),
    count: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  };

  /** The `where` the service handed the repository. */
  const whereArg = () =>
    repo.findByUser.mock.calls[0][0] as Record<string, unknown>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
    repo.findByUser.mockResolvedValue([]);
    repo.count.mockResolvedValue(0);
  });

  describe('findForUser', () => {
    it('scopes to the caller, whatever else is asked for', async () => {
      await service.findForUser(asUser('u1'), {});

      expect(whereArg()).toEqual({ userId: 'u1' });
    });

    it('expands a category into every type it covers', async () => {
      await service.findForUser(asUser('u1'), {
        category: NotificationCategory.assessment,
      });

      // Not just `assessment_reminder`: `submission` is an assessment event too,
      // and dropping it was the old client-side mapping's bug.
      expect(whereArg().type).toEqual({
        in: expect.arrayContaining([
          NotificationType.assessment_reminder,
          NotificationType.submission,
        ]),
      });
    });

    it('filters the goal category rather than silently returning everything', async () => {
      await service.findForUser(asUser('u1'), {
        category: NotificationCategory.goal,
      });

      expect(whereArg().type).toEqual({ in: [NotificationType.goal] });
    });

    it('prefers the narrower `type` when both are sent', async () => {
      await service.findForUser(asUser('u1'), {
        category: NotificationCategory.assessment,
        type: NotificationType.submission,
      });

      expect(whereArg().type).toBe(NotificationType.submission);
    });

    it('reads `read: false` as unread', async () => {
      await service.findForUser(asUser('u1'), { read: false });

      expect(whereArg().readAt).toBeNull();
    });

    it('reads `read: true` as read, instead of ignoring it', async () => {
      await service.findForUser(asUser('u1'), { read: true });

      expect(whereArg().readAt).toEqual({ not: null });
    });

    it('omits the read filter entirely when unspecified', async () => {
      await service.findForUser(asUser('u1'), {});

      expect(whereArg()).not.toHaveProperty('readAt');
    });

    it('derives the category of every row it returns', async () => {
      repo.findByUser.mockResolvedValue([
        row({ id: 'n1', type: NotificationType.submission }),
        row({ id: 'n2', type: NotificationType.coaching_reminder }),
        row({ id: 'n3', type: NotificationType.goal }),
        row({ id: 'n4', type: NotificationType.achievement }),
      ]);
      repo.count.mockResolvedValue(4);

      const result = await service.findForUser(asUser('u1'), {});

      expect(result.data.map((item) => item.category)).toEqual([
        NotificationCategory.assessment,
        NotificationCategory.coaching,
        NotificationCategory.goal,
        NotificationCategory.system,
      ]);
    });

    it('passes the deep link through untouched', async () => {
      repo.findByUser.mockResolvedValue([row({ href: '/assessments/a1' })]);
      repo.count.mockResolvedValue(1);

      const result = await service.findForUser(asUser('u1'), {});

      expect(result.data[0].href).toBe('/assessments/a1');
    });

    it('paginates from the requested page', async () => {
      await service.findForUser(asUser('u1'), { page: 3, pageSize: 10 });

      expect(repo.findByUser).toHaveBeenCalledWith(expect.anything(), {
        skip: 20,
        take: 10,
      });
    });
  });

  describe('markRead', () => {
    it('rejects a notification belonging to someone else', async () => {
      repo.findById.mockResolvedValue(row({ userId: 'someone-else' }));

      await expect(service.markRead('n1', asUser('u1'))).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.markRead).not.toHaveBeenCalled();
    });

    it('404s an unknown id', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.markRead('nope', asUser('u1'))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the updated row with its category', async () => {
      repo.findById.mockResolvedValue(row());
      repo.markRead.mockResolvedValue(
        row({ type: NotificationType.goal, readAt: new Date() }),
      );

      const updated = await service.markRead('n1', asUser('u1'));

      expect(updated.category).toBe(NotificationCategory.goal);
      expect(updated.readAt).not.toBeNull();
    });
  });

  describe('create / notifyMany', () => {
    it('stores the deep link and returns the category', async () => {
      repo.create.mockResolvedValue(row({ type: NotificationType.goal }));

      const created = await service.create({
        userId: 'u1',
        type: NotificationType.goal,
        title: 'New goal set for you',
        body: '"Speak up" was added to your goals.',
        href: '/goals',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ href: '/goals' }),
      );
      expect(created.category).toBe(NotificationCategory.goal);
    });

    it('does not touch the database for an empty recipient list', async () => {
      await service.notifyMany([], {
        type: NotificationType.system,
        title: 'x',
        body: 'y',
      });

      expect(repo.createMany).not.toHaveBeenCalled();
    });

    it('fans one message out to every recipient', async () => {
      await service.notifyMany(['a', 'b'], {
        type: NotificationType.assessment_reminder,
        title: 'Assessment open',
        body: 'Complete it.',
        href: '/assessments',
      });

      expect(repo.createMany).toHaveBeenCalledWith([
        expect.objectContaining({ userId: 'a', href: '/assessments' }),
        expect.objectContaining({ userId: 'b', href: '/assessments' }),
      ]);
    });
  });
});

describe('notification categories', () => {
  it('maps every notification type, so no row can arrive uncategorised', () => {
    for (const type of Object.values(NotificationType)) {
      expect(NOTIFICATION_CATEGORY_BY_TYPE[type]).toBeDefined();
    }
  });

  it('inverts the mapping without losing a type', () => {
    const covered = Object.values(NotificationCategory).flatMap((category) =>
      typesForCategory(category),
    );

    expect(covered.sort()).toEqual(Object.values(NotificationType).sort());
  });
});
