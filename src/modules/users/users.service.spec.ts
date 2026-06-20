import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { Role, Status } from '../../common/enums';

describe('UsersService', () => {
  let service: UsersService;

  const repo = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const userRecord = {
    id: 'user-1',
    name: 'Jane',
    email: 'jane@pnc.edu.kh',
    password: 'hashed-secret',
    role: Role.STUDENT,
    status: Status.ACTIVE,
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

      const result = await service.create({
        name: 'Jane',
        email: userRecord.email,
        password: 'password123',
      });

      const createArg = repo.create.mock.calls[0][0] as { password: string };
      expect(createArg.password).not.toBe('password123');
      expect(result).not.toHaveProperty('password');
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
      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe(userRecord.email);
    });

    it('throws when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('sanitizes every user', async () => {
      repo.findAll.mockResolvedValue([userRecord, userRecord]);
      const result = await service.findAll();
      expect(result).toHaveLength(2);
      result.forEach((u) => expect(u).not.toHaveProperty('password'));
    });
  });
});
