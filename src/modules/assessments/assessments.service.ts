import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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
    });
  }

  // ─────────────────────────── Reads (scoped) ───────────────────────────

  async findAll(
    query: AssessmentQueryDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<AssessmentWithRelations>> {
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
      rows.map((r) => this.sortScores(r)),
      total,
      page,
      pageSize,
    );
  }

  async findOne(
    id: string,
    user: AuthenticatedUser,
  ): Promise<AssessmentWithRelations> {
    const assessment = await this.getOrThrow(id);
    await this.assertCanRead(assessment, user);
    return this.sortScores(assessment);
  }

  // ─────────────────────────── Self-assessment ───────────────────────────

  async saveSelf(
    id: string,
    dto: UpdateSelfAssessmentDto,
    user: AuthenticatedUser,
  ): Promise<AssessmentWithRelations> {
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

    await this.assessmentsRepository.applyScoreUpdates(id, updates);
    return this.findOne(id, user);
  }

  async submitSelf(
    id: string,
    user: AuthenticatedUser,
  ): Promise<AssessmentWithRelations> {
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
      });
    }

    return this.findOne(id, user);
  }

  // ─────────────────────────── Mentor review ───────────────────────────

  async saveMentor(
    id: string,
    dto: UpdateMentorAssessmentDto,
    user: AuthenticatedUser,
  ): Promise<AssessmentWithRelations> {
    const assessment = await this.getOrThrow(id);
    await this.assertMentorOf(assessment, user);
    if (
      assessment.status !== AssessmentStatus.self_submitted &&
      assessment.status !== AssessmentStatus.mentor_review
    ) {
      throw new BadRequestException(
        'Mentor review requires a submitted self-assessment',
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
        },
      };
    });

    // First mentor edit moves the assessment into review, in the same transaction.
    const statusData =
      assessment.status === AssessmentStatus.self_submitted
        ? { status: AssessmentStatus.mentor_review }
        : undefined;

    await this.assessmentsRepository.applyScoreUpdates(id, updates, statusData);
    return this.findOne(id, user);
  }

  /**
   * §5.3–5.5 — Finalize the review: require an agreed score per dimension,
   * flag dimensions for coaching (weak or stagnant/regressed vs the previous
   * period), mark the assessment completed, and notify the mentor.
   */
  async submitMentor(
    id: string,
    user: AuthenticatedUser,
  ): Promise<AssessmentWithRelations> {
    const assessment = await this.getOrThrow(id);
    await this.assertMentorOf(assessment, user);
    if (
      assessment.status !== AssessmentStatus.self_submitted &&
      assessment.status !== AssessmentStatus.mentor_review
    ) {
      throw new BadRequestException('Assessment is not ready to be completed');
    }
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

    // Flag coaching and complete the assessment atomically.
    await this.assessmentsRepository.applyScoreUpdates(id, updates, {
      status: AssessmentStatus.completed,
      mentorSubmittedAt: new Date(),
    });

    if (flagged.length > 0) {
      await this.notificationsService.create({
        userId: user.id,
        type: NotificationType.coaching_reminder,
        title: `Coaching recommended for ${assessment.student.name}`,
        body: `Dimensions needing attention: ${flagged.join(', ')}.`,
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

  private async buildScopedWhere(
    query: AssessmentQueryDto,
    user: AuthenticatedUser,
  ): Promise<Prisma.AssessmentWhereInput> {
    const where: Prisma.AssessmentWhereInput = {};
    if (query.periodId) where.periodId = query.periodId;
    if (query.status) where.status = query.status;

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

  private async scaleMaxFor(cohortId: string): Promise<number> {
    const cohort = await this.cohortsService.findOne(cohortId);
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

  private sortScores(
    assessment: AssessmentWithRelations,
  ): AssessmentWithRelations {
    assessment.scores.sort((a, b) => a.dimension.order - b.dimension.order);
    return assessment;
  }
}
