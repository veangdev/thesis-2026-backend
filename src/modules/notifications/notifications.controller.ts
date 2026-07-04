import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { Paginated } from '../../common/dto/pagination.dto';
import { Notification } from '../../../generated/prisma/client';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List the caller’s notifications' })
  @ApiOkResponse({ description: 'Paginated notifications' })
  findAll(
    @Query() query: NotificationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<Notification>> {
    return this.notificationsService.findForUser(user, query);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all of the caller’s notifications as read' })
  @ApiOkResponse({ description: 'Number of notifications marked read' })
  markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ count: number }> {
    return this.notificationsService.markAllRead(user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiOkResponse({ description: 'The updated notification' })
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Notification> {
    return this.notificationsService.markRead(id, user);
  }
}
