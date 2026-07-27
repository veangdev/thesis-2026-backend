import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { AuditRepository } from './audit.repository';

describe('AuditService', () => {
  let service: AuditService;

  const repo = {
    create: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: AuditRepository, useValue: repo }],
    }).compile();
    service = moduleRef.get(AuditService);
    repo.findAll.mockResolvedValue([]);
    repo.count.mockResolvedValue(0);
  });

  describe('record', () => {
    it('swallows a write failure so the audited operation still succeeds', async () => {
      repo.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.record({
          actorId: 'u1',
          action: 'user.update',
          entity: 'User',
          entityId: 'u2',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('matches the entity exactly rather than by substring', async () => {
      await service.findAll({ page: 1, pageSize: 20, entity: 'User' });

      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entity: 'User' } }),
      );
    });

    it('searches action, entity and the joined actor name', async () => {
      await service.findAll({ page: 1, pageSize: 20, search: 'dara' });

      const { where } = repo.findAll.mock.calls[0][0] as {
        where: { OR: Array<Record<string, unknown>> };
      };
      expect(where.OR).toEqual([
        { action: { contains: 'dara', mode: 'insensitive' } },
        { entity: { contains: 'dara', mode: 'insensitive' } },
        { actor: { name: { contains: 'dara', mode: 'insensitive' } } },
      ]);
    });

    it('counts with the same predicate, so the pager matches the rows', async () => {
      await service.findAll({ page: 1, pageSize: 20, entity: 'Cohort' });

      expect(repo.count).toHaveBeenCalledWith({ entity: 'Cohort' });
    });

    it('applies no predicate when unfiltered', async () => {
      await service.findAll({ page: 1, pageSize: 20 });
      expect(repo.count).toHaveBeenCalledWith({});
    });

    it('paginates from the requested page', async () => {
      await service.findAll({ page: 3, pageSize: 10 });

      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });
});
