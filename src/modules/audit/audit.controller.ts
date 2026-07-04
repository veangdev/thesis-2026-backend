import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuditService } from './audit.service';
import { Paginated, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AuditLog } from '../../../generated/prisma/client';

@ApiTags('audit-logs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(Role.program_coordinator)
  @ApiOperation({ summary: 'List admin audit log entries (Coordinator only)' })
  @ApiOkResponse({ description: 'Paginated audit log' })
  findAll(
    @Query() pagination: PaginationQueryDto,
  ): Promise<Paginated<AuditLog>> {
    return this.auditService.findAll(pagination);
  }
}
