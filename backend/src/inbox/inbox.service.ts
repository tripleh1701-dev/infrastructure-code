import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { DynamoDBRouterService } from '../common/dynamodb/dynamodb-router.service';
import { NotificationService } from '../common/notifications/notification.service';

export type NotificationType = 'APPROVAL_REQUEST' | 'APPROVAL_GRANTED' | 'APPROVAL_REJECTED' | 'INFO';
export type NotificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISMISSED';

export interface InboxNotification {
  notificationId: string;
  accountId: string;
  recipientEmail: string;
  recipientUserId?: string;
  senderEmail: string;
  senderUserId?: string;
  type: NotificationType;
  status: NotificationStatus;
  title: string;
  message: string;
  /** Link context for approval-type notifications */
  context?: {
    executionId?: string;
    pipelineId?: string;
    buildJobId?: string;
    stageId?: string;
    stageName?: string;
    pipelineName?: string;
    buildNumber?: string;
    branch?: string;
  };
  createdAt: string;
  updatedAt: string;
  actionedAt?: string;
  actionedBy?: string;
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly dynamoDb: DynamoDBService,
    private readonly dynamoDbRouter: DynamoDBRouterService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Create an inbox notification (typically an approval request).
   */
  async createNotification(
    accountId: string,
    notification: Omit<InboxNotification, 'notificationId' | 'createdAt' | 'updatedAt'>,
  ): Promise<InboxNotification> {
    const notificationId = uuidv4();
    const now = new Date().toISOString();
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

    const item: Record<string, any> = {
      PK: isPrivate ? 'INBOX#LIST' : `ACCT#${accountId}`,
      SK: `INBOX#${notificationId}`,
      GSI1PK: 'ENTITY#INBOX',
      GSI1SK: `INBOX#${notificationId}`,
      // GSI2 for querying by recipient email
      GSI2PK: `INBOX_USER#${notification.recipientEmail}`,
      GSI2SK: `INBOX#${now}#${notificationId}`,
      entityType: 'INBOX_NOTIFICATION',
      id: notificationId,
      notificationId,
      accountId,
      recipientEmail: notification.recipientEmail,
      recipientUserId: notification.recipientUserId || null,
      senderEmail: notification.senderEmail,
      senderUserId: notification.senderUserId || null,
      type: notification.type,
      status: notification.status,
      title: notification.title,
      message: notification.message,
      context: notification.context || {},
      createdAt: now,
      updatedAt: now,
    };

    if (isPrivate) {
      await this.dynamoDbRouter.put(accountId, { Item: item });
    } else {
      await this.dynamoDb.put({ Item: item });
    }

    this.logger.log(
      `[INBOX] Notification ${notificationId} created for ${notification.recipientEmail}`,
    );

    // Send SES email for approval requests so approvers are notified even when offline
    if (notification.type === 'APPROVAL_REQUEST') {
      try {
        await this.notificationService.sendApprovalRequestEmail(
          {
            approverEmail: notification.recipientEmail,
            requesterEmail: notification.senderEmail,
            pipelineName: notification.context?.pipelineName || 'Unknown Pipeline',
            stageName: notification.context?.stageName || 'Unknown Stage',
            branch: notification.context?.branch,
            executionId: notification.context?.executionId,
          },
          { accountId },
        );
      } catch (emailErr: any) {
        // Never block inbox creation if email fails
        this.logger.error(
          `[INBOX] SES email failed for ${notification.recipientEmail}: ${emailErr.message}`,
        );
      }
    }

    return {
      notificationId,
      accountId,
      recipientEmail: notification.recipientEmail,
      recipientUserId: notification.recipientUserId,
      senderEmail: notification.senderEmail,
      senderUserId: notification.senderUserId,
      type: notification.type,
      status: notification.status,
      title: notification.title,
      message: notification.message,
      context: notification.context,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * List all notifications for a user (by email).
   */
  async listForUser(
    accountId: string,
    userEmail: string,
  ): Promise<InboxNotification[]> {
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

    const result = isPrivate
      ? await this.dynamoDbRouter.queryByIndex(
          accountId,
          'GSI2',
          'GSI2PK = :pk',
          { ':pk': `INBOX_USER#${userEmail}` },
        )
      : await this.dynamoDb.queryByIndex(
          'GSI2',
          'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
          { ':pk': `INBOX_USER#${userEmail}`, ':sk': 'INBOX#' },
        );

    return (result.Items || [])
      .filter((item) => item.entityType === 'INBOX_NOTIFICATION')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map(this.mapToNotification);
  }

  /**
   * Approve an approval request notification.
   */
  async approveNotification(
    accountId: string,
    notificationId: string,
    userId: string,
    userEmail: string,
  ): Promise<InboxNotification> {
    return this.updateNotificationStatus(
      accountId,
      notificationId,
      'APPROVED',
      userId,
      userEmail,
    );
  }

  /**
   * Reject an approval request notification.
   */
  async rejectNotification(
    accountId: string,
    notificationId: string,
    userId: string,
    userEmail: string,
  ): Promise<InboxNotification> {
    return this.updateNotificationStatus(
      accountId,
      notificationId,
      'REJECTED',
      userId,
      userEmail,
    );
  }

  /**
   * Dismiss an info notification.
   */
  async dismissNotification(
    accountId: string,
    notificationId: string,
  ): Promise<void> {
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);
    const key = isPrivate
      ? { PK: 'INBOX#LIST', SK: `INBOX#${notificationId}` }
      : { PK: `ACCT#${accountId}`, SK: `INBOX#${notificationId}` };

    const params = {
      Key: key,
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'DISMISSED',
        ':now': new Date().toISOString(),
      },
    };

    if (isPrivate) {
      await this.dynamoDbRouter.update(accountId, params);
    } else {
      await this.dynamoDb.update(params);
    }
  }

  /**
   * Get count of pending notifications for badge display.
   */
  async getPendingCount(
    accountId: string,
    userEmail: string,
  ): Promise<number> {
    const notifications = await this.listForUser(accountId, userEmail);
    return notifications.filter((n) => n.status === 'PENDING').length;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async updateNotificationStatus(
    accountId: string,
    notificationId: string,
    status: NotificationStatus,
    userId: string,
    userEmail: string,
  ): Promise<InboxNotification> {
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);
    const key = isPrivate
      ? { PK: 'INBOX#LIST', SK: `INBOX#${notificationId}` }
      : { PK: `ACCT#${accountId}`, SK: `INBOX#${notificationId}` };

    const now = new Date().toISOString();
    const params = {
      Key: key,
      UpdateExpression:
        'SET #status = :status, actionedAt = :now, actionedBy = :user, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':user': userEmail,
        ':now': now,
      },
      ReturnValues: 'ALL_NEW' as const,
    };

    let result;
    if (isPrivate) {
      result = await this.dynamoDbRouter.update(accountId, params);
    } else {
      result = await this.dynamoDb.update(params);
    }

    if (!result?.Attributes) {
      throw new NotFoundException(`Notification ${notificationId} not found`);
    }

    return this.mapToNotification(result.Attributes);
  }

  private mapToNotification(item: any): InboxNotification {
    return {
      notificationId: item.notificationId || item.id,
      accountId: item.accountId,
      recipientEmail: item.recipientEmail,
      recipientUserId: item.recipientUserId,
      senderEmail: item.senderEmail,
      senderUserId: item.senderUserId,
      type: item.type,
      status: item.status,
      title: item.title,
      message: item.message,
      context: item.context,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      actionedAt: item.actionedAt,
      actionedBy: item.actionedBy,
    };
  }
}
