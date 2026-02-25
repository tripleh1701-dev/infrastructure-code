import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { NotificationService } from '../common/notifications/notification.service';

export type NotificationType = 'APPROVAL_REQUEST' | 'APPROVAL_GRANTED' | 'APPROVAL_REJECTED' | 'INFO';
export type NotificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISMISSED' | 'STALE';

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
    private readonly notificationService: NotificationService,
  ) {}

  async createNotification(
    accountId: string,
    notification: Omit<InboxNotification, 'notificationId' | 'createdAt' | 'updatedAt'>,
  ): Promise<InboxNotification> {
    const notificationId = uuidv4();
    const now = new Date().toISOString();

    const item: Record<string, any> = {
      PK: `ACCT#${accountId}`,
      SK: `INBOX#${notificationId}`,
      GSI1PK: 'ENTITY#INBOX',
      GSI1SK: `INBOX#${notificationId}`,
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

    await this.dynamoDb.put({ Item: item });

    this.logger.log(`[INBOX] Notification ${notificationId} created for ${notification.recipientEmail}`);

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
        this.logger.error(`[INBOX] SES email failed for ${notification.recipientEmail}: ${emailErr.message}`);
      }
    }

    return {
      notificationId, accountId,
      recipientEmail: notification.recipientEmail, recipientUserId: notification.recipientUserId,
      senderEmail: notification.senderEmail, senderUserId: notification.senderUserId,
      type: notification.type, status: notification.status,
      title: notification.title, message: notification.message,
      context: notification.context, createdAt: now, updatedAt: now,
    };
  }

  async listForUser(accountId: string, userEmail: string): Promise<InboxNotification[]> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI2',
      'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
      { ':pk': `INBOX_USER#${userEmail}`, ':sk': 'INBOX#' },
    );

    return (result.Items || [])
      .filter((item) => item.entityType === 'INBOX_NOTIFICATION')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map(this.mapToNotification);
  }

  async approveNotification(accountId: string, notificationId: string, userId: string, userEmail: string): Promise<InboxNotification> {
    const notification = await this.updateNotificationStatus(accountId, notificationId, 'APPROVED', userId, userEmail);
    if (notification.context?.executionId && notification.context?.stageId) {
      await this.markSiblingNotificationsStale(accountId, notificationId, notification.context.executionId, notification.context.stageId);
    }
    return notification;
  }

  private async markSiblingNotificationsStale(accountId: string, approvedNotificationId: string, executionId: string, stageId: string): Promise<void> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
      { ':pk': 'ENTITY#INBOX', ':sk': 'INBOX#' },
    );

    const siblings = (result.Items || []).filter((item) =>
      item.entityType === 'INBOX_NOTIFICATION' &&
      item.notificationId !== approvedNotificationId &&
      item.status === 'PENDING' &&
      item.type === 'APPROVAL_REQUEST' &&
      item.context?.executionId === executionId &&
      item.context?.stageId === stageId,
    );

    const now = new Date().toISOString();
    for (const sibling of siblings) {
      const key = { PK: `ACCT#${accountId}`, SK: `INBOX#${sibling.notificationId || sibling.id}` };

      try {
        await this.dynamoDb.update({
          Key: key,
          UpdateExpression: 'SET #status = :status, updatedAt = :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': 'STALE', ':now': now },
        });
      } catch (err: any) {
        this.logger.error(`[INBOX] Failed to mark notification as STALE: ${err.message}`);
      }
    }
  }

  async rejectNotification(accountId: string, notificationId: string, userId: string, userEmail: string): Promise<InboxNotification> {
    return this.updateNotificationStatus(accountId, notificationId, 'REJECTED', userId, userEmail);
  }

  async dismissNotification(accountId: string, notificationId: string): Promise<void> {
    const key = { PK: `ACCT#${accountId}`, SK: `INBOX#${notificationId}` };

    await this.dynamoDb.update({
      Key: key,
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'DISMISSED', ':now': new Date().toISOString() },
    });
  }

  async getPendingCount(accountId: string, userEmail: string): Promise<number> {
    const notifications = await this.listForUser(accountId, userEmail);
    return notifications.filter((n) => n.status === 'PENDING').length;
  }

  private async updateNotificationStatus(accountId: string, notificationId: string, status: NotificationStatus, userId: string, userEmail: string): Promise<InboxNotification> {
    const key = { PK: `ACCT#${accountId}`, SK: `INBOX#${notificationId}` };
    const now = new Date().toISOString();

    const result = await this.dynamoDb.update({
      Key: key,
      UpdateExpression: 'SET #status = :status, actionedAt = :now, actionedBy = :user, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status, ':user': userEmail, ':now': now },
      ReturnValues: 'ALL_NEW' as const,
    });

    if (!result?.Attributes) {
      throw new NotFoundException(`Notification ${notificationId} not found`);
    }

    return this.mapToNotification(result.Attributes);
  }

  private mapToNotification(item: any): InboxNotification {
    return {
      notificationId: item.notificationId || item.id,
      accountId: item.accountId,
      recipientEmail: item.recipientEmail, recipientUserId: item.recipientUserId,
      senderEmail: item.senderEmail, senderUserId: item.senderUserId,
      type: item.type, status: item.status,
      title: item.title, message: item.message,
      context: item.context,
      createdAt: item.createdAt, updatedAt: item.updatedAt,
      actionedAt: item.actionedAt, actionedBy: item.actionedBy,
    };
  }
}
