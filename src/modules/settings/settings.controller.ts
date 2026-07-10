import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
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
import { SettingsService } from './settings.service';
import { UpdateNotificationRuleDto } from './dto/update-notification-rule.dto';
import { NotificationRule } from '../../../generated/prisma/client';

@ApiTags('settings')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('notification-rules')
  @Roles(Role.program_coordinator)
  @ApiOperation({ summary: 'List notification rule toggles (Coordinator)' })
  @ApiOkResponse({ description: 'Stored notification rules' })
  getNotificationRules(): Promise<NotificationRule[]> {
    return this.settingsService.getNotificationRules();
  }

  @Patch('notification-rules/:key')
  @Roles(Role.program_coordinator)
  @ApiOperation({
    summary: 'Enable or disable a notification rule (Coordinator)',
  })
  @ApiOkResponse({ description: 'The updated rule' })
  updateNotificationRule(
    @Param('key') key: string,
    @Body() dto: UpdateNotificationRuleDto,
  ): Promise<NotificationRule> {
    return this.settingsService.setNotificationRule(key, dto.enabled);
  }
}
