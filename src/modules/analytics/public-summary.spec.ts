import { Test } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRepository } from './analytics.repository';
import { CohortsService } from '../cohorts/cohorts.service';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { Role } from '../../common/enums';

/**
 * The public landing summary. Two things matter: it quotes the *current cohort's*
 * dimensions rather than a fixed list (dimensions are configured per cohort, so
 * any constant is wrong for most of them), and it leaks nothing about people.
 */
describe('AnalyticsService.publicSummary', () => {
  let service: AnalyticsService;

  const repo = {
    countActiveByRole: jest.fn(),
    activeCohorts: jest.fn(),
    countCompletedAssessments: jest.fn(),
    activeScaleRange: jest.fn(),
    currentCohort: jest.fn(),
    describedDimensionsForCohort: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: AnalyticsRepository, useValue: repo },
        { provide: CohortsService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: AssignmentsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(AnalyticsService);

    repo.countActiveByRole.mockResolvedValue(30);
    repo.activeCohorts.mockResolvedValue(3);
    repo.countCompletedAssessments.mockResolvedValue(79);
    repo.activeScaleRange.mockResolvedValue({
      _min: { scoringScaleMax: 5 },
      _max: { scoringScaleMax: 10 },
    });
    repo.currentCohort.mockResolvedValue({
      id: 'c3',
      name: 'Batch 2024',
      scoringScaleMax: 10,
    });
    repo.describedDimensionsForCohort.mockResolvedValue([
      { name: 'Communication', description: 'Speaking and writing clearly' },
      { name: 'Teamwork', description: null },
    ]);
  });

  it('reports real counts rather than hard-coded figures', async () => {
    const summary = await service.publicSummary();

    expect(summary).toMatchObject({
      selfAssessorCount: 30,
      activeCohortCount: 3,
      completedAssessmentCount: 79,
    });
  });

  it('counts only active self-assessors', async () => {
    await service.publicSummary();

    expect(repo.countActiveByRole).toHaveBeenCalledWith(Role.self_assessor);
  });

  it('quotes the current cohort’s dimensions, in order', async () => {
    const summary = await service.publicSummary();

    expect(repo.describedDimensionsForCohort).toHaveBeenCalledWith('c3');
    expect(summary.dimensions.map((d) => d.name)).toEqual([
      'Communication',
      'Teamwork',
    ]);
  });

  it('derives roleCount from the enum so it cannot drift', async () => {
    const summary = await service.publicSummary();

    expect(summary.roleCount).toBe(Object.keys(Role).length);
  });

  it('reports the scale range across active cohorts', async () => {
    const summary = await service.publicSummary();

    expect([summary.scaleMin, summary.scaleMax]).toEqual([5, 10]);
  });

  /** A fresh install has no cohort; the page must still render a sane scale. */
  it('falls back to the default scale and no dimensions without an active cohort', async () => {
    repo.currentCohort.mockResolvedValue(null);
    repo.activeScaleRange.mockResolvedValue({
      _min: { scoringScaleMax: null },
      _max: { scoringScaleMax: null },
    });

    const summary = await service.publicSummary();

    expect([summary.scaleMin, summary.scaleMax]).toEqual([5, 5]);
    expect(summary.dimensions).toEqual([]);
    expect(repo.describedDimensionsForCohort).not.toHaveBeenCalled();
  });

  /** Served unauthenticated, so the payload is counts and names only. */
  it('exposes no person-level or score data', async () => {
    const summary = await service.publicSummary();

    const keys = Object.keys(summary).sort();
    expect(keys).toEqual([
      'activeCohortCount',
      'completedAssessmentCount',
      'dimensions',
      'roleCount',
      'scaleMax',
      'scaleMin',
      'selfAssessorCount',
    ]);
    expect(JSON.stringify(summary)).not.toMatch(/email|studentId|agreedScore/i);
  });
});
