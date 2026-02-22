import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InboxService } from './inbox.service';
import { ExecutionsService } from '../executions/executions.service';
import { AccountGuard } from '../auth/guards/account.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CognitoUser } from '../auth/interfaces/cognito-user.interface';

/**
 * Inbox Controller
 *
 * Provides REST API endpoints for user inbox / notification management.
 *
 * Route hierarchy:
 *   GET    /api/inbox                         — List notifications for current user
 *   GET    /api/inbox/count                   — Get pending notification count
 *   POST   /api/inbox/:notificationId/approve — Approve an approval request
 *   POST   /api/inbox/:notificationId/reject  — Reject an approval request
 *   POST   /api/inbox/:notificationId/dismiss — Dismiss a notification
 */
@Controller('inbox')
@UseGuards(AccountGuard)
export class InboxController {
  constructor(
    private readonly inboxService: InboxService,
    @Inject(forwardRef(() => ExecutionsService))
    private readonly executionsService: ExecutionsService,
  ) {}

  @Get()
  async listNotifications(@CurrentUser() user: CognitoUser) {
    return this.inboxService.listForUser(
      user.accountId!,
      user.email,
    );
  }

  @Get('count')
  async getPendingCount(@CurrentUser() user: CognitoUser) {
    const count = await this.inboxService.getPendingCount(
      user.accountId!,
      user.email,
    );
    return { count };
  }

  @Post(':notificationId/approve')
  @HttpCode(HttpStatus.OK)
  async approveNotification(
    @CurrentUser() user: CognitoUser,
    @Param('notificationId') notificationId: string,
  ) {
    const notification = await this.inboxService.approveNotification(
      user.accountId!,
      notificationId,
      user.sub,
      user.email,
    );

    // If this is a pipeline approval, also approve the execution stage in DynamoDB
    if (notification.context?.executionId && notification.context?.stageId) {
      await this.executionsService.approveStage(
        user.accountId!,
        notification.context.executionId,
        notification.context.stageId,
        user.sub,
      );
    }

    return {
      message: `Notification ${notificationId} approved`,
      notification,
    };
  }

  @Post(':notificationId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectNotification(
    @CurrentUser() user: CognitoUser,
    @Param('notificationId') notificationId: string,
  ) {
    const notification = await this.inboxService.rejectNotification(
      user.accountId!,
      notificationId,
      user.sub,
      user.email,
    );
    return {
      message: `Notification ${notificationId} rejected`,
      notification,
    };
  }

  @Post(':notificationId/dismiss')
  @HttpCode(HttpStatus.OK)
  async dismissNotification(
    @CurrentUser() user: CognitoUser,
    @Param('notificationId') notificationId: string,
  ) {
    await this.inboxService.dismissNotification(
      user.accountId!,
      notificationId,
    );
    return { message: `Notification ${notificationId} dismissed` };
  }
}
