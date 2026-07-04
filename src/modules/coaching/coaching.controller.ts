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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CoachingService } from './coaching.service';
import { SessionWithRelations } from './coaching.repository';
import { CreateCoachingSessionDto } from './dto/create-coaching-session.dto';
import { UpdateCoachingSessionDto } from './dto/update-coaching-session.dto';
import {
  CreateActionItemDto,
  UpdateActionItemDto,
} from './dto/action-item.dto';
import { CoachingQueryDto } from './dto/coaching-query.dto';
import { Paginated } from '../../common/dto/pagination.dto';
import { ActionItem } from '../../../generated/prisma/client';

@ApiTags('coaching')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role or scope' })
@Controller()
export class CoachingController {
  constructor(private readonly coachingService: CoachingService) {}

  @Post('coaching-sessions')
  @Roles(Role.program_coordinator, Role.facilitator)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a coaching session (Facilitator/Coordinator)',
  })
  @ApiCreatedResponse({ description: 'The created session' })
  create(
    @Body() dto: CreateCoachingSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionWithRelations> {
    return this.coachingService.create(dto, user);
  }

  @Get('coaching-sessions')
  @ApiOperation({ summary: 'List coaching sessions (scoped to the caller)' })
  @ApiOkResponse({ description: 'Paginated sessions' })
  findAll(
    @Query() query: CoachingQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<SessionWithRelations>> {
    return this.coachingService.findAll(query, user);
  }

  @Get('coaching-sessions/:id')
  @ApiOperation({
    summary: 'Get a coaching session with participants and items',
  })
  @ApiOkResponse({ description: 'The session' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionWithRelations> {
    return this.coachingService.findOne(id, user);
  }

  @Patch('coaching-sessions/:id')
  @Roles(Role.program_coordinator, Role.facilitator)
  @ApiOperation({ summary: 'Update a coaching session' })
  @ApiOkResponse({ description: 'The updated session' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCoachingSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionWithRelations> {
    return this.coachingService.update(id, dto, user);
  }

  @Delete('coaching-sessions/:id')
  @Roles(Role.program_coordinator, Role.facilitator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a coaching session' })
  @ApiNoContentResponse({ description: 'Session deleted' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.coachingService.remove(id, user);
  }

  @Post('coaching-sessions/:id/action-items')
  @Roles(Role.program_coordinator, Role.facilitator)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an action item to a session' })
  @ApiCreatedResponse({ description: 'The created action item' })
  addActionItem(
    @Param('id') id: string,
    @Body() dto: CreateActionItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActionItem> {
    return this.coachingService.addActionItem(id, dto, user);
  }

  @Patch('action-items/:id')
  @Roles(Role.program_coordinator, Role.facilitator)
  @ApiOperation({ summary: 'Update an action item (e.g. mark done)' })
  @ApiOkResponse({ description: 'The updated action item' })
  updateActionItem(
    @Param('id') id: string,
    @Body() dto: UpdateActionItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActionItem> {
    return this.coachingService.updateActionItem(id, dto, user);
  }
}
