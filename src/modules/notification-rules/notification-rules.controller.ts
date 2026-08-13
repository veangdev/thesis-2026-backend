import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { NotificationRulesService } from './notification-rules.service';
import { NotificationRuleResponseDto } from './dto/notification-rule-response.dto';
import { UpdateNotificationRuleDto } from './dto/update-notification-rule.dto';

@ApiTags('notification-rules')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@Controller('notification-rules')
export class NotificationRulesController {
  constructor(private readonly rulesService: NotificationRulesService) {}

  @Get()
  @Roles(Role.program_coordinator)
  @ApiOperation({
    summary: 'List program notification rules (Program Coordinator only)',
  })
  @ApiOkResponse({
    description: 'Every rule with its current state',
    type: [NotificationRuleResponseDto],
  })
  findAll(): Promise<NotificationRuleResponseDto[]> {
    return this.rulesService.findAll();
  }

  @Patch(':key')
  @Roles(Role.program_coordinator)
  @ApiOperation({
    summary: 'Enable or disable one rule (Program Coordinator only)',
  })
  @ApiOkResponse({
    description: 'The updated rule',
    type: NotificationRuleResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Unknown rule key' })
  update(
    @Param('key') key: string,
    @Body() dto: UpdateNotificationRuleDto,
  ): Promise<NotificationRuleResponseDto> {
    return this.rulesService.update(key, dto.enabled);
  }
}
