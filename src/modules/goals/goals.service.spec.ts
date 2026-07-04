import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { GoalsRepository } from './goals.repository';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { Role } from '../../common/enums';
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
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        GoalsService,
        { provide: GoalsRepository, useValue: repo },
        { provide: UsersService, useValue: usersService },
        { provide: AssignmentsService, useValue: assignmentsService },
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
  });
});
