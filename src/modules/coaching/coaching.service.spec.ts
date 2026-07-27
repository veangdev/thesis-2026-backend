import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CoachingService } from './coaching.service';
import { CoachingRepository } from './coaching.repository';
import { CoachingScope, CoachingStatus, Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';

const asUser = (id: string, role: Role): AuthenticatedUser =>
  ({ id, role }) as AuthenticatedUser;

const session = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'sess-1',
    facilitatorId: 'f1',
    scope: CoachingScope.individual,
    participants: [{ userId: 's1' }],
    ...overrides,
  }) as never;

describe('CoachingService', () => {
  let service: CoachingService;

  const repo = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addActionItem: jest.fn(),
    findActionItem: jest.fn(),
    updateActionItem: jest.fn(),
    deleteActionItem: jest.fn(),
    sharedCohortId: jest.fn(),
    activeStudentIdsInCohort: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.sharedCohortId.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CoachingService,
        { provide: CoachingRepository, useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(CoachingService);
  });

  describe('create', () => {
    const base = {
      title: 'Interview practice',
      scheduledAt: '2026-07-10T09:00:00.000Z',
    };

    it('requires participantIds for individual scope', async () => {
      await expect(
        service.create(
          { ...base, scope: CoachingScope.individual },
          asUser('f1', Role.facilitator),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores an explicit cohortId without deriving one', async () => {
      repo.create.mockResolvedValue(session());

      await service.create(
        {
          ...base,
          scope: CoachingScope.individual,
          participantIds: ['s1'],
          cohortId: 'cohort-9',
        },
        asUser('f1', Role.facilitator),
      );

      expect(repo.sharedCohortId).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ cohortId: 'cohort-9' }),
      );
    });

    it('derives the cohort from participants when none is given', async () => {
      repo.sharedCohortId.mockResolvedValue('cohort-1');
      repo.create.mockResolvedValue(session());

      await service.create(
        { ...base, scope: CoachingScope.individual, participantIds: ['s1'] },
        asUser('f1', Role.facilitator),
      );

      expect(repo.sharedCohortId).toHaveBeenCalledWith(['s1']);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ cohortId: 'cohort-1' }),
      );
    });

    it('leaves the cohort unset when participants span cohorts', async () => {
      repo.sharedCohortId.mockResolvedValue(undefined);
      repo.create.mockResolvedValue(session());

      await service.create(
        {
          ...base,
          scope: CoachingScope.group,
          participantIds: ['s1', 's2'],
        },
        asUser('f1', Role.facilitator),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ cohortId: undefined }),
      );
    });

    it('expands a cohort into participants for group scope', async () => {
      repo.activeStudentIdsInCohort.mockResolvedValue(['s1', 's2', 's3']);
      repo.create.mockResolvedValue(session());

      await service.create(
        { ...base, scope: CoachingScope.class, cohortId: 'cohort-1' },
        asUser('f1', Role.facilitator),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          participantIds: ['s1', 's2', 's3'],
          cohortId: 'cohort-1',
        }),
      );
    });

    it('dedupes explicitly supplied participants', async () => {
      repo.create.mockResolvedValue(session());

      await service.create(
        {
          ...base,
          scope: CoachingScope.individual,
          participantIds: ['s1', 's1'],
        },
        asUser('f1', Role.facilitator),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ participantIds: ['s1'] }),
      );
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);
    });

    const whereOf = () =>
      (repo.findMany.mock.calls[0][0] as { where: Record<string, unknown> })
        .where;

    it('pins a facilitator to their own sessions, ignoring a foreign id', async () => {
      await service.findAll(
        { facilitatorId: 'other' },
        asUser('f1', Role.facilitator),
      );
      expect(whereOf()).toMatchObject({ facilitatorId: 'f1' });
    });

    it('pins a self-assessor to sessions they participate in', async () => {
      await service.findAll(
        { studentId: 'someone-else' },
        asUser('s1', Role.self_assessor),
      );
      expect(whereOf()).toMatchObject({
        participants: { some: { userId: 's1' } },
      });
    });

    it('honours facilitator and student filters for a coordinator', async () => {
      await service.findAll(
        { facilitatorId: 'f2', studentId: 's3' },
        asUser('c1', Role.program_coordinator),
      );
      expect(whereOf()).toMatchObject({
        facilitatorId: 'f2',
        participants: { some: { userId: 's3' } },
      });
    });

    it('filters status, scope and cohort in SQL rather than client-side', async () => {
      await service.findAll(
        {
          status: CoachingStatus.scheduled,
          scope: CoachingScope.group,
          cohortId: 'cohort-1',
        },
        asUser('c1', Role.program_coordinator),
      );
      expect(whereOf()).toMatchObject({
        status: CoachingStatus.scheduled,
        scope: CoachingScope.group,
        cohortId: 'cohort-1',
      });
    });

    it('turns from/to into a scheduledAt range', async () => {
      await service.findAll(
        { from: '2026-07-01T00:00:00.000Z', to: '2026-07-31T23:59:59.999Z' },
        asUser('c1', Role.program_coordinator),
      );
      expect(whereOf().scheduledAt).toEqual({
        gte: new Date('2026-07-01T00:00:00.000Z'),
        lte: new Date('2026-07-31T23:59:59.999Z'),
      });
    });

    it('applies no status filter when none is asked for', async () => {
      await service.findAll({}, asUser('c1', Role.program_coordinator));
      expect(whereOf()).not.toHaveProperty('status');
    });
  });

  describe('update', () => {
    it('leaves the join tables alone for a status-only update', async () => {
      repo.findById.mockResolvedValue(session());
      repo.update.mockResolvedValue(session());

      await service.update(
        'sess-1',
        { status: CoachingStatus.completed },
        asUser('f1', Role.facilitator),
      );

      expect(repo.update).toHaveBeenCalledWith(
        'sess-1',
        expect.objectContaining({ status: CoachingStatus.completed }),
        { participantIds: undefined, dimensionIds: undefined },
      );
    });

    it('passes deduped participant and dimension replacements through', async () => {
      repo.findById.mockResolvedValue(session({ scope: CoachingScope.group }));
      repo.update.mockResolvedValue(session());

      await service.update(
        'sess-1',
        {
          participantIds: ['s1', 's2', 's1'],
          targetDimensionIds: ['d1', 'd1'],
        },
        asUser('f1', Role.facilitator),
      );

      expect(repo.update).toHaveBeenCalledWith('sess-1', expect.any(Object), {
        participantIds: ['s1', 's2'],
        dimensionIds: ['d1'],
      });
    });

    it('rejects emptying the participants of an individual session', async () => {
      repo.findById.mockResolvedValue(session());
      await expect(
        service.update(
          'sess-1',
          { participantIds: [] },
          asUser('f1', Role.facilitator),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('allows emptying participants once the scope widens in the same call', async () => {
      repo.findById.mockResolvedValue(session());
      repo.update.mockResolvedValue(session());

      await service.update(
        'sess-1',
        { scope: CoachingScope.batch, participantIds: [] },
        asUser('f1', Role.facilitator),
      );

      expect(repo.update).toHaveBeenCalled();
    });

    it("forbids a facilitator from editing another facilitator's session", async () => {
      repo.findById.mockResolvedValue(session({ facilitatorId: 'f2' }));
      await expect(
        service.update(
          'sess-1',
          { status: CoachingStatus.cancelled },
          asUser('f1', Role.facilitator),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s an unknown session', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.update('nope', {}, asUser('f1', Role.facilitator)),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('lets a participant read their own session', async () => {
      repo.findById.mockResolvedValue(session());
      await expect(
        service.findOne('sess-1', asUser('s1', Role.self_assessor)),
      ).resolves.toBeDefined();
    });

    it('forbids a non-participant self-assessor', async () => {
      repo.findById.mockResolvedValue(session());
      await expect(
        service.findOne('sess-1', asUser('s9', Role.self_assessor)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('action items', () => {
    it('authorises against the owning session', async () => {
      repo.findActionItem.mockResolvedValue({ id: 'a1', sessionId: 'sess-1' });
      repo.findById.mockResolvedValue(session({ facilitatorId: 'f2' }));

      await expect(
        service.updateActionItem(
          'a1',
          { done: true },
          asUser('f1', Role.facilitator),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s an unknown action item', async () => {
      repo.findActionItem.mockResolvedValue(null);
      await expect(
        service.updateActionItem(
          'nope',
          { done: true },
          asUser('f1', Role.facilitator),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('marks an item done on the owning facilitator’s session', async () => {
      repo.findActionItem.mockResolvedValue({ id: 'a1', sessionId: 'sess-1' });
      repo.findById.mockResolvedValue(session());
      repo.updateActionItem.mockResolvedValue({ id: 'a1', done: true });

      await service.updateActionItem(
        'a1',
        { done: true },
        asUser('f1', Role.facilitator),
      );

      expect(repo.updateActionItem).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ done: true }),
      );
    });
  });
});
