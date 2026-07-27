import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CohortsService } from './cohorts.service';
import { CohortsRepository } from './cohorts.repository';

/** A repository row as Prisma returns it, with the membership aggregate. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'Batch',
    description: null,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    expectedEndDate: new Date('2028-01-01T00:00:00.000Z'),
    scoringScaleMax: 5,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    _count: { members: 0 },
    ...overrides,
  };
}

describe('CohortsService', () => {
  let service: CohortsService;

  const repo = {
    create: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
    findById: jest.fn(),
    findRawById: jest.fn(),
    update: jest.fn(),
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
  });

  describe('create', () => {
    it('defaults the scale to 5 and coerces date strings', async () => {
      repo.create.mockImplementation((data) =>
        Promise.resolve(row({ ...data })),
      );

      await service.create({
        name: 'Batch',
        startDate: '2026-01-01T00:00:00.000Z',
        expectedEndDate: '2028-01-01T00:00:00.000Z',
      });

      const arg = repo.create.mock.calls[0][0] as {
        scoringScaleMax: number;
        startDate: Date;
      };
      expect(arg.scoringScaleMax).toBe(5);
      expect(arg.startDate).toBeInstanceOf(Date);
    });

    it('keeps an explicit scale of 10', async () => {
      repo.create.mockResolvedValue(row({ scoringScaleMax: 10 }));
      await service.create({
        name: 'Batch',
        startDate: '2026-01-01T00:00:00.000Z',
        expectedEndDate: '2028-01-01T00:00:00.000Z',
        scoringScaleMax: 10,
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ scoringScaleMax: 10 }),
      );
    });

    it('persists the description', async () => {
      repo.create.mockResolvedValue(row({ description: 'Full-stack track' }));
      const created = await service.create({
        name: 'Batch',
        description: 'Full-stack track',
        startDate: '2026-01-01T00:00:00.000Z',
        expectedEndDate: '2028-01-01T00:00:00.000Z',
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Full-stack track' }),
      );
      expect(created.description).toBe('Full-stack track');
    });
  });

  describe('findOne', () => {
    it('throws when the cohort is missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });

    it('flattens the membership aggregate onto studentCount', async () => {
      repo.findById.mockResolvedValue(row({ _count: { members: 12 } }));
      const cohort = await service.findOne('c1');
      expect(cohort.studentCount).toBe(12);
      expect(cohort).not.toHaveProperty('_count');
    });
  });

  describe('findRaw', () => {
    it('reads the bare row, without paying for the member count', async () => {
      repo.findRawById.mockResolvedValue({ id: 'c1', scoringScaleMax: 10 });
      const cohort = await service.findRaw('c1');
      expect(cohort.scoringScaleMax).toBe(10);
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('throws when the cohort is missing', async () => {
      repo.findRawById.mockResolvedValue(null);
      await expect(service.findRaw('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('filters by status and name in SQL, not in the caller', async () => {
      repo.findAll.mockResolvedValue([row()]);
      repo.count.mockResolvedValue(1);

      await service.findAll({
        page: 1,
        pageSize: 20,
        status: 'archived',
        search: 'data',
      });

      const where = {
        status: 'archived',
        name: { contains: 'data', mode: 'insensitive' },
      };
      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where }),
      );
      // The count must use the same predicate, or the pager disagrees with the rows.
      expect(repo.count).toHaveBeenCalledWith(where);
    });

    it('applies no predicate when unfiltered', async () => {
      repo.findAll.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);
      await service.findAll({ page: 1, pageSize: 20 });
      expect(repo.count).toHaveBeenCalledWith({});
    });
  });

  describe('update', () => {
    it('validates existence before updating', async () => {
      repo.findRawById.mockResolvedValue(null);
      await expect(service.update('nope', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
