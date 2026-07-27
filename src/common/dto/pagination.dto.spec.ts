import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  DEFAULT_MAX_PAGE_SIZE,
  PaginationQueryDto,
  ROSTER_MAX_PAGE_SIZE,
} from './pagination.dto';
import { UserQueryDto } from '../../modules/users/dto/user-query.dto';
import { AssignmentQueryDto } from '../../modules/assignments/dto/assignment-query.dto';
import { AssessmentQueryDto } from '../../modules/assessments/dto/assessment-query.dto';

/** Validates a query string the way the global ValidationPipe would. */
function check<T extends object>(
  cls: new () => T,
  query: Record<string, string>,
): string[] {
  const errors = validateSync(
    plainToInstance(cls, query, { enableImplicitConversion: false }),
    { whitelist: true, forbidNonWhitelisted: true },
  );
  return errors.map((error) => error.property);
}

describe('pagination page-size ceilings', () => {
  it('holds ordinary list endpoints to the default ceiling', () => {
    expect(
      check(PaginationQueryDto, { pageSize: `${DEFAULT_MAX_PAGE_SIZE}` }),
    ).toEqual([]);
    expect(
      check(PaginationQueryDto, { pageSize: `${DEFAULT_MAX_PAGE_SIZE + 1}` }),
    ).toEqual(['pageSize']);
  });

  // The mixin exists for exactly this: a subclass redeclaring `pageSize` with a
  // larger `@Max` would still inherit the parent's stricter constraint, so the
  // roster screens' requests would fail while looking like they were allowed.
  it.each([
    ['UserQueryDto', UserQueryDto],
    ['AssignmentQueryDto', AssignmentQueryDto],
    ['AssessmentQueryDto', AssessmentQueryDto],
  ])('lets %s reach the roster ceiling', (_name, cls) => {
    expect(check(cls, { pageSize: `${ROSTER_MAX_PAGE_SIZE}` })).toEqual([]);
  });

  it.each([
    ['UserQueryDto', UserQueryDto],
    ['AssignmentQueryDto', AssignmentQueryDto],
    ['AssessmentQueryDto', AssessmentQueryDto],
  ])('still bounds %s above the roster ceiling', (_name, cls) => {
    expect(check(cls, { pageSize: `${ROSTER_MAX_PAGE_SIZE + 1}` })).toEqual([
      'pageSize',
    ]);
  });

  it('rejects an undeclared query param, as forbidNonWhitelisted does in prod', () => {
    expect(check(UserQueryDto, { nonsense: 'x' })).toContain('nonsense');
  });

  it('accepts every filter and sort key the roster screens send', () => {
    expect(
      check(UserQueryDto, {
        page: '1',
        pageSize: '200',
        role: 'facilitator',
        search: 'jane',
        isActive: 'true',
        cohortId: 'cohort-1',
        facilitatorId: 'facilitator-1',
        gender: 'female',
        studentClass: 'A',
        sortBy: 'name',
      }),
    ).toEqual([]);
  });

  it('accepts the assignment filters the team panel sends', () => {
    expect(
      check(AssignmentQueryDto, {
        cohortId: 'cohort-1',
        facilitatorId: 'facilitator-1',
        pageSize: '500',
      }),
    ).toEqual([]);
  });

  it('accepts every filter the reports and review-queue screens send', () => {
    expect(
      check(AssessmentQueryDto, {
        page: '1',
        pageSize: '200',
        studentId: 'student-1',
        facilitatorId: 'facilitator-1',
        cohortId: 'cohort-1',
        periodId: 'period-1',
        status: 'completed',
        mine: 'true',
      }),
    ).toEqual([]);
  });
});
