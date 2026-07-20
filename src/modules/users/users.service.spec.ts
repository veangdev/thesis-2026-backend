import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { Role } from '../../common/enums';

describe('UsersService', () => {
  let service: UsersService;

  const repo = {
    create: jest.fn(),
    createMany: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    cohortExists: jest.fn(),
    setCohort: jest.fn(),
  };

  const userRecord = {
    id: 'user-1',
    name: 'Jane',
    email: 'jane@pnc.edu',
    passwordHash: 'hashed-secret',
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
      providers: [UsersService, { provide: UsersRepository, useValue: repo }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe('create', () => {
    it('hashes the password and never returns it', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockResolvedValue(userRecord);
      // create() re-reads the user through findOne to include the cohort.
      repo.findById.mockResolvedValue(userRecord);

      const result = await service.create({
        name: 'Jane',
        email: userRecord.email,
        password: 'password123',
      });

      const createArg = repo.create.mock.calls[0][0] as {
        passwordHash: string;
      };
      expect(createArg.passwordHash).not.toBe('password123');
      expect(createArg).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('rejects a duplicate email', async () => {
      repo.findByEmail.mockResolvedValue(userRecord);
      await expect(
        service.create({
          name: 'Jane',
          email: userRecord.email,
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateMe', () => {
    /** A day that is always in the future, so the prune never eats it. */
    const future = (offsetDays: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      const month = `${d.getMonth() + 1}`.padStart(2, '0');
      const day = `${d.getDate()}`.padStart(2, '0');
      return `${d.getFullYear()}-${month}-${day}`;
    };

    const asFacilitator = () =>
      repo.findById.mockResolvedValue({
        ...userRecord,
        role: Role.facilitator,
      });

    it('drops coaching fields for a non-facilitator', async () => {
      repo.findById.mockResolvedValue(userRecord); // self_assessor
      repo.update.mockResolvedValue(userRecord);

      await service.updateMe('user-1', {
        name: 'Jane',
        expertiseTags: ['Interviewing'],
        availability: [future(1)],
      });

      expect(repo.update).toHaveBeenCalledWith('user-1', {
        name: 'Jane',
        expertiseTags: undefined,
        availability: undefined,
      });
    });

    it("dedupes, trims and orders a facilitator's tags", async () => {
      asFacilitator();
      repo.update.mockResolvedValue(userRecord);

      await service.updateMe('user-1', {
        expertiseTags: ['  Teamwork ', 'teamwork', 'Coaching', ''],
      });

      expect(repo.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ expertiseTags: ['Coaching', 'Teamwork'] }),
      );
    });

    it('prunes past days and dedupes availability', async () => {
      asFacilitator();
      repo.update.mockResolvedValue(userRecord);

      await service.updateMe('user-1', {
        availability: [future(3), '2020-01-01', future(1), future(3)],
      });

      expect(repo.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ availability: [future(1), future(3)] }),
      );
    });

    it('lets a facilitator clear their availability', async () => {
      asFacilitator();
      repo.update.mockResolvedValue(userRecord);

      await service.updateMe('user-1', { availability: [] });

      expect(repo.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ availability: [] }),
      );
    });
  });

  describe('findOne', () => {
    it('returns a sanitized user', async () => {
      repo.findById.mockResolvedValue(userRecord);
      const result = await service.findOne('user-1');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe(userRecord.email);
    });

    it('throws when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns a paginated, sanitized envelope', async () => {
      repo.findAll.mockResolvedValue([userRecord, userRecord]);
      repo.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, pageSize: 20 });

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(result.data).toHaveLength(2);
      result.data.forEach((u) => expect(u).not.toHaveProperty('passwordHash'));
    });
  });
});
