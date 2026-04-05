import { Injectable, Logger } from '@nestjs/common';
import { NotificationAuditService, NotificationAuditEntry } from './notification-audit.service';
import { SesHealthService } from '../health/ses-health.service';

export interface RetryEligibleEntry {
  auditId: string;
  recipientEmail: string;
  recipientFirstName: string;
  recipientLastName: string;
  accountId?: string;
  accountName?: string;
  userId?: string;
  errorMessage?: string;
  failedAt: string;
  retryCount: number;
}

export interface RetrySummary {
  /** Number of failed entries eligible for retry */
  eligibleCount: number;
  /** Number of entries that have exceeded the max retry limit */
  exhaustedCount: number;
  /** Whether SES is currently healthy enough to send */
  sesHealthy: boolean;
  /** The eligible entries (for UI display) */
  entries: RetryEligibleEntry[];
}

/**
 * NotificationRetryService
 *
 * Provides visibility into failed credential notifications and tracks retry
 * eligibility. Actual retry is performed via the existing per-user
 * `POST /api/users/:id/resend-credentials` endpoint (which regenerates
 * a password and re-sends via SES).
 *
 * This service:
 * - Queries DynamoDB for failed notification audit entries
 * - Enriches entries with retry count from metadata
 * - Performs SES health pre-flight checks before recommending retries
 * - Marks entries as retry-exhausted after MAX_RETRIES
 */
@Injectable()
export class NotificationRetryService {
  private readonly logger = new Logger(NotificationRetryService.name);

  static readonly MAX_RETRIES = 3;

  constructor(
    private readonly auditService: NotificationAuditService,
    private readonly sesHealth: SesHealthService,
  ) {}

  /**
   * Get a summary of retry-eligible failed notifications.
   * Used by the frontend to show retry controls.
   */
  async getRetrySummary(accountId?: string): Promise<RetrySummary> {
    const health = await this.sesHealth.check();

    const queryResult = accountId
      ? await this.auditService.findByAccount(accountId, { deliveryStatus: 'failed', limit: 200 })
      : await this.auditService.findByStatus('failed', { limit: 200 });

    let eligible = 0;
    let exhausted = 0;
    const entries: RetryEligibleEntry[] = [];

    for (const entry of queryResult.items) {
      // Only credential_provisioned can be retried
      if (entry.notificationType !== 'credential_provisioned') continue;

      const retryCount = (entry.metadata as any)?.retryCount ?? 0;

      if (retryCount >= NotificationRetryService.MAX_RETRIES) {
        exhausted++;
      } else {
        eligible++;
        entries.push({
          auditId: entry.id,
          recipientEmail: entry.recipientEmail,
          recipientFirstName: entry.recipientFirstName,
          recipientLastName: entry.recipientLastName,
          accountId: entry.accountId,
          accountName: entry.accountName,
          userId: entry.userId,
          errorMessage: entry.errorMessage,
          failedAt: entry.sentAt,
          retryCount,
        });
      }
    }

    return {
      eligibleCount: eligible,
      exhaustedCount: exhausted,
      sesHealthy: health.status !== 'unhealthy',
      entries,
    };
  }

  /**
   * Increment retry count on an audit entry after a resend attempt.
   * Called by the users controller after resend-credentials succeeds or fails.
   */
  async markRetryAttempt(
    auditId: string,
    succeeded: boolean,
  ): Promise<void> {
    try {
      const entry = await this.auditService.findById(auditId);
      if (!entry) return;

      const retryCount = ((entry.metadata as any)?.retryCount ?? 0) + 1;

      // Record a new audit entry tracking this retry attempt
      await this.auditService.record({
        notificationType: 'credential_provisioned',
        recipientEmail: entry.recipientEmail,
        recipientFirstName: entry.recipientFirstName,
        recipientLastName: entry.recipientLastName,
        accountId: entry.accountId,
        accountName: entry.accountName,
        userId: entry.userId,
        deliveryStatus: succeeded ? 'sent' : 'failed',
        senderEmail: entry.senderEmail,
        subject: entry.subject,
        metadata: {
          retryCount,
          originalAuditId: auditId,
          isRetry: true,
        },
        errorMessage: succeeded ? undefined : 'Retry failed — see resend-credentials response',
      });

      this.logger.log(
        `Retry attempt #${retryCount} for audit ${auditId}: ${succeeded ? 'succeeded' : 'failed'}`,
      );
    } catch (error: any) {
      this.logger.warn(`Failed to mark retry attempt for ${auditId}: ${error.message}`);
    }
  }
}
