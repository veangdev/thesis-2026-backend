import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import { AssessmentsService } from './assessments.service';
import { AssessmentWithRelations } from './assessments.repository';
import { AssessmentQueryDto } from './dto/assessment-query.dto';
import { UpdateSelfAssessmentDto } from './dto/update-self-assessment.dto';
import { UpdateMentorAssessmentDto } from './dto/update-mentor-assessment.dto';
import { Paginated } from '../../common/dto/pagination.dto';

@ApiTags('assessments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role or scope' })
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List assessments (scoped to the caller’s role)',
  })
  @ApiOkResponse({ description: 'Paginated assessments' })
  findAll(
    @Query() query: AssessmentQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<AssessmentWithRelations>> {
    return this.assessmentsService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one assessment with its scores and dimensions',
  })
  @ApiOkResponse({ description: 'The assessment' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssessmentWithRelations> {
    return this.assessmentsService.findOne(id, user);
  }

  @Patch(':id/self')
  @Roles(Role.self_assessor)
  @ApiOperation({ summary: 'Save draft self scores and reflections' })
  @ApiOkResponse({ description: 'The updated assessment' })
  saveSelf(
    @Param('id') id: string,
    @Body() dto: UpdateSelfAssessmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssessmentWithRelations> {
    return this.assessmentsService.saveSelf(id, dto, user);
  }

  @Post(':id/self/submit')
  @Roles(Role.self_assessor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit the self-assessment for facilitator review',
  })
  @ApiOkResponse({ description: 'The submitted assessment' })
  submitSelf(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssessmentWithRelations> {
    return this.assessmentsService.submitSelf(id, user);
  }

  @Patch(':id/mentor')
  @Roles(Role.facilitator)
  @ApiOperation({
    summary: 'Save facilitator scores, notes, and agreed scores',
  })
  @ApiOkResponse({ description: 'The updated assessment' })
  saveMentor(
    @Param('id') id: string,
    @Body() dto: UpdateMentorAssessmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssessmentWithRelations> {
    return this.assessmentsService.saveMentor(id, dto, user);
  }

  @Post(':id/mentor/submit')
  @Roles(Role.facilitator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete the review (flags coaching, records growth)',
  })
  @ApiOkResponse({ description: 'The completed assessment' })
  submitMentor(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssessmentWithRelations> {
    return this.assessmentsService.submitMentor(id, user);
  }
}
