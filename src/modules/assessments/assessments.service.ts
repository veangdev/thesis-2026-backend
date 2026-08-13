import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssessmentResponse,
  AssessmentsRepository,
  AssessmentWithRelations,
} from './assessments.repository';
import { CohortsService } from '../cohorts/cohorts.service';
import { DimensionsService } from '../dimensions/dimensions.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateSelfAssessmentDto } from './dto/update-self-assessment.dto';
import { UpdateMentorAssessmentDto } from './dto/update-mentor-assessment.dto';
import { AssessmentQueryDto } from './dto/assessment-query.dto';
import { isCoachingRecommended } from './assessment-logic';
import { AssessmentStatus, NotificationType, Role } from '../../common/enums';
import { APP_ROUTES } from '../../common/constants/app-routes';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import {
  Assessment,
  AssessmentPeriod,
  Prisma,
} from '../../../generated/prisma/client';

/** Sentinel that matches no id, used to force an empty result set. */
const NO_MATCH = '__none__';

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly assessmentsRepository: AssessmentsRepository,
    private readonly cohortsService: CohortsService,
    private readonly dimensionsService: DimensionsService,
    private readonly assignmentsService: AssignmentsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─────────────────────────── Lifecycle: generation ───────────────────────────

  /**
   * §5.1 — On period open, create a draft assessment (with a score row per
   * active dimension) for every active student in the cohort, then notify the
   * students and their mentors. Idempotent: students already having an
   * assessment for the period are skipped.
   */
  async generateForPeriod(period: AssessmentPeriod): Promise<void> {
    const studentIds =
      await this.assessmentsRepository.activeStudentIdsInCohort(
        period.cohortId,
      );
    if (studentIds.length === 0) return;

    const existing =
      await this.assessmentsRepository.studentIdsWithAssessmentForPeriod(
        period.id,
      );
    const newStudentIds = studentIds.filter((id) => !existing.has(id));
    if (newStudentIds.length === 0) return;

    const dimensions = await this.dimensionsService.findActiveByCohort(
      period.cohortId,
    );
    const dimensionIds = dimensions.map((d) => d.id);

    await this.assessmentsRepository.createDrafts(
      period.id,
      newStudentIds,
      dimensionIds,
    );

    await this.notificationsService.notifyMany(newStudentIds, {
      type: NotificationType.assessment_reminder,
      title: `Assessment open: ${period.name}`,
      body: `The assessment period "${period.name}" is open. Please complete your self-assessment.`,
      href: APP_ROUTES.assessments,
    });

    const mentorIds = new Set<string>();
    for (const studentId of newStudentIds) {
      const mentorId =
        await this.assignmentsService.facilitatorIdForStudent(studentId);
      if (mentorId) mentorIds.add(mentorId);
    }
    await this.notificationsService.notifyMany([...mentorIds], {
      type: NotificationType.assessment_reminder,
      title: `Assessments open: ${period.name}`,
      body: `Your students have a new assessment period "${period.name}" to review.`,
      href: APP_ROUTES.assessments,
    });
  }

  // ─────────────────────────── Reads (scoped) ───────────────────────────

  async findAll(
    query: AssessmentQueryDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<AssessmentResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = await this.buildScopedWhere(query, user);

    const [rows, total] = await Promise.all([
      this.assessmentsRepository.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.assessmentsRepository.count(where),
    ]);

    return paginate(
      rows.map((r) => this.shape(r)),
      total,
      page,
      pageSize,
    );
  }

  async findOne(
    id: string,
    user: AuthenticatedUser,
  ): Promise<AssessmentResponse> {
    const assessment = await this.getOrThrow(id);
    await this.assertCanRead(assessment, user);
    return this.shape(assessment);
  }

  // ─────────────────────────── Self-assessment ───────────────────────────

  async saveSelf(
    id: string,
    dto: UpdateSelfAssessmentDto,
    user: AuthenticatedUser,
  ): Promise<AssessmentResponse> {
    const assessment = await this.getOrThrow(id);
    this.assertOwner(assessment, user);
    if (assessment.status !== AssessmentStatus.draft) {
      throw new BadRequestException(
        'Self-assessment can only be edited while in draft',
      );
    }

    const scaleMax = await this.scaleMaxFor(assessment.period.cohortId);
    const dimensionIds = new Set(assessment.scores.map((s) => s.dimensionId));

    const updates = dto.scores.map((item) => {
      if (!dimensionIds.has(item.dimensionId)) {
        throw new BadRequestException(
          `Dimension ${item.dimensionId} is not part of this assessment`,
        );
      }
      this.assertInRange(item.selfScore, scaleMax, 'selfScore');
      return {
        dimensionId: item.dimensionId,
        data: {
          selfScore: item.selfScore,
          selfReflection: item.selfReflection,
        },
      };
    });

    // `overallReflection` is a field on the assessment, not on a score row, so it
    // rides along as the optional assessment-level update of the same
    // transaction. Omitted from the body means "leave it alone" rather than
    // "clear it", so a caller saving only scores cannot wipe the narrative.
    const assessmentData =
      dto.overallReflection === undefined
        ? undefined
        : { overallReflection: dto.overallReflection };

    await this.assessmentsRepository.applyScoreUpdates(
      id,
      updates,
      assessmentData,
    );
    return this.findOne(id, user);
  }

  async submitSelf(
    id: string,
    user: AuthenticatedUser,
  ): Promise<AssessmentResponse> {
    const assessment = await this.getOrThrow(id);
    this.assertOwner(assessment, user);
    if (assessment.status !== AssessmentStatus.draft) {
      throw new BadRequestException('Assessment has already been submitted');
    }
    if (assessment.scores.some((s) => s.selfScore === null)) {
      throw new BadRequestException(
        'Every active dimension must be scored before submitting',
      );
    }

    await this.assessmentsRepository.setStatus(id, {
      status: AssessmentStatus.self_submitted,
      submittedAt: new Date(),
    });

    const mentorId = await this.assignmentsService.facilitatorIdForStudent(
      assessment.studentId,
    );
    if (mentorId) {
      await this.notificationsService.create({
        userId: mentorId,
        type: NotificationType.submission,
        title: 'Self-assessment submitted',
        body: `${assessment.student.name} submitted a self-assessment for "${assessment.period.name}".`,
        href: APP_ROUTES.assessmentDetail(id),
      });
    }

    return this.findOne(id, user);
  }

  // ─────────────────────────── Mentor review ───────────────────────────

  async saveMentor(
    id: string,
    dto: UpdateMentorAssessmentDto,
    user: AuthenticatedUser,
  ): Promise<AssessmentResponse> {
    const assessment = await this.getOrThrow(id);
    await this.assertMentorOf(assessment, user);
    // `agreed` is editable: agreeing is not closing, so a facilitator can still
    // correct a score before completing the cycle. `draft` and `completed` are not.
    if (
      assessment.status !== AssessmentStatus.self_submitted &&
      assessment.status !== AssessmentStatus.mentor_review &&
      assessment.status !== AssessmentStatus.agreed
    ) {
      throw new BadRequestException(
        assessment.status === AssessmentStatus.completed
          ? 'This cycle is complete and can no longer be edited'
          : 'Mentor review requires a submitted self-assessment',
      );
    }

    const scaleMax = await this.scaleMaxFor(assessment.period.cohortId);
    const dimensionIds = new Set(assessment.scores.map((s) => s.dimensionId));

    const updates = dto.scores.map((item) => {
      if (!dimensionIds.has(item.dimensionId)) {
        throw new BadRequestException(
          `Dimension ${item.dimensionId} is not part of this assessment`,
        );
      }
      this.assertInRange(item.mentorScore, scaleMax, 'mentorScore');
      this.assertInRange(item.agreedScore, scaleMax, 'agreedScore');
      return {
        dimensionId: item.dimensionId,
        data: {
          mentorScore: item.mentorScore,
          mentorNote: item.mentorNote,
          agreedScore: item.agreedScore,
          coachingTag: item.coachingTag,
        },
      };
    });

    const assessmentData: Prisma.AssessmentUncheckedUpdateInput = {};

    // Omitted means "leave it alone", matching `saveSelf`.
    if (dto.overallFeedback !== undefined) {
      assessmentData.overallFeedback = dto.overallFeedback;
    }

    if (dto.markAgreed) {
      // Agreeing is a claim that every dimension has a settled score. The same
      // invariant `submitMentor` used to check at the last moment now holds one
      // step earlier, so the cycle cannot reach `agreed` half-scored — and the
      // check runs against this request's scores, not the stale row.
      this.assertEveryDimensionAgreed(assessment, updates);
      assessmentData.status = AssessmentStatus.agreed;
      assessmentData.mentorSubmittedAt = new Date();
    } else if (assessment.status === AssessmentStatus.self_submitted) {
      // First mentor edit moves the assessment into review.
      assessmentData.status = AssessmentStatus.mentor_review;
    }

    await this.assessmentsRepository.applyScoreUpdates(
      id,
      updates,
      Object.keys(assessmentData).length > 0 ? assessmentData : undefined,
    );
    return this.findOne(id, user);
  }

  /**
   * §5.3–5.5 — Finalize the review: flag dimensions for coaching (weak or
   * stagnant/regressed vs the previous period), mark the assessment completed,
   * and notify the mentor.
   *
   * Only reachable from `agreed`. Completing is the second of two steps — the
   * facilitator marks the discussed scores agreed, then closes the cycle — so
   * that "we settled on these numbers" and "this cycle is over" are separately
   * recorded events with their own timestamps.
   */
  async submitMentor(
    id: string,
    user: AuthenticatedUser,
  ): Promise<AssessmentResponse> {
    const assessment = await this.getOrThrow(id);
    await this.assertMentorOf(assessment, user);
    if (assessment.status !== AssessmentStatus.agreed) {
      throw new BadRequestException(
        assessment.status === AssessmentStatus.completed
          ? 'This cycle is already complete'
          : 'Agree on the final scores with the student before completing',
      );
    }
    // `markAgreed` already enforced this, but the row is re-read here rather than
    // trusted: nothing else may reach `agreed`, and a completed cycle with a null
    // agreed score would corrupt every downstream average.
    if (assessment.scores.some((s) => s.agreedScore === null)) {
      throw new BadRequestException(
        'Every dimension needs an agreed score before completing',
      );
    }

    const scaleMax = await this.scaleMaxFor(assessment.period.cohortId);
    const previous = await this.assessmentsRepository.previousAgreedScores(
      assessment.studentId,
      assessment.period.cohortId,
      assessment.period.startDate,
    );

    const flagged: string[] = [];
    const updates = assessment.scores.map((score) => {
      const agreed = score.agreedScore as number;
      const recommended = isCoachingRecommended(
        agreed,
        scaleMax,
        previous.get(score.dimensionId),
      );
      if (recommended) flagged.push(score.dimension.name);
      return {
        dimensionId: score.dimensionId,
        data: { coachingRecommended: recommended },
      };
    });

    // Flag coaching and complete the assessment atomically. `mentorSubmittedAt`
    // is left as the `agreed` transition set it — this step records `completedAt`.
    await this.assessmentsRepository.applyScoreUpdates(id, updates, {
      status: AssessmentStatus.completed,
      completedAt: new Date(),
    });

    if (flagged.length > 0) {
      await this.notificationsService.create({
        userId: user.id,
        type: NotificationType.coaching_reminder,
        title: `Coaching recommended for ${assessment.student.name}`,
        body: `Dimensions needing attention: ${flagged.join(', ')}.`,
        href: APP_ROUTES.coaching,
      });
    }

    return this.findOne(id, user);
  }

  // ─────────────────────────── Helpers ───────────────────────────

  private async getOrThrow(id: string): Promise<AssessmentWithRelations> {
    const assessment = await this.assessmentsRepository.findById(id);
    if (!assessment) throw new NotFoundException(`Assessment ${id} not found`);
    return assessment;
  }

  /**
   * Role scope first, caller filters second.
   *
   * `cohortId` and `facilitatorId` are expressed as relation constraints rather
   * than by assigning `where.studentId`, so they compose with — and can never
   * overwrite — the role scoping applied below. A facilitator passing another
   * facilitator's id therefore intersects to an empty set instead of escaping
   * their own roster.
   */
  private async buildScopedWhere(
    query: AssessmentQueryDto,
    user: AuthenticatedUser,
  ): Promise<Prisma.AssessmentWhereInput> {
    const where: Prisma.AssessmentWhereInput = {};
    if (query.periodId) where.periodId = query.periodId;
    if (query.status) where.status = query.status;
    if (query.cohortId) where.period = { cohortId: query.cohortId };
    if (query.facilitatorId) {
      where.student = {
        selfAssessorAssignments: {
          some: { facilitatorId: query.facilitatorId, active: true },
        },
      };
    }

    if (user.role === Role.self_assessor) {
      where.studentId = user.id;
      return where;
    }

    if (user.role === Role.facilitator) {
      const studentIds = await this.assignmentsService.studentIdsForFacilitator(
        user.id,
      );
      if (query.studentId) {
        where.studentId = studentIds.includes(query.studentId)
          ? query.studentId
          : NO_MATCH;
      } else {
        where.studentId = { in: studentIds.length ? studentIds : [NO_MATCH] };
      }
      return where;
    }

    // Program coordinator: full access.
    if (query.mine) where.studentId = user.id;
    else if (query.studentId) where.studentId = query.studentId;
    return where;
  }

  private async assertCanRead(
    assessment: Assessment,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (user.role === Role.program_coordinator) return;
    if (user.role === Role.self_assessor) {
      if (assessment.studentId === user.id) return;
      throw new ForbiddenException(
        'Cannot access another student’s assessment',
      );
    }
    // Facilitator: only assigned students.
    const assigned = await this.assignmentsService.isAssigned(
      user.id,
      assessment.studentId,
    );
    if (!assigned) {
      throw new ForbiddenException('Student is not assigned to you');
    }
  }

  private assertOwner(assessment: Assessment, user: AuthenticatedUser): void {
    if (user.role !== Role.self_assessor || assessment.studentId !== user.id) {
      throw new ForbiddenException('Only the owning student may do this');
    }
  }

  private async assertMentorOf(
    assessment: Assessment,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (user.role !== Role.facilitator) {
      throw new ForbiddenException('Only the assigned facilitator may do this');
    }
    const assigned = await this.assignmentsService.isAssigned(
      user.id,
      assessment.studentId,
    );
    if (!assigned) {
      throw new ForbiddenException('Student is not assigned to you');
    }
  }

  /**
   * Every dimension must hold an agreed score once this request is applied.
   *
   * Checked against the stored row *overlaid with* the incoming updates, not
   * against either alone: the facilitator agrees in the same call that supplies
   * the last scores, so reading only the stored row would reject a complete
   * request, and reading only the payload would accept a partial one.
   */
  private assertEveryDimensionAgreed(
    assessment: AssessmentWithRelations,
    updates: {
      dimensionId: string;
      data: Prisma.AssessmentScoreUncheckedUpdateInput;
    }[],
  ): void {
    const incoming = new Map(
      updates.map((update) => [update.dimensionId, update.data.agreedScore]),
    );

    const unscored = assessment.scores.filter((score) => {
      const supplied = incoming.get(score.dimensionId);
      // `undefined` means the payload did not mention it, so the stored value stands.
      const effective = supplied === undefined ? score.agreedScore : supplied;
      return effective === null;
    });

    if (unscored.length > 0) {
      const names = unscored.map((score) => score.dimension.name).join(', ');
      throw new BadRequestException(
        `Every dimension needs an agreed score before marking scores agreed. Missing: ${names}`,
      );
    }
  }

  private async scaleMaxFor(cohortId: string): Promise<number> {
    const cohort = await this.cohortsService.findRaw(cohortId);
    return cohort.scoringScaleMax;
  }

  private assertInRange(
    value: number | undefined,
    scaleMax: number,
    field: string,
  ): void {
    if (value !== undefined && (value < 1 || value > scaleMax)) {
      throw new BadRequestException(
        `${field} must be between 1 and ${scaleMax}`,
      );
    }
  }

  /**
   * The response shape: scores in dimension order, and the student's active
   * mentor assignment flattened onto `facilitatorId`. The nested relation is
   * dropped rather than passed through — `facilitatorId` is the contract, and
   * leaving the join array on `student` would expose a second, differently
   * shaped way to read the same fact.
   */
  private shape(assessment: AssessmentWithRelations): AssessmentResponse {
    const { student, ...rest } = assessment;
    const { selfAssessorAssignments, ...safeStudent } = student;
    rest.scores.sort((a, b) => a.dimension.order - b.dimension.order);
    return {
      ...rest,
      student: safeStudent,
      facilitatorId: selfAssessorAssignments[0]?.facilitatorId ?? null,
    };
  }
}
