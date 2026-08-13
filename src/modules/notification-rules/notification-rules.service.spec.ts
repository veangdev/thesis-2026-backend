import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationRulesService } from './notification-rules.service';
import { NotificationRulesRepository } from './notification-rules.repository';
import { NOTIFICATION_RULE_CATALOGUE } from './notification-rules.catalogue';

describe('NotificationRulesService', () => {
  let service: NotificationRulesService;

  const repo = {
    findAll: jest.fn(),
    findByKey: jest.fn(),
    upsert: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationRulesService,
        { provide: NotificationRulesRepository, useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(NotificationRulesService);
  });

  describe('findAll', () => {
    it('returns every catalogue rule even with nothing stored', async () => {
      repo.findAll.mockResolvedValue([]);

      const rules = await service.findAll();

      expect(rules).toHaveLength(NOTIFICATION_RULE_CATALOGUE.length);
      expect(rules.map((rule) => rule.key)).toEqual(
        NOTIFICATION_RULE_CATALOGUE.map((rule) => rule.key),
      );
    });

    it('falls back to the catalogue default for an untoggled rule', async () => {
      repo.findAll.mockResolvedValue([]);

      const rules = await service.findAll();

      // 'weekly-digest' ships off; the other three ship on.
      expect(rules.find((rule) => rule.key === 'weekly-digest')?.enabled).toBe(
        false,
      );
      expect(rules.find((rule) => rule.key === 'submission')?.enabled).toBe(
        true,
      );
    });

    it('lets a stored value override the default', async () => {
      repo.findAll.mockResolvedValue([
        { key: 'weekly-digest', enabled: true, updatedAt: new Date() },
        { key: 'submission', enabled: false, updatedAt: new Date() },
      ]);

      const rules = await service.findAll();

      expect(rules.find((rule) => rule.key === 'weekly-digest')?.enabled).toBe(
        true,
      );
      expect(rules.find((rule) => rule.key === 'submission')?.enabled).toBe(
        false,
      );
    });

    it('ignores a stored row whose key left the catalogue', async () => {
      repo.findAll.mockResolvedValue([
        { key: 'retired-rule', enabled: true, updatedAt: new Date() },
      ]);

      const rules = await service.findAll();

      expect(rules.some((rule) => rule.key === 'retired-rule')).toBe(false);
    });

    it('carries the label and description from the catalogue', async () => {
      repo.findAll.mockResolvedValue([]);

      const rules = await service.findAll();

      const digest = rules.find((rule) => rule.key === 'weekly-digest');
      expect(digest?.label).toBe('Weekly completion digest');
      expect(digest?.description).toContain('every Monday');
    });
  });

  describe('update', () => {
    it('upserts, because the first toggle has no row to update', async () => {
      repo.upsert.mockResolvedValue({
        key: 'weekly-digest',
        enabled: true,
        updatedAt: new Date(),
      });

      const rule = await service.update('weekly-digest', true);

      expect(repo.upsert).toHaveBeenCalledWith('weekly-digest', true);
      expect(rule.enabled).toBe(true);
      expect(rule.label).toBe('Weekly completion digest');
    });

    it('rejects an unknown key instead of storing it', async () => {
      await expect(service.update('made-up', true)).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('isEnabled', () => {
    it('reads the stored value when present', async () => {
      repo.findByKey.mockResolvedValue({
        key: 'submission',
        enabled: false,
        updatedAt: new Date(),
      });
      await expect(service.isEnabled('submission')).resolves.toBe(false);
    });

    it('falls back to the catalogue default when untoggled', async () => {
      repo.findByKey.mockResolvedValue(null);
      await expect(service.isEnabled('submission')).resolves.toBe(true);
      await expect(service.isEnabled('weekly-digest')).resolves.toBe(false);
    });

    it('is false for an unknown key, and never hits the database', async () => {
      await expect(service.isEnabled('made-up')).resolves.toBe(false);
      expect(repo.findByKey).not.toHaveBeenCalled();
    });
  });
});
