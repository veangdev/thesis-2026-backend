import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { PeriodsService } from './periods.service';
import { CreatePeriodDto } from './dto/create-period.dto';
import { UpdatePeriodDto } from './dto/update-period.dto';
import { AssessmentPeriod } from '../../../generated/prisma/client';

@ApiTags('periods')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@Controller()
export class PeriodsController {
  constructor(private readonly periodsService: PeriodsService) {}

  @Post('cohorts/:cohortId/periods')
  @Roles(Role.program_coordinator)
  @ApiOperation({
    summary: 'Create an assessment period (Program Coordinator)',
  })
  @ApiOkResponse({ description: 'The created period' })
  create(
    @Param('cohortId') cohortId: string,
    @Body() dto: CreatePeriodDto,
  ): Promise<AssessmentPeriod> {
    return this.periodsService.create(cohortId, dto);
  }

  @Get('cohorts/:cohortId/periods')
  @Roles(Role.program_coordinator, Role.facilitator)
  @ApiOperation({ summary: "List a cohort's assessment periods" })
  @ApiOkResponse({ description: 'Periods ordered by start date' })
  findByCohort(
    @Param('cohortId') cohortId: string,
  ): Promise<AssessmentPeriod[]> {
    return this.periodsService.findByCohort(cohortId);
  }

  @Patch('periods/:id')
  @Roles(Role.program_coordinator)
  @ApiOperation({
    summary: 'Update a period — set status to open/close the cycle',
  })
  @ApiOkResponse({ description: 'The updated period' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePeriodDto,
  ): Promise<AssessmentPeriod> {
    return this.periodsService.update(id, dto);
  }

  @Delete('periods/:id')
  @Roles(Role.program_coordinator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an upcoming assessment period (Program Coordinator)',
  })
  @ApiNoContentResponse({ description: 'Period deleted' })
  remove(@Param('id') id: string): Promise<void> {
    return this.periodsService.remove(id);
  }
}
