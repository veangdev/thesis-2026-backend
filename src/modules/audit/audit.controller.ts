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
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditLogWithActor } from './audit.repository';
import { Paginated } from '../../common/dto/pagination.dto';

@ApiTags('audit-logs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(Role.program_coordinator)
  @ApiOperation({
    summary:
      'List admin audit log entries, filterable by actor/action/entity (Coordinator only)',
  })
  @ApiOkResponse({ description: 'Paginated audit log' })
  findAll(
    @Query() query: AuditQueryDto,
  ): Promise<Paginated<AuditLogWithActor>> {
    return this.auditService.findAll(query);
  }
}
