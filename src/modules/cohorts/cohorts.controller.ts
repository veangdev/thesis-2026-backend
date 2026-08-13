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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CohortsService } from './cohorts.service';
import { CreateCohortDto } from './dto/create-cohort.dto';
import { UpdateCohortDto } from './dto/update-cohort.dto';
import { CohortQueryDto } from './dto/cohort-query.dto';
import { CohortResponseDto } from './dto/cohort-response.dto';
import { Paginated } from '../../common/dto/pagination.dto';

@ApiTags('cohorts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@Controller('cohorts')
export class CohortsController {
  constructor(private readonly cohortsService: CohortsService) {}

  @Post()
  @Roles(Role.program_coordinator)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a cohort (Program Coordinator only)' })
  @ApiCreatedResponse({
    description: 'The created cohort',
    type: CohortResponseDto,
  })
  create(@Body() dto: CreateCohortDto): Promise<CohortResponseDto> {
    return this.cohortsService.create(dto);
  }

  @Get()
  @Roles(Role.program_coordinator, Role.facilitator)
  @ApiOperation({ summary: 'List cohorts (Program Coordinator, Facilitator)' })
  @ApiOkResponse({
    description: 'Paginated cohorts',
    type: [CohortResponseDto],
  })
  findAll(
    @Query() query: CohortQueryDto,
  ): Promise<Paginated<CohortResponseDto>> {
    return this.cohortsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.program_coordinator, Role.facilitator, Role.self_assessor)
  @ApiOperation({
    summary: 'Get a single cohort by id',
    description:
      'Staff may read any cohort. A self-assessor may read only the cohort they ' +
      'are enrolled in — they need its scoring scale to sit an assessment at all.',
  })
  @ApiOkResponse({ description: 'The cohort', type: CohortResponseDto })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CohortResponseDto> {
    return this.cohortsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.program_coordinator)
  @ApiOperation({
    summary:
      'Update a cohort, incl. scoringScaleMax (Program Coordinator only)',
  })
  @ApiOkResponse({ description: 'The updated cohort', type: CohortResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCohortDto,
  ): Promise<CohortResponseDto> {
    return this.cohortsService.update(id, dto);
  }
}
