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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalQueryDto } from './dto/goal-query.dto';
import { Paginated } from '../../common/dto/pagination.dto';
import { Goal } from '../../../generated/prisma/client';

@ApiTags('goals')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a goal (students create their own)' })
  @ApiCreatedResponse({ description: 'The created goal' })
  create(
    @Body() dto: CreateGoalDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Goal> {
    return this.goalsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List goals (scoped to the caller’s role)' })
  @ApiOkResponse({ description: 'Paginated goals' })
  findAll(
    @Query() query: GoalQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<Goal>> {
    return this.goalsService.findAll(query, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a goal' })
  @ApiOkResponse({ description: 'The updated goal' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Goal> {
    return this.goalsService.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a goal' })
  @ApiNoContentResponse({ description: 'Goal deleted' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.goalsService.remove(id, user);
  }
}
