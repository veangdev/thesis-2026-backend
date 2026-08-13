import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AssessmentsService } from './assessments.service';
import { AssessmentsRepository } from './assessments.repository';
import { CohortsService } from '../cohorts/cohorts.service';
import { DimensionsService } from '../dimensions/dimensions.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssessmentStatus, Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { UpdateMentorAssessmentDto } from './dto/update-mentor-assessment.dto';

/**
 * The review flow: draft → self_submitted → mentor_review → agreed → completed.
 *
 * `agreed` used to be unreachable — `submitMentor` went straight to `completed` —
 * which left the frontend's "Complete cycle" button (disabled until `agreed`)
 * permanently dead against the API. These tests pin the two-step ending and the
 * three narrative fields that were previously accepted and silently dropped.
 */
describe('AssessmentsService review flow', () => {
  let service: AssessmentsService;

  const repo = {
    findById: jest.fn(),
    applyScoreUpdates: jest.fn(),
    setStatus: jest.fn(),
    previousAgreedScores: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };
  const assignments = { isAssigned: jest.fn() };
  const cohorts = { findRaw: jest.fn() };
  const notifications = { create: jest.fn() };

  const FACILITATOR: AuthenticatedUser = {
    id: 'f1',
    role: Role.facilitator,
  } as AuthenticatedUser;
  const STUDENT: AuthenticatedUser = {
    id: 's1',
    role: Role.self_assessor,
  } as AuthenticatedUser;

  /** Two dimensions, with whatever agreed scores the case needs. */
  const assessment = (
    status: AssessmentStatus,
    agreedScores: Array<number | null> = [4, 4],
  ): Record<string, unknown> => ({
    id: 'a1',
    studentId: 's1',
    periodId: 'p1',
    status,
    scores: [
      {
        dimensionId: 'd1',
        agreedScore: agreedScores[0],
        dimension: { name: 'Communication', order: 1 },
      },
      {
        dimensionId: 'd2',
        agreedScore: agreedScores[1],
        dimension: { name: 'Teamwork', order: 2 },
      },
    ],
    period: {
      cohortId: 'c1',
      name: 'Cycle 1',
      startDate: new Date('2026-01-01'),
    },
    student: { id: 's1', name: 'Dara', selfAssessorAssignments: [] },
  });

  /** The assessment-level update handed to the repository. */
  const assessmentDataArg = (): Record<string, unknown> | undefined =>
    repo.applyScoreUpdates.mock.calls[0][2] as
      | Record<string, unknown>
      | undefined;

  /** The per-dimension score updates handed to the repository. */
  const scoreUpdatesArg = (): Array<{
    dimensionId: string;
    data: Record<string, unknown>;
  }> =>
    repo.applyScoreUpdates.mock.calls[0][1] as Array<{
      dimensionId: string;
      data: Record<string, unknown>;
    }>;

  const mentorDto = (
    overrides: Partial<UpdateMentorAssessmentDto> = {},
  ): UpdateMentorAssessmentDto => ({
    scores: [
      { dimensionId: 'd1', mentorScore: 4, agreedScore: 4 },
      { dimensionId: 'd2', mentorScore: 4, agreedScore: 4 },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        { provide: AssessmentsRepository, useValue: repo },
        { provide: CohortsService, useValue: cohorts },
        { provide: DimensionsService, useValue: {} },
        { provide: AssignmentsService, useValue: assignments },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = moduleRef.get(AssessmentsService);

    assignments.isAssigned.mockResolvedValue(true);
    cohorts.findRaw.mockResolvedValue({ scoringScaleMax: 5 });
    repo.applyScoreUpdates.mockResolvedValue(undefined);
    repo.previousAgreedScores.mockResolvedValue(new Map<string, number>());
  });

  // ── The agreed transition ──────────────────────────────────────────────────

  describe('markAgreed', () => {
    it('advances mentor_review → agreed and stamps mentorSubmittedAt', async () => {
      repo.findById.mockResolvedValue(
        assessment(AssessmentStatus.mentor_review),
      );

      await service.saveMentor(
        'a1',
        mentorDto({ markAgreed: true }),
        FACILITATOR,
      );

      expect(assessmentDataArg()).toMatchObject({
        status: AssessmentStatus.agreed,
      });
      expect(assessmentDataArg()?.mentorSubmittedAt).toBeInstanceOf(Date);
    });

    it('agrees straight from self_submitted rather than forcing a mentor_review hop', async () => {
      repo.findById.mockResolvedValue(
        assessment(AssessmentStatus.self_submitted),
      );

      await service.saveMentor(
        'a1',
        mentorDto({ markAgreed: true }),
        FACILITATOR,
      );

      expect(assessmentDataArg()).toMatchObject({
        status: AssessmentStatus.agreed,
      });
    });

    /**
     * The invariant must read the stored row overlaid with this request: the
     * facilitator agrees in the same call that supplies the final score, so
     * checking the row alone would reject a complete request.
     */
    it('accepts an agreement whose last score arrives in the same request', async () => {
      repo.findById.mockResolvedValue(
        assessment(AssessmentStatus.mentor_review, [4, null]),
      );

      await service.saveMentor(
        'a1',
        mentorDto({ markAgreed: true }),
        FACILITATOR,
      );

      expect(assessmentDataArg()).toMatchObject({
        status: AssessmentStatus.agreed,
      });
    });

    it('rejects an agreement that would leave a dimension unscored, naming it', async () => {
      repo.findById.mockResolvedValue(
        assessment(AssessmentStatus.mentor_review, [4, null]),
      );

      await expect(
        service.saveMentor(
          'a1',
          {
            scores: [{ dimensionId: 'd1', mentorScore: 4, agreedScore: 4 }],
            markAgreed: true,
          },
          FACILITATOR,
        ),
      ).rejects.toThrow(/Teamwork/);
      expect(repo.applyScoreUpdates).not.toHaveBeenCalled();
    });

    it('leaves an already-agreed assessment agreed when saving further progress', async () => {
      repo.findById.mockResolvedValue(assessment(AssessmentStatus.agreed));

      await service.saveMentor('a1', mentorDto(), FACILITATOR);

      // No status key at all: agreeing is not undone by an edit, and the
      // self_submitted → mentor_review hop must not fire from `agreed` either.
      expect(assessmentDataArg()).toBeUndefined();
    });

    it('still keeps a completed cycle read-only', async () => {
      repo.findById.mockResolvedValue(assessment(AssessmentStatus.completed));

      await expect(
        service.saveMentor('a1', mentorDto(), FACILITATOR),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Completion ────────────────────────────────────────────────────────────

  describe('submitMentor', () => {
    it('completes from agreed and stamps completedAt', async () => {
      repo.findById.mockResolvedValue(assessment(AssessmentStatus.agreed));

      await service.submitMentor('a1', FACILITATOR);

      expect(assessmentDataArg()).toMatchObject({
        status: AssessmentStatus.completed,
      });
      expect(assessmentDataArg()?.completedAt).toBeInstanceOf(Date);
    });

    /**
     * `mentorSubmittedAt` marks the agreement, `completedAt` the close. Rewriting
     * the former here would collapse the two events the frontend prints
     * separately.
     */
    it('does not overwrite mentorSubmittedAt when completing', async () => {
      repo.findById.mockResolvedValue(assessment(AssessmentStatus.agreed));

      await service.submitMentor('a1', FACILITATOR);

      expect(assessmentDataArg()).not.toHaveProperty('mentorSubmittedAt');
    });

    it.each([
      AssessmentStatus.self_submitted,
      AssessmentStatus.mentor_review,
      AssessmentStatus.draft,
    ])('refuses to complete from %s', async (status) => {
      repo.findById.mockResolvedValue(assessment(status));

      await expect(service.submitMentor('a1', FACILITATOR)).rejects.toThrow(
        /Agree on the final scores/,
      );
      expect(repo.applyScoreUpdates).not.toHaveBeenCalled();
    });

    it('reports an already-complete cycle distinctly from a premature one', async () => {
      repo.findById.mockResolvedValue(assessment(AssessmentStatus.completed));

      await expect(service.submitMentor('a1', FACILITATOR)).rejects.toThrow(
        /already complete/,
      );
    });

    it('still derives coachingRecommended rather than trusting a client tag', async () => {
      // 1/5 is below the 40% weak threshold on both dimensions.
      repo.findById.mockResolvedValue(
        assessment(AssessmentStatus.agreed, [1, 1]),
      );

      await service.submitMentor('a1', FACILITATOR);

      expect(scoreUpdatesArg().map((update) => update.data)).toEqual([
        { coachingRecommended: true },
        { coachingRecommended: true },
      ]);
    });
  });

  // ── The narrative fields ──────────────────────────────────────────────────

  describe('narratives', () => {
    it('persists the mentor’s overall feedback', async () => {
      repo.findById.mockResolvedValue(
        assessment(AssessmentStatus.mentor_review),
      );

      await service.saveMentor(
        'a1',
        mentorDto({ overallFeedback: 'Strong cycle.' }),
        FACILITATOR,
      );

      expect(assessmentDataArg()).toMatchObject({
        overallFeedback: 'Strong cycle.',
      });
    });

    it('persists the student’s overall reflection', async () => {
      repo.findById.mockResolvedValue(assessment(AssessmentStatus.draft));

      await service.saveSelf(
        'a1',
        {
          scores: [{ dimensionId: 'd1', selfScore: 3 }],
          overallReflection: 'I grew most in teamwork.',
        },
        STUDENT,
      );

      expect(assessmentDataArg()).toEqual({
        overallReflection: 'I grew most in teamwork.',
      });
    });

    /** Omitted means "leave it alone", not "clear it". */
    it('does not touch the reflection when the payload omits it', async () => {
      repo.findById.mockResolvedValue(assessment(AssessmentStatus.draft));

      await service.saveSelf(
        'a1',
        { scores: [{ dimensionId: 'd1', selfScore: 3 }] },
        STUDENT,
      );

      expect(assessmentDataArg()).toBeUndefined();
    });

    it('clears the reflection on an explicit empty string', async () => {
      repo.findById.mockResolvedValue(assessment(AssessmentStatus.draft));

      await service.saveSelf(
        'a1',
        {
          scores: [{ dimensionId: 'd1', selfScore: 3 }],
          overallReflection: '',
        },
        STUDENT,
      );

      expect(assessmentDataArg()).toEqual({ overallReflection: '' });
    });

    it('records the facilitator’s coaching tag per dimension', async () => {
      repo.findById.mockResolvedValue(
        assessment(AssessmentStatus.mentor_review),
      );

      await service.saveMentor(
        'a1',
        {
          scores: [
            {
              dimensionId: 'd1',
              mentorScore: 4,
              agreedScore: 4,
              coachingTag: 'strength',
            },
            {
              dimensionId: 'd2',
              mentorScore: 2,
              agreedScore: 2,
              coachingTag: 'needs_focus',
            },
          ],
        },
        FACILITATOR,
      );

      expect(
        scoreUpdatesArg().map((update) => update.data.coachingTag),
      ).toEqual(['strength', 'needs_focus']);
    });
  });
});
