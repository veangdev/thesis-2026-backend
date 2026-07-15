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
