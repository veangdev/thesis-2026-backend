import { Test } from '@nestjs/testing';
import { AssignmentsService } from './assignments.service';
import { AssignmentsRepository } from './assignments.repository';
import { UsersService } from '../users/users.service';
import { CohortsService } from '../cohorts/cohorts.service';
import { Role } from '../../common/enums';

describe('AssignmentsService', () => {
  let service: AssignmentsService;

  const assignmentsRepository = {
    studentsForFacilitator: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
    findByTrio: jest.fn(),
    reactivate: jest.fn(),
    deactivateForStudent: jest.fn(),
    cohortIdForStudent: jest.fn(),
  };

  // The real `sanitize` is used deliberately: the behaviour under test is that
  // assignment rows go through the same flattening as every other user
  // response, so stubbing it would test nothing. It reads only its argument,
  // so a service with no repository is enough. `findOne` does hit the
  // repository, so the create tests stub that one method.
  const usersService = new UsersService({} as never);

  const cohortsService = { findRaw: jest.fn() };

  const studentRow = {
    id: 'student-1',
    name: 'Jane',
    email: 'jane@pnc.edu',
    role: Role.self_assessor,
    avatarUrl: null,
    expertiseTags: [],
    availability: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AssignmentsService,
        { provide: AssignmentsRepository, useValue: assignmentsRepository },
        { provide: UsersService, useValue: usersService },
        { provide: CohortsService, useValue: cohortsService },
      ],
    }).compile();
    service = moduleRef.get(AssignmentsService);
  });

  describe('studentsForFacilitator', () => {
    it('flattens the cohort membership onto cohortId/cohortName', async () => {
      assignmentsRepository.studentsForFacilitator.mockResolvedValue([
        {
          ...studentRow,
          cohortMemberships: [
            { cohort: { id: 'cohort-1', name: 'Batch 2025' } },
          ],
        },
      ]);

      const [student] = await service.studentsForFacilitator('facilitator-1');

      expect(student.cohortId).toBe('cohort-1');
      expect(student.cohortName).toBe('Batch 2025');
      expect(student).not.toHaveProperty('cohortMemberships');
    });

    it('returns null cohort fields for an unenrolled student', async () => {
      assignmentsRepository.studentsForFacilitator.mockResolvedValue([
        { ...studentRow, cohortMemberships: [] },
      ]);

      const [student] = await service.studentsForFacilitator('facilitator-1');

      expect(student.cohortId).toBeNull();
      expect(student.cohortName).toBeNull();
    });

    it('never leaks a password hash', async () => {
      assignmentsRepository.studentsForFacilitator.mockResolvedValue([
        { ...studentRow, cohortMemberships: [] },
      ]);

      const [student] = await service.studentsForFacilitator('facilitator-1');

      expect(student).not.toHaveProperty('passwordHash');
    });
  });

  describe('create', () => {
    /** Stubs `findOne` so a facilitator id resolves to a facilitator, etc. */
    function stubRoles(): jest.SpyInstance {
      return jest
        .spyOn(usersService, 'findOne')
        .mockImplementation((id: string) =>
          Promise.resolve({
            ...studentRow,
            id,
            role: id.startsWith('facilitator')
              ? Role.facilitator
              : Role.self_assessor,
            cohortId: 'cohort-1',
            cohortName: 'Batch 2025',
            facilitatorId: null,
          } as never),
        );
    }

    beforeEach(() => {
      stubRoles();
      cohortsService.findRaw.mockResolvedValue({ id: 'cohort-1' });
      assignmentsRepository.cohortIdForStudent.mockResolvedValue('cohort-1');
      assignmentsRepository.findByTrio.mockResolvedValue(null);
      assignmentsRepository.create.mockImplementation((data: unknown) =>
        Promise.resolve({
          id: 'assignment-new',
          active: true,
          ...(data as object),
        }),
      );
    });

    it('retires the student’s previous assignment so they are not on two rosters', async () => {
      await service.create({
        facilitatorId: 'facilitator-2',
        selfAssessorId: 'student-1',
      });

      expect(assignmentsRepository.deactivateForStudent).toHaveBeenCalledWith(
        'student-1',
        'facilitator-2',
      );
    });

    it('reactivates a retired row instead of breaking the unique trio', async () => {
      assignmentsRepository.findByTrio.mockResolvedValue({
        id: 'assignment-old',
        active: false,
      });
      assignmentsRepository.reactivate.mockResolvedValue({
        id: 'assignment-old',
        active: true,
      });

      const result = await service.create({
        facilitatorId: 'facilitator-1',
        selfAssessorId: 'student-1',
      });

      expect(assignmentsRepository.reactivate).toHaveBeenCalledWith(
        'assignment-old',
      );
      expect(assignmentsRepository.create).not.toHaveBeenCalled();
      expect(result.active).toBe(true);
    });

    it('is idempotent when the assignment already stands', async () => {
      assignmentsRepository.findByTrio.mockResolvedValue({
        id: 'assignment-live',
        active: true,
      });

      const result = await service.create({
        facilitatorId: 'facilitator-1',
        selfAssessorId: 'student-1',
      });

      expect(result.id).toBe('assignment-live');
      expect(assignmentsRepository.create).not.toHaveBeenCalled();
      expect(assignmentsRepository.reactivate).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      assignmentsRepository.findAll.mockResolvedValue([]);
      assignmentsRepository.count.mockResolvedValue(0);
    });

    it('excludes retired rows, so the list reads as who mentors whom now', async () => {
      await service.findAll({});

      expect(assignmentsRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true } }),
      );
      expect(assignmentsRepository.count).toHaveBeenCalledWith({
        active: true,
      });
    });

    it('narrows by cohort and facilitator when asked', async () => {
      await service.findAll({
        cohortId: 'cohort-1',
        facilitatorId: 'facilitator-1',
      });

      expect(assignmentsRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            active: true,
            cohortId: 'cohort-1',
            facilitatorId: 'facilitator-1',
          },
        }),
      );
    });

    it('counts against the same filter it lists with', async () => {
      assignmentsRepository.count.mockResolvedValue(7);

      const result = await service.findAll({
        cohortId: 'cohort-1',
        pageSize: 5,
      });

      expect(assignmentsRepository.count).toHaveBeenCalledWith({
        active: true,
        cohortId: 'cohort-1',
      });
      expect(result.meta).toEqual({ page: 1, pageSize: 5, total: 7 });
    });
  });
});
