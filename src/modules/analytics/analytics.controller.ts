import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import {
  AnalyticsService,
  CohortAnalytics,
  GapAnalytics,
  OverviewAnalytics,
  StudentAnalytics,
} from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role or scope' })
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('student/:id')
  @ApiOperation({
    summary: 'Radar per period, trends, gaps and zones for one self-assessor',
    description:
      'One entry per period in the student’s cohort — including cycles still ' +
      'in progress, which carry `average: null` — each with self, mentor and ' +
      'agreed scores per dimension. `trend` compares the last two graded cycles.',
  })
  @ApiOkResponse({ description: 'Self-assessor growth analytics' })
  student(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StudentAnalytics> {
    return this.analyticsService.student(id, user);
  }

  @Get('cohort/:id')
  @Roles(Role.program_coordinator, Role.facilitator)
  @ApiOperation({
    summary:
      'Heatmap, weakest dimensions, completion rates, at-risk self-assessors',
    description:
      'Also returns `cohortName`, `participationRate` (share of the open ' +
      'cycle started), `dimensionAverages` for every dimension (unscored ones ' +
      'are `null`, never 0) and a chronological `trendline`. Heatmap rows ' +
      'carry each student’s `trend` and `average`.',
  })
  @ApiOkResponse({ description: 'Cohort analytics' })
  cohort(@Param('id') id: string): Promise<CohortAnalytics> {
    return this.analyticsService.cohort(id);
  }

  @Get('overview')
  @Roles(Role.program_coordinator)
  @ApiOperation({
    summary: 'Program-wide KPIs and facilitator workload (Coordinator)',
    description:
      'KPIs include `activeCohorts`, `completionRate` for the open cycle and ' +
      'a programme-wide `atRiskCount` scored against each cohort’s own scale. ' +
      'Workload rows carry `pendingReviews`. Also returns the merged ' +
      '`activityFeed` and a six-week `activityTrend` of submissions.',
  })
  @ApiOkResponse({ description: 'Overview analytics' })
  overview(): Promise<OverviewAnalytics> {
    return this.analyticsService.overview();
  }

  @Get('gap/:assessmentId')
  @ApiOperation({
    summary: 'Self vs facilitator vs agreed score per dimension',
    description:
      'Each dimension carries the signed `selfMentorGap` and the facilitator’s ' +
      '`mentorNote`, so the gap view can quote the reasoning beside the numbers.',
  })
  @ApiOkResponse({ description: 'Self/facilitator gap analysis' })
  gap(
    @Param('assessmentId') assessmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GapAnalytics> {
    return this.analyticsService.gap(assessmentId, user);
  }
}
