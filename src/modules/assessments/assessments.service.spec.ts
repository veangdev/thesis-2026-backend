import { Test } from '@nestjs/testing';
import { AssessmentsService } from './assessments.service';
import { AssessmentsRepository } from './assessments.repository';
import { CohortsService } from '../cohorts/cohorts.service';
import { DimensionsService } from '../dimensions/dimensions.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';

/**
 * Guards the list scoping. `cohortId` and `facilitatorId` are caller-supplied
 * filters on an endpoint that also enforces role scoping, so the thing worth
 * pinning is that they only ever *narrow*: a facilitator must not be able to
 * widen their result set by naming someone else's id.
 */
describe('AssessmentsService.findAll scoping', () => {
  let service: AssessmentsService;

  const repo = { findMany: jest.fn(), count: jest.fn() };
  const assignments = { studentIdsForFacilitator: jest.fn() };

  const asRole = (role: Role, id = 'caller-1'): AuthenticatedUser =>
    ({ id, role }) as AuthenticatedUser;

  /** The `where` the service handed the repository. */
  const whereArg = () =>
    (repo.findMany.mock.calls[0][0] as { where: Record<string, unknown> })
      .where;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        { provide: AssessmentsRepository, useValue: repo },
        { provide: CohortsService, useValue: {} },
        { provide: DimensionsService, useValue: {} },
        { provide: AssignmentsService, useValue: assignments },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(AssessmentsService);
    repo.findMany.mockResolvedValue([]);
    repo.count.mockResolvedValue(0);
  });

  it('resolves cohortId through the period relation', async () => {
    await service.findAll(
      { page: 1, pageSize: 20, cohortId: 'c1' },
      asRole(Role.program_coordinator),
    );

    expect(whereArg().period).toEqual({ cohortId: 'c1' });
  });

  it('resolves facilitatorId through the active assignment relation', async () => {
    await service.findAll(
      { page: 1, pageSize: 20, facilitatorId: 'f1' },
      asRole(Role.program_coordinator),
    );

    expect(whereArg().student).toEqual({
      selfAssessorAssignments: {
        some: { facilitatorId: 'f1', active: true },
      },
    });
  });

  it('keeps a self-assessor pinned to their own rows despite a cohort filter', async () => {
    await service.findAll(
      { page: 1, pageSize: 20, cohortId: 'c1' },
      asRole(Role.self_assessor, 'student-1'),
    );

    const where = whereArg();
    expect(where.studentId).toBe('student-1');
    expect(where.period).toEqual({ cohortId: 'c1' });
  });

  it('does not let a facilitator widen scope by naming another facilitator', async () => {
    assignments.studentIdsForFacilitator.mockResolvedValue(['s1', 's2']);

    await service.findAll(
      { page: 1, pageSize: 20, facilitatorId: 'someone-else' },
      asRole(Role.facilitator, 'f1'),
    );

    const where = whereArg();
    // The role scope still restricts studentId to the caller's own roster...
    expect(where.studentId).toEqual({ in: ['s1', 's2'] });
    // ...and the requested filter is an additional relation constraint, so the
    // two intersect rather than the filter replacing the scope.
    expect(where.student).toEqual({
      selfAssessorAssignments: {
        some: { facilitatorId: 'someone-else', active: true },
      },
    });
  });

  it('counts with the same predicate it lists with', async () => {
    await service.findAll(
      { page: 1, pageSize: 20, cohortId: 'c1' },
      asRole(Role.program_coordinator),
    );

    expect(repo.count).toHaveBeenCalledWith(whereArg());
  });

  it('leaves both filters off the predicate when not requested', async () => {
    await service.findAll(
      { page: 1, pageSize: 20 },
      asRole(Role.program_coordinator),
    );

    const where = whereArg();
    expect(where).not.toHaveProperty('period');
    expect(where).not.toHaveProperty('student');
  });

  /**
   * `facilitatorId` is a relation on the student, not a column on the
   * assessment. It reaches the client only because `shape` flattens it, so the
   * flattening — and the removal of the join it came from — is the contract.
   */
  describe('response shape', () => {
    const row = (
      assignments: Array<{ facilitatorId: string }>,
    ): Record<string, unknown> => ({
      id: 'a1',
      studentId: 's1',
      periodId: 'p1',
      scores: [
        { dimensionId: 'd2', dimension: { order: 2 } },
        { dimensionId: 'd1', dimension: { order: 1 } },
      ],
      period: { cohortId: 'c1', name: 'Cycle 1' },
      student: { id: 's1', name: 'Dara', selfAssessorAssignments: assignments },
    });

    it('flattens the active assignment onto facilitatorId', async () => {
      repo.findMany.mockResolvedValue([row([{ facilitatorId: 'f1' }])]);
      repo.count.mockResolvedValue(1);

      const result = await service.findAll(
        { page: 1, pageSize: 20 },
        asRole(Role.program_coordinator),
      );

      expect(result.data[0].facilitatorId).toBe('f1');
    });

    it('reports null rather than omitting the field for an unassigned student', async () => {
      repo.findMany.mockResolvedValue([row([])]);
      repo.count.mockResolvedValue(1);

      const result = await service.findAll(
        { page: 1, pageSize: 20 },
        asRole(Role.program_coordinator),
      );

      expect(result.data[0].facilitatorId).toBeNull();
    });

    it('drops the join array so there is one way to read the mentor', async () => {
      repo.findMany.mockResolvedValue([row([{ facilitatorId: 'f1' }])]);
      repo.count.mockResolvedValue(1);

      const result = await service.findAll(
        { page: 1, pageSize: 20 },
        asRole(Role.program_coordinator),
      );

      expect(result.data[0].student).not.toHaveProperty(
        'selfAssessorAssignments',
      );
    });

    it('sorts scores into dimension order', async () => {
      repo.findMany.mockResolvedValue([row([{ facilitatorId: 'f1' }])]);
      repo.count.mockResolvedValue(1);

      const result = await service.findAll(
        { page: 1, pageSize: 20 },
        asRole(Role.program_coordinator),
      );

      expect(result.data[0].scores.map((s) => s.dimensionId)).toEqual([
        'd1',
        'd2',
      ]);
    });
  });
});
