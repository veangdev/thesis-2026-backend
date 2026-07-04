import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CohortsService } from './cohorts.service';
import { CohortsRepository } from './cohorts.repository';

describe('CohortsService', () => {
  let service: CohortsService;

  const repo = {
    create: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
    findById: jest.fn(),
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
        Promise.resolve({ id: 'c1', ...data }),
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
      repo.create.mockResolvedValue({ id: 'c1' });
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
  });

  describe('findOne', () => {
    it('throws when the cohort is missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('validates existence before updating', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update('nope', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
