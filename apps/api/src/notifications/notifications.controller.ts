import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthedUser } from '../auth/index.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'My notifications (most recent first).' })
  list(@CurrentUser() user: AuthedUser, @Query('unreadOnly') unreadOnly?: string) {
    return this.notifications.listMine(user.id, { unreadOnly: unreadOnly === 'true' });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthedUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.notifications.markRead(id, user.id);
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user: AuthedUser) {
    return { marked: await this.notifications.markAllRead(user.id) };
  }
}
