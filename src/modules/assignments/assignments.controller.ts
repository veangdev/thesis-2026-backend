import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { Paginated, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { MentorAssignment } from '../../../generated/prisma/client';

@ApiTags('assignments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@Controller()
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post('assignments')
  @Roles(Role.program_coordinator)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Assign a facilitator to a self-assessor (Coordinator)',
  })
  @ApiCreatedResponse({ description: 'The created assignment' })
  create(@Body() dto: CreateAssignmentDto): Promise<MentorAssignment> {
    return this.assignmentsService.create(dto);
  }

  @Delete('assignments/:id')
  @Roles(Role.program_coordinator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a facilitator↔self-assessor assignment (Coordinator)',
  })
  @ApiNoContentResponse({ description: 'Assignment removed' })
  remove(@Param('id') id: string): Promise<void> {
    return this.assignmentsService.remove(id);
  }

  @Get('assignments')
  @Roles(Role.program_coordinator)
  @ApiOperation({
    summary: 'List facilitator↔self-assessor assignments (Coordinator)',
  })
  @ApiOkResponse({ description: 'Paginated assignments' })
  findAll(
    @Query() pagination: PaginationQueryDto,
  ): Promise<Paginated<MentorAssignment>> {
    return this.assignmentsService.findAll(pagination);
  }

  @Get('users/me/facilitator')
  @Roles(Role.self_assessor)
  @ApiOperation({ summary: 'Get your own assigned facilitator' })
  @ApiOkResponse({ description: 'The assigned facilitator, or null' })
  myFacilitator(
    @CurrentUser('id') userId: string,
  ): Promise<AuthenticatedUser | null> {
    return this.assignmentsService.facilitatorForStudent(userId);
  }

  @Get('facilitators/:id/students')
  @Roles(Role.program_coordinator, Role.facilitator)
  @ApiOperation({
    summary: 'List the self-assessors assigned to a facilitator',
  })
  @ApiOkResponse({ description: 'Assigned self-assessors (sanitized)' })
  studentsForFacilitator(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuthenticatedUser[]> {
    // Facilitators may only view their own assigned students.
    if (user.role === Role.facilitator && user.id !== id) {
      throw new ForbiddenException(
        'Cannot view another facilitator’s students',
      );
    }
    return this.assignmentsService.studentsForFacilitator(id);
  }
}
