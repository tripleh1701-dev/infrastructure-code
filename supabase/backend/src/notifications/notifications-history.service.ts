import { Injectable } from '@nestjs/common';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';

export interface NotificationHistoryEntry {
  id: string;
  licenseId?: string;
  credentialId?: string;
  accountId: string;
  recipientEmail: string;
  recipientName: string;
  notificationType: string;
  subject: string;
  daysUntilExpiry: number;
  status: string;
  errorMessage?: string;
  sentAt: string;
}

@Injectable()
export class NotificationsHistoryService {
  constructor(private readonly dynamoDb: DynamoDBService) {}

  async findAll(
    accountId?: string,
    limit = 10,
  ): Promise<NotificationHistoryEntry[]> {
    if (!accountId) return [];

    const result = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ACCOUNT#${accountId}`,
        ':sk': 'NOTIFICATION#',
      },
      ScanIndexForward: false,
      Limit: limit,
    });

    return (result.Items || []).map(this.mapToEntry);
  }

  private mapToEntry(item: Record<string, any>): NotificationHistoryEntry {
    return {
      id: item.id,
      licenseId: item.licenseId,
      credentialId: item.credentialId,
      accountId: item.accountId,
      recipientEmail: item.recipientEmail,
      recipientName: item.recipientName,
      notificationType: item.notificationType || 'email',
      subject: item.subject,
      daysUntilExpiry: item.daysUntilExpiry ?? 0,
      status: item.status || 'sent',
      errorMessage: item.errorMessage,
      sentAt: item.sentAt || item.createdAt,
    };
  }
}
