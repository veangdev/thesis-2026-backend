import {
  Body,
  Controller,
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
  @ApiOperation({ summary: 'Assign a facilitator to a student (Coordinator)' })
  @ApiCreatedResponse({ description: 'The created assignment' })
  create(@Body() dto: CreateAssignmentDto): Promise<MentorAssignment> {
    return this.assignmentsService.create(dto);
  }

  @Get('assignments')
  @Roles(Role.program_coordinator)
  @ApiOperation({ summary: 'List mentor↔student assignments (Coordinator)' })
  @ApiOkResponse({ description: 'Paginated assignments' })
  findAll(
    @Query() pagination: PaginationQueryDto,
  ): Promise<Paginated<MentorAssignment>> {
    return this.assignmentsService.findAll(pagination);
  }

  @Get('facilitators/:id/students')
  @Roles(Role.program_coordinator, Role.facilitator)
  @ApiOperation({ summary: 'List the students assigned to a facilitator' })
  @ApiOkResponse({ description: 'Assigned students (sanitized)' })
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
