import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { Gender, Role, StudentClass } from '../../common/enums';

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
    findByStudentCode: jest.fn(),
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
    gender: Gender.female,
    studentClass: StudentClass.A,
    studentCode: '2024-ID-05',
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

    it('persists the roster fields', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.findByStudentCode.mockResolvedValue(null);
      repo.create.mockResolvedValue(userRecord);
      repo.findById.mockResolvedValue(userRecord);

      await service.create({
        name: 'Jane',
        email: userRecord.email,
        password: 'password123',
        gender: Gender.female,
        studentClass: StudentClass.A,
        studentCode: '2024-ID-05',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          gender: Gender.female,
          studentClass: StudentClass.A,
          studentCode: '2024-ID-05',
        }),
      );
    });

    it('rejects a student ID already held by someone else', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.findByStudentCode.mockResolvedValue({ id: 'someone-else' });

      await expect(
        service.create({
          name: 'Jane',
          email: 'new@pnc.edu',
          password: 'password123',
          studentCode: '2024-ID-05',
        }),
      ).rejects.toThrow(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('createMany', () => {
    it('rejects a batch that repeats a student ID before writing anything', async () => {
      await expect(
        service.createMany({
          users: [
            {
              name: 'A',
              email: 'a@pnc.edu',
              password: 'password123',
              studentCode: '2024-ID-01',
            },
            {
              name: 'B',
              email: 'b@pnc.edu',
              password: 'password123',
              studentCode: '2024-ID-01',
            },
          ],
        }),
      ).rejects.toThrow(ConflictException);
      expect(repo.createMany).not.toHaveBeenCalled();
    });

    it('re-reads created users so enrolled cohorts are not reported as null', async () => {
      repo.createMany.mockResolvedValue([{ id: 'user-1' }]);
      repo.findAll.mockResolvedValue([
        {
          ...userRecord,
          cohortMemberships: [{ cohort: { id: 'c1', name: 'Batch 2025' } }],
        },
      ]);

      const created = await service.createMany({
        users: [{ name: 'A', email: 'a@pnc.edu', password: 'password123' }],
        cohortId: 'c1',
      });

      expect(repo.findAll).toHaveBeenCalledWith({
        where: { id: { in: ['user-1'] } },
      });
      expect(created[0].cohortId).toBe('c1');
      expect(created[0].cohortName).toBe('Batch 2025');
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

  describe('sanitize', () => {
    it('flattens the active mentor assignment onto facilitatorId', () => {
      const result = service.sanitize({
        ...userRecord,
        selfAssessorAssignments: [{ facilitatorId: 'facilitator-9' }],
      });
      expect(result.facilitatorId).toBe('facilitator-9');
      expect(result).not.toHaveProperty('selfAssessorAssignments');
    });

    // The roster renders the Facilitator column straight from the row rather
    // than joining against a separately-fetched facilitator list.
    it('flattens the facilitator name alongside the id', () => {
      const result = service.sanitize({
        ...userRecord,
        selfAssessorAssignments: [
          { facilitatorId: 'facilitator-9', facilitator: { name: 'Dara Kim' } },
        ],
      });
      expect(result.facilitatorName).toBe('Dara Kim');
    });

    it('reports facilitatorId and facilitatorName as null when nobody is assigned', () => {
      const result = service.sanitize({
        ...userRecord,
        selfAssessorAssignments: [],
      });
      expect(result.facilitatorId).toBeNull();
      expect(result.facilitatorName).toBeNull();
    });

    it('carries the roster fields through untouched', () => {
      const result = service.sanitize(userRecord);
      expect(result.gender).toBe(Gender.female);
      expect(result.studentClass).toBe(StudentClass.A);
      expect(result.studentCode).toBe('2024-ID-05');
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

    it('filters on the roster fields in SQL', async () => {
      repo.findAll.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        pageSize: 20,
        gender: Gender.female,
        studentClass: StudentClass.B,
        isActive: false,
        cohortId: 'c1',
      });

      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            gender: Gender.female,
            studentClass: StudentClass.B,
            isActive: false,
            cohortMemberships: { some: { cohortId: 'c1' } },
          },
        }),
      );
    });

    it('resolves facilitatorId through the active assignment only', async () => {
      repo.findAll.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        pageSize: 20,
        facilitatorId: 'facilitator-9',
      });

      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            selfAssessorAssignments: {
              some: { facilitatorId: 'facilitator-9', active: true },
            },
          },
        }),
      );
    });

    it('searches the student ID alongside name and email', async () => {
      repo.findAll.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await service.findAll({ page: 1, pageSize: 20, search: '2024-ID' });

      const { where } = repo.findAll.mock.calls[0][0] as {
        where: { OR: Array<Record<string, unknown>> };
      };
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { studentCode: { contains: '2024-ID', mode: 'insensitive' } },
        ]),
      );
    });

    it('sorts by class with name as the tiebreak, so order is stable', async () => {
      repo.findAll.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await service.findAll({ page: 1, pageSize: 20, sortBy: 'class' });

      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ studentClass: 'asc' }, { name: 'asc' }],
        }),
      );
    });

    it('stays newest-first when no sort is requested', async () => {
      repo.findAll.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await service.findAll({ page: 1, pageSize: 20 });

      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: 'desc' }] }),
      );
    });

    it('counts with the same predicate it lists with', async () => {
      repo.findAll.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await service.findAll({ page: 1, pageSize: 20, gender: Gender.male });

      expect(repo.count).toHaveBeenCalledWith({ gender: Gender.male });
    });
  });
});
