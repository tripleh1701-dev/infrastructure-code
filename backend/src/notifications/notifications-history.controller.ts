import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { NotificationsHistoryService } from './notifications-history.service';
import { AccountGuard } from '../auth/guards/account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * GET /api/notification-history
 * Returns notification history for license/credential expiry reminders.
 */
@Controller('notification-history')
@UseGuards(AccountGuard)
export class NotificationsHistoryController {
  constructor(
    private readonly notificationsHistoryService: NotificationsHistoryService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user', 'viewer')
  async findAll(
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsHistoryService.findAll(
      accountId,
      limit ? parseInt(limit, 10) : 10,
    );
  }
}
