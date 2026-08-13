import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CohortsService } from './cohorts.service';
import { CohortsRepository } from './cohorts.repository';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';

/**
 * Who may read a cohort.
 *
 * `GET /cohorts/:id` and `GET /cohorts/:id/dimensions` used to be staff-only,
 * which made the **self-assessment wizard unreachable**: it needs the scoring
 * scale and the dimension list, both 403 for a student, so the screen sat on a
 * skeleton forever with no error to explain it. The retired mock had no
 * authorization at all, which is why it never showed up in a mock-mode run.
 *
 * The fix is a scope, not an open door: a self-assessor reads the one cohort they
 * are enrolled in.
 */
describe('CohortsService read scope', () => {
  let service: CohortsService;

  const repo = {
    findById: jest.fn(),
    isMember: jest.fn(),
  };

  const asRole = (role: Role, id = 'u1'): AuthenticatedUser =>
    ({ id, role }) as AuthenticatedUser;

  const COHORT = {
    id: 'c1',
    name: 'Batch 2025',
    description: null,
    startDate: new Date(),
    expectedEndDate: new Date(),
    scoringScaleMax: 5,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { members: 10 },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CohortsService,
        { provide: CohortsRepository, useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(CohortsService);
    repo.findById.mockResolvedValue(COHORT);
  });

  it('lets an enrolled self-assessor read their own cohort', async () => {
    repo.isMember.mockResolvedValue(true);

    const cohort = await service.findOne(
      'c1',
      asRole(Role.self_assessor, 's1'),
    );

    expect(cohort.scoringScaleMax).toBe(5);
    expect(repo.isMember).toHaveBeenCalledWith('c1', 's1');
  });

  it('refuses a self-assessor reading a cohort they are not in', async () => {
    repo.isMember.mockResolvedValue(false);

    await expect(
      service.findOne('c1', asRole(Role.self_assessor, 's1')),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([Role.program_coordinator, Role.facilitator])(
    'leaves %s read access unrestricted',
    async (role) => {
      await service.findOne('c1', asRole(role));

      // No membership lookup at all — staff scope is unchanged by this fix.
      expect(repo.isMember).not.toHaveBeenCalled();
    },
  );

  /** Internal callers (period generation, analytics) pass no user. */
  it('allows an unattributed internal read', async () => {
    await expect(service.findOne('c1')).resolves.toMatchObject({ id: 'c1' });
    expect(repo.isMember).not.toHaveBeenCalled();
  });
});
