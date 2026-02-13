import { Injectable, Logger } from '@nestjs/common';
import { DynamoDBService } from '../dynamodb/dynamodb.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Delivery status of a notification attempt
 */
export type NotificationDeliveryStatus =
  | 'sent'
  | 'failed'
  | 'skipped';

/**
 * A single notification audit log entry persisted in DynamoDB
 */
export interface NotificationAuditEntry {
  id: string;
  notificationType: string;
  recipientEmail: string;
  recipientFirstName: string;
  recipientLastName: string;
  accountId?: string;
  accountName?: string;
  userId?: string;
  deliveryStatus: NotificationDeliveryStatus;
  sesMessageId?: string;
  errorMessage?: string;
  skipReason?: string;
  senderEmail: string;
  subject: string;
  /** ISO-8601 timestamp of the send attempt */
  sentAt: string;
  /** ISO-8601 timestamp of record creation */
  createdAt: string;
  /** Additional metadata for compliance */
  metadata?: Record<string, any>;
}

/**
 * Params required to record an audit entry
 */
export interface RecordAuditParams {
  notificationType: string;
  recipientEmail: string;
  recipientFirstName: string;
  recipientLastName: string;
  accountId?: string;
  accountName?: string;
  userId?: string;
  deliveryStatus: NotificationDeliveryStatus;
  sesMessageId?: string;
  errorMessage?: string;
  skipReason?: string;
  senderEmail: string;
  subject: string;
  metadata?: Record<string, any>;
}

/**
 * Query filters for retrieving audit entries
 */
export interface AuditQueryOptions {
  /** Filter by recipient email */
  recipientEmail?: string;
  /** Filter by account ID */
  accountId?: string;
  /** Filter by delivery status */
  deliveryStatus?: NotificationDeliveryStatus;
  /** Return entries after this ISO-8601 timestamp */
  startDate?: string;
  /** Return entries before this ISO-8601 timestamp */
  endDate?: string;
  /** Max number of items to return */
  limit?: number;
  /** DynamoDB pagination token */
  nextToken?: Record<string, any>;
}

/**
 * Paginated query result
 */
export interface AuditQueryResult {
  items: NotificationAuditEntry[];
  count: number;
  nextToken?: Record<string, any>;
}

/**
 * NotificationAuditService
 *
 * Records every credential email attempt (sent, failed, or skipped) in
 * DynamoDB for compliance and audit trail purposes.
 *
 * DynamoDB Key Schema (single-table design):
 *
 *   PK:     NOTIFICATION_AUDIT#<id>
 *   SK:     METADATA
 *   GSI1PK: ENTITY#NOTIFICATION_AUDIT
 *   GSI1SK: NOTIFICATION_AUDIT#<id>
 *   GSI2PK: ACCOUNT#<accountId>#NOTIFICATIONS
 *   GSI2SK: <sentAt>#<id>
 *   GSI3PK: NOTIFICATION#STATUS#<deliveryStatus>
 *   GSI3SK: <sentAt>#<id>
 *
 * This service never throws — audit failures are logged but must not
 * block the primary notification or provisioning flows.
 */
@Injectable()
export class NotificationAuditService {
  private readonly logger = new Logger(NotificationAuditService.name);

  constructor(private readonly dynamoDb: DynamoDBService) {}

  /**
   * Record a notification audit entry in DynamoDB.
   *
   * This method never throws — failures are logged and swallowed to
   * prevent audit persistence issues from blocking provisioning.
   */
  async record(params: RecordAuditParams): Promise<NotificationAuditEntry | null> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const entry: NotificationAuditEntry = {
      id,
      notificationType: params.notificationType,
      recipientEmail: params.recipientEmail,
      recipientFirstName: params.recipientFirstName,
      recipientLastName: params.recipientLastName,
      accountId: params.accountId,
      accountName: params.accountName,
      userId: params.userId,
      deliveryStatus: params.deliveryStatus,
      sesMessageId: params.sesMessageId,
      errorMessage: params.errorMessage,
      skipReason: params.skipReason,
      senderEmail: params.senderEmail,
      subject: params.subject,
      sentAt: now,
      createdAt: now,
      metadata: params.metadata,
    };

    const item: Record<string, any> = {
      PK: `NOTIFICATION_AUDIT#${id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#NOTIFICATION_AUDIT',
      GSI1SK: `NOTIFICATION_AUDIT#${id}`,
      GSI3PK: `NOTIFICATION#STATUS#${params.deliveryStatus}`,
      GSI3SK: `${now}#${id}`,
      ...entry,
    };

    // Only set GSI2 keys when accountId is available for tenant-scoped queries
    if (params.accountId) {
      item.GSI2PK = `ACCOUNT#${params.accountId}#NOTIFICATIONS`;
      item.GSI2SK = `${now}#${id}`;
    }

    try {
      await this.dynamoDb.put({ Item: item });

      this.logger.log(
        `Audit recorded: ${params.notificationType} → ${params.recipientEmail} ` +
          `[${params.deliveryStatus}] (id: ${id})`,
      );

      return entry;
    } catch (error: any) {
      this.logger.error(
        `Failed to record notification audit for ${params.recipientEmail}: ${error.message}`,
        error.stack,
      );
      // Never throw — audit failure must not block provisioning
      return null;
    }
  }

  /**
   * Get a single audit entry by ID
   */
  async findById(id: string): Promise<NotificationAuditEntry | null> {
    try {
      const result = await this.dynamoDb.get({
        Key: { PK: `NOTIFICATION_AUDIT#${id}`, SK: 'METADATA' },
      });

      return result.Item ? this.mapToEntry(result.Item) : null;
    } catch (error: any) {
      this.logger.error(`Failed to fetch audit entry ${id}: ${error.message}`);
      return null;
    }
  }

  /**
   * Query all notification audit entries (paginated, sorted by newest first)
   */
  async findAll(options: AuditQueryOptions = {}): Promise<AuditQueryResult> {
    try {
      const result = await this.dynamoDb.queryByIndex(
        'GSI1',
        'GSI1PK = :pk',
        { ':pk': 'ENTITY#NOTIFICATION_AUDIT' },
      );

      let items = (result.Items || []).map(this.mapToEntry);

      // Apply filters
      items = this.applyFilters(items, options);

      // Sort by sentAt descending (newest first)
      items.sort((a, b) => b.sentAt.localeCompare(a.sentAt));

      // Apply limit
      const limit = options.limit || 100;
      const paginatedItems = items.slice(0, limit);

      return {
        items: paginatedItems,
        count: paginatedItems.length,
        nextToken: items.length > limit ? { offset: limit } : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to query audit entries: ${error.message}`);
      return { items: [], count: 0 };
    }
  }

  /**
   * Query audit entries by account ID (tenant-scoped, sorted by date)
   */
  async findByAccount(
    accountId: string,
    options: AuditQueryOptions = {},
  ): Promise<AuditQueryResult> {
    try {
      const expressionValues: Record<string, any> = {
        ':pk': `ACCOUNT#${accountId}#NOTIFICATIONS`,
      };

      let keyCondition = 'GSI2PK = :pk';

      // Date-range filtering via sort key
      if (options.startDate && options.endDate) {
        keyCondition += ' AND GSI2SK BETWEEN :start AND :end';
        expressionValues[':start'] = options.startDate;
        expressionValues[':end'] = `${options.endDate}\uffff`;
      } else if (options.startDate) {
        keyCondition += ' AND GSI2SK >= :start';
        expressionValues[':start'] = options.startDate;
      } else if (options.endDate) {
        keyCondition += ' AND GSI2SK <= :end';
        expressionValues[':end'] = `${options.endDate}\uffff`;
      }

      const result = await this.dynamoDb.queryByIndex(
        'GSI2',
        keyCondition,
        expressionValues,
      );

      let items = (result.Items || []).map(this.mapToEntry);
      items = this.applyFilters(items, options);
      items.sort((a, b) => b.sentAt.localeCompare(a.sentAt));

      const limit = options.limit || 100;
      const paginatedItems = items.slice(0, limit);

      return {
        items: paginatedItems,
        count: paginatedItems.length,
        nextToken: items.length > limit ? { offset: limit } : undefined,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to query audit entries for account ${accountId}: ${error.message}`,
      );
      return { items: [], count: 0 };
    }
  }

  /**
   * Query audit entries by delivery status (e.g., all failed sends)
   */
  async findByStatus(
    status: NotificationDeliveryStatus,
    options: AuditQueryOptions = {},
  ): Promise<AuditQueryResult> {
    try {
      const expressionValues: Record<string, any> = {
        ':pk': `NOTIFICATION#STATUS#${status}`,
      };

      let keyCondition = 'GSI3PK = :pk';

      if (options.startDate && options.endDate) {
        keyCondition += ' AND GSI3SK BETWEEN :start AND :end';
        expressionValues[':start'] = options.startDate;
        expressionValues[':end'] = `${options.endDate}\uffff`;
      } else if (options.startDate) {
        keyCondition += ' AND GSI3SK >= :start';
        expressionValues[':start'] = options.startDate;
      } else if (options.endDate) {
        keyCondition += ' AND GSI3SK <= :end';
        expressionValues[':end'] = `${options.endDate}\uffff`;
      }

      const result = await this.dynamoDb.queryByIndex(
        'GSI3',
        keyCondition,
        expressionValues,
      );

      let items = (result.Items || []).map(this.mapToEntry);
      items = this.applyFilters(items, options);
      items.sort((a, b) => b.sentAt.localeCompare(a.sentAt));

      const limit = options.limit || 100;
      const paginatedItems = items.slice(0, limit);

      return {
        items: paginatedItems,
        count: paginatedItems.length,
        nextToken: items.length > limit ? { offset: limit } : undefined,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to query audit entries by status ${status}: ${error.message}`,
      );
      return { items: [], count: 0 };
    }
  }

  /**
   * Get summary statistics for notification audits
   */
  async getSummary(accountId?: string): Promise<{
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    lastSentAt?: string;
    lastFailedAt?: string;
  }> {
    try {
      const result = accountId
        ? await this.findByAccount(accountId, { limit: 1000 })
        : await this.findAll({ limit: 1000 });

      const items = result.items;
      const sent = items.filter((i) => i.deliveryStatus === 'sent');
      const failed = items.filter((i) => i.deliveryStatus === 'failed');
      const skipped = items.filter((i) => i.deliveryStatus === 'skipped');

      return {
        total: items.length,
        sent: sent.length,
        failed: failed.length,
        skipped: skipped.length,
        lastSentAt: sent.length > 0 ? sent[0].sentAt : undefined,
        lastFailedAt: failed.length > 0 ? failed[0].sentAt : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to compute audit summary: ${error.message}`);
      return { total: 0, sent: 0, failed: 0, skipped: 0 };
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────

  private applyFilters(
    items: NotificationAuditEntry[],
    options: AuditQueryOptions,
  ): NotificationAuditEntry[] {
    let filtered = items;

    if (options.recipientEmail) {
      filtered = filtered.filter(
        (i) => i.recipientEmail === options.recipientEmail,
      );
    }

    if (options.deliveryStatus) {
      filtered = filtered.filter(
        (i) => i.deliveryStatus === options.deliveryStatus,
      );
    }

    if (options.accountId) {
      filtered = filtered.filter((i) => i.accountId === options.accountId);
    }

    return filtered;
  }

  private mapToEntry(item: Record<string, any>): NotificationAuditEntry {
    return {
      id: item.id,
      notificationType: item.notificationType,
      recipientEmail: item.recipientEmail,
      recipientFirstName: item.recipientFirstName,
      recipientLastName: item.recipientLastName,
      accountId: item.accountId,
      accountName: item.accountName,
      userId: item.userId,
      deliveryStatus: item.deliveryStatus,
      sesMessageId: item.sesMessageId,
      errorMessage: item.errorMessage,
      skipReason: item.skipReason,
      senderEmail: item.senderEmail,
      subject: item.subject,
      sentAt: item.sentAt,
      createdAt: item.createdAt,
      metadata: item.metadata,
    };
  }
}
