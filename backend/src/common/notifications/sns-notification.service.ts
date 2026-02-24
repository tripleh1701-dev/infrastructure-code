import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { resolveAwsCredentials } from '../utils/aws-credentials';
import { CloudType } from '../types/cloud-type';

/**
 * Parameters for a provisioning lifecycle notification
 */
export interface ProvisioningNotificationParams {
  accountId: string;
  accountName: string;
  cloudType: CloudType;
  status: 'completed' | 'failed';
  message?: string;
  durationMs?: number;
  resourceCount?: number;
  errorCode?: string;
  stackId?: string;
}

/**
 * SNS Notification Service
 *
 * Publishes provisioning lifecycle events (completion / failure) to an
 * SNS topic so that subscribed email addresses receive real-time alerts.
 *
 * Feature-flagged via SNS_PROVISIONING_TOPIC_ARN — when unset or empty
 * the service gracefully degrades and skips all publish calls.
 */
@Injectable()
export class SnsNotificationService {
  private readonly logger = new Logger(SnsNotificationService.name);
  private client: SNSClient | null = null;

  private readonly topicArn: string;
  private readonly isEnabled: boolean;
  private readonly environment: string;
  private readonly platformName: string;

  constructor(private readonly configService: ConfigService) {
    this.topicArn = this.configService.get('SNS_PROVISIONING_TOPIC_ARN', '');
    this.environment = this.configService.get('NODE_ENV', 'dev');
    this.platformName = this.configService.get('PLATFORM_NAME', 'License Portal');
    this.isEnabled = !!this.topicArn;

    if (this.isEnabled) {
      const region = this.configService.get('AWS_REGION', 'us-east-1');
      const credentials = resolveAwsCredentials(
        this.configService.get<string>('AWS_ACCESS_KEY_ID'),
        this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
      );

      this.client = new SNSClient({
        region,
        ...(credentials && { credentials }),
      });
      this.logger.log(`SNS provisioning notifications enabled (topic: ${this.topicArn})`);
    } else {
      this.logger.log('SNS provisioning notifications disabled (no SNS_PROVISIONING_TOPIC_ARN)');
    }
  }

  /**
   * Publish a provisioning completion or failure notification.
   * Never throws — failures are logged silently.
   */
  async notifyProvisioningEvent(params: ProvisioningNotificationParams): Promise<void> {
    if (!this.isEnabled || !this.client) {
      this.logger.debug(
        `SNS notification skipped for account ${params.accountId} (disabled)`,
      );
      return;
    }

    const isSuccess = params.status === 'completed';
    const emoji = isSuccess ? '✅' : '❌';
    const statusLabel = isSuccess ? 'COMPLETED' : 'FAILED';

    const subject = `${emoji} Provisioning ${statusLabel}: ${params.accountName} [${this.environment}]`;

    const bodyLines = [
      `Provisioning ${statusLabel}`,
      `${'─'.repeat(40)}`,
      ``,
      `Account:      ${params.accountName}`,
      `Account ID:   ${params.accountId}`,
      `Cloud Type:   ${params.cloudType}`,
      `Environment:  ${this.environment}`,
      `Platform:     ${this.platformName}`,
      ``,
    ];

    if (params.durationMs !== undefined) {
      const seconds = (params.durationMs / 1000).toFixed(1);
      bodyLines.push(`Duration:     ${seconds}s`);
    }

    if (isSuccess) {
      if (params.resourceCount !== undefined) {
        bodyLines.push(`Resources:    ${params.resourceCount} created`);
      }
      if (params.stackId) {
        bodyLines.push(`Stack ID:     ${params.stackId}`);
      }
      bodyLines.push('');
      bodyLines.push('All infrastructure resources have been provisioned successfully.');
    } else {
      if (params.errorCode) {
        bodyLines.push(`Error Code:   ${params.errorCode}`);
      }
      if (params.message) {
        bodyLines.push(`Error:        ${params.message}`);
      }
      bodyLines.push('');
      bodyLines.push('⚠️  Please investigate the failure and retry if necessary.');
    }

    bodyLines.push('');
    bodyLines.push(`${'─'.repeat(40)}`);
    bodyLines.push(`Sent by ${this.platformName} • ${new Date().toISOString()}`);

    try {
      await this.client.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Subject: subject.substring(0, 100), // SNS subject max 100 chars
          Message: bodyLines.join('\n'),
          MessageAttributes: {
            environment: { DataType: 'String', StringValue: this.environment },
            accountId: { DataType: 'String', StringValue: params.accountId },
            cloudType: { DataType: 'String', StringValue: params.cloudType },
            status: { DataType: 'String', StringValue: params.status },
          },
        }),
      );

      this.logger.log(
        `SNS notification sent: ${statusLabel} for account ${params.accountId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send SNS notification for account ${params.accountId}: ${error.message}`,
      );
      // Never throw — notification failure must not block provisioning
    }
  }

  /**
   * Publish a deprovisioning lifecycle notification.
   */
  async notifyDeprovisioningEvent(params: {
    accountId: string;
    accountName?: string;
    cloudType: CloudType;
    status: 'completed' | 'failed';
    durationMs?: number;
    errorCode?: string;
    message?: string;
  }): Promise<void> {
    if (!this.isEnabled || !this.client) return;

    const isSuccess = params.status === 'completed';
    const emoji = isSuccess ? '🗑️' : '❌';
    const statusLabel = isSuccess ? 'COMPLETED' : 'FAILED';
    const name = params.accountName || params.accountId;

    const subject = `${emoji} Deprovisioning ${statusLabel}: ${name} [${this.environment}]`;

    const bodyLines = [
      `Deprovisioning ${statusLabel}`,
      `${'─'.repeat(40)}`,
      ``,
      `Account:      ${name}`,
      `Account ID:   ${params.accountId}`,
      `Cloud Type:   ${params.cloudType}`,
      `Environment:  ${this.environment}`,
      ``,
    ];

    if (params.durationMs !== undefined) {
      bodyLines.push(`Duration:     ${(params.durationMs / 1000).toFixed(1)}s`);
    }

    if (!isSuccess) {
      if (params.errorCode) bodyLines.push(`Error Code:   ${params.errorCode}`);
      if (params.message) bodyLines.push(`Error:        ${params.message}`);
    }

    bodyLines.push('');
    bodyLines.push(`Sent by ${this.platformName} • ${new Date().toISOString()}`);

    try {
      await this.client.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Subject: subject.substring(0, 100),
          Message: bodyLines.join('\n'),
          MessageAttributes: {
            environment: { DataType: 'String', StringValue: this.environment },
            accountId: { DataType: 'String', StringValue: params.accountId },
            status: { DataType: 'String', StringValue: params.status },
          },
        }),
      );

      this.logger.log(
        `SNS deprovisioning notification sent: ${statusLabel} for ${params.accountId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send SNS deprovisioning notification: ${error.message}`,
      );
    }
  }
}
