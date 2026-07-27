import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { GoalsRepository } from './goals.repository';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GoalStatus, NotificationType, Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';

const asUser = (id: string, role: Role): AuthenticatedUser =>
  ({ id, role }) as AuthenticatedUser;

describe('GoalsService', () => {
  let service: GoalsService;

  const repo = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const usersService = { findOne: jest.fn() };
  const assignmentsService = {
    studentIdsForFacilitator: jest.fn(),
    isAssigned: jest.fn(),
    facilitatorIdForStudent: jest.fn(),
  };
  const notificationsService = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        GoalsService,
        { provide: GoalsRepository, useValue: repo },
        { provide: UsersService, useValue: usersService },
        { provide: AssignmentsService, useValue: assignmentsService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();
    service = moduleRef.get(GoalsService);
  });

  describe('create', () => {
    it('forces the student to self for a self-assessor', async () => {
      usersService.findOne.mockResolvedValue({ id: 's1' });
      repo.create.mockResolvedValue({ id: 'g1', studentId: 's1' });

      await service.create(
        { title: 'Grow', studentId: 'someone-else' },
        asUser('s1', Role.self_assessor),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: 's1' }),
      );
    });

    it('requires a studentId when a coordinator creates a goal', async () => {
      await expect(
        service.create(
          { title: 'Grow' },
          asUser('c1', Role.program_coordinator),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates for the given student when a coordinator supplies one', async () => {
      usersService.findOne.mockResolvedValue({ id: 's2' });
      repo.create.mockResolvedValue({ id: 'g2', studentId: 's2' });

      await service.create(
        { title: 'Grow', studentId: 's2' },
        asUser('c1', Role.program_coordinator),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: 's2' }),
      );
    });

    it('persists status and targetScore', async () => {
      usersService.findOne.mockResolvedValue({ id: 's1' });
      repo.create.mockResolvedValue({ id: 'g1', studentId: 's1' });

      await service.create(
        { title: 'Grow', status: GoalStatus.archived, targetScore: 4 },
        asUser('s1', Role.self_assessor),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: GoalStatus.archived,
          targetScore: 4,
        }),
      );
    });
  });

  describe('update', () => {
    it('lets a student edit their own goal', async () => {
      repo.findById.mockResolvedValue({ id: 'g1', studentId: 's1' });
      repo.update.mockResolvedValue({ id: 'g1' });
      await service.update(
        'g1',
        { title: 'New' },
        asUser('s1', Role.self_assessor),
      );
      expect(repo.update).toHaveBeenCalled();
    });

    it('forbids a facilitator from editing a goal', async () => {
      repo.findById.mockResolvedValue({ id: 'g1', studentId: 's1' });
      await expect(
        service.update('g1', { title: 'New' }, asUser('f1', Role.facilitator)),
      ).rejects.toThrow(ForbiddenException);
    });

    // "Mark achieved" sends both; status is stored, not re-derived from
    // progress, so sliding progress back down cannot silently un-achieve it.
    it('stores status and targetScore on update', async () => {
      repo.findById.mockResolvedValue({ id: 'g1', studentId: 's1' });
      repo.update.mockResolvedValue({ id: 'g1' });

      await service.update(
        'g1',
        { progressPercent: 100, status: GoalStatus.achieved, targetScore: 5 },
        asUser('s1', Role.self_assessor),
      );

      expect(repo.update).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({
          progressPercent: 100,
          status: GoalStatus.achieved,
          targetScore: 5,
        }),
      );
    });
  });

  // Goal events are the only source of the `goal` notification category, which
  // the Notifications centre offers a filter chip for.
  describe('notifications', () => {
    it('tells the student when someone else sets them a goal', async () => {
      usersService.findOne.mockResolvedValue({ id: 's2', name: 'Student 02' });
      repo.create.mockResolvedValue({
        id: 'g2',
        studentId: 's2',
        title: 'Speak up',
      });

      await service.create(
        { title: 'Speak up', studentId: 's2' },
        asUser('c1', Role.program_coordinator),
      );

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 's2',
          type: NotificationType.goal,
          href: '/goals',
        }),
      );
    });

    it('stays silent on a self-authored goal', async () => {
      usersService.findOne.mockResolvedValue({ id: 's1', name: 'Student 01' });
      repo.create.mockResolvedValue({
        id: 'g1',
        studentId: 's1',
        title: 'Speak up',
      });

      await service.create(
        { title: 'Speak up' },
        asUser('s1', Role.self_assessor),
      );

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('notifies the mentor when the student marks their own goal achieved', async () => {
      repo.findById.mockResolvedValue({
        id: 'g1',
        studentId: 's1',
        status: GoalStatus.active,
      });
      repo.update.mockResolvedValue({
        id: 'g1',
        studentId: 's1',
        title: 'Speak up',
        status: GoalStatus.achieved,
      });
      assignmentsService.facilitatorIdForStudent.mockResolvedValue('f1');
      usersService.findOne.mockResolvedValue({ id: 's1', name: 'Student 01' });

      await service.update(
        'g1',
        { status: GoalStatus.achieved },
        asUser('s1', Role.self_assessor),
      );

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'f1',
          type: NotificationType.goal,
          body: expect.stringContaining('Student 01'),
        }),
      );
    });

    it('says nothing when a student with no mentor achieves a goal', async () => {
      repo.findById.mockResolvedValue({
        id: 'g1',
        studentId: 's1',
        status: GoalStatus.active,
      });
      repo.update.mockResolvedValue({
        id: 'g1',
        studentId: 's1',
        title: 'Speak up',
        status: GoalStatus.achieved,
      });
      assignmentsService.facilitatorIdForStudent.mockResolvedValue(null);

      await service.update(
        'g1',
        { status: GoalStatus.achieved },
        asUser('s1', Role.self_assessor),
      );

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    // Editing an already-achieved goal must not re-announce it.
    it('does not repeat the achievement notification', async () => {
      repo.findById.mockResolvedValue({
        id: 'g1',
        studentId: 's1',
        status: GoalStatus.achieved,
      });
      repo.update.mockResolvedValue({
        id: 'g1',
        studentId: 's1',
        title: 'Speak up',
        status: GoalStatus.achieved,
      });

      await service.update(
        'g1',
        { title: 'Speak up more' },
        asUser('s1', Role.self_assessor),
      );

      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('scopes a self-assessor to their own goals', async () => {
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);
      await service.findAll({}, asUser('s1', Role.self_assessor));
      expect(repo.findMany).toHaveBeenCalledWith(
        { studentId: 's1' },
        expect.any(Object),
      );
    });

    it('combines the status filter with the role scope', async () => {
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);
      await service.findAll(
        { status: GoalStatus.achieved },
        asUser('s1', Role.self_assessor),
      );
      expect(repo.findMany).toHaveBeenCalledWith(
        { studentId: 's1', status: GoalStatus.achieved },
        expect.any(Object),
      );
    });

    // The filter narrows, never widens: naming someone else's student must not
    // hand a facilitator goals outside their roster.
    it('keeps a facilitator scoped when they name an unassigned student', async () => {
      assignmentsService.studentIdsForFacilitator.mockResolvedValue(['s1']);
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await service.findAll(
        { studentId: 'other', status: GoalStatus.active },
        asUser('f1', Role.facilitator),
      );

      expect(repo.findMany).toHaveBeenCalledWith(
        { studentId: '__none__', status: GoalStatus.active },
        expect.any(Object),
      );
    });
  });
});
