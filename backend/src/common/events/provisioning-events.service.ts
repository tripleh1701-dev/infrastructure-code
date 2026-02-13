import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveAwsCredentials } from '../utils/aws-credentials';
import {
  EventBridgeClient,
  PutEventsCommand,
  PutEventsRequestEntry,
} from '@aws-sdk/client-eventbridge';
import {
  SNSClient,
  PublishCommand,
} from '@aws-sdk/client-sns';

/**
 * Event types for account provisioning
 */
export enum ProvisioningEventType {
  PROVISIONING_STARTED = 'Account Provisioning Started',
  PROVISIONING_COMPLETED = 'Account Provisioning Completed',
  PROVISIONING_FAILED = 'Account Provisioning Failed',
  DEPROVISIONING_STARTED = 'Account Deprovisioning Started',
  DEPROVISIONING_COMPLETED = 'Account Deprovisioning Completed',
  DEPROVISIONING_FAILED = 'Account Deprovisioning Failed',
}

/**
 * Base event payload interface
 */
export interface ProvisioningEventPayload {
  accountId: string;
  accountName: string;
  cloudType: 'public' | 'private';
  status: 'started' | 'success' | 'failed';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Success event payload
 */
export interface ProvisioningSuccessPayload extends ProvisioningEventPayload {
  status: 'success';
  tableName: string;
  tableArn?: string;
  stackId?: string;
  durationMs: number;
}

/**
 * Failure event payload
 */
export interface ProvisioningFailurePayload extends ProvisioningEventPayload {
  status: 'failed';
  error: string;
  errorCode?: string;
  retryable: boolean;
  durationMs?: number;
}

/**
 * Started event payload
 */
export interface ProvisioningStartedPayload extends ProvisioningEventPayload {
  status: 'started';
  requestId: string;
}

/**
 * Service for publishing account provisioning events to EventBridge and SNS
 */
@Injectable()
export class ProvisioningEventsService {
  private readonly logger = new Logger(ProvisioningEventsService.name);
  private eventBridgeClient: EventBridgeClient;
  private snsClient: SNSClient;

  private readonly eventBusName: string;
  private readonly successTopicArn: string;
  private readonly failureTopicArn: string;
  private readonly allEventsTopicArn: string;
  private readonly eventSource = 'com.platform.account-provisioning';
  private readonly isEnabled: boolean;

  constructor(private configService: ConfigService) {
    const awsRegion = this.configService.get('AWS_REGION', 'us-east-1');
    const projectName = this.configService.get('PROJECT_NAME', 'app');
    const environment = this.configService.get('NODE_ENV', 'dev');

    this.isEnabled = this.configService.get('ENABLE_PROVISIONING_EVENTS', 'true') === 'true';

    // Event bus and topic names
    this.eventBusName = this.configService.get(
      'EVENTBRIDGE_BUS_NAME',
      `${projectName}-${environment}-account-provisioning`,
    );
    this.successTopicArn = this.configService.get('SNS_PROVISIONING_SUCCESS_ARN', '');
    this.failureTopicArn = this.configService.get('SNS_PROVISIONING_FAILURE_ARN', '');
    this.allEventsTopicArn = this.configService.get('SNS_PROVISIONING_ALL_ARN', '');

    const credentials = resolveAwsCredentials(
      this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
    );

    this.eventBridgeClient = new EventBridgeClient({
      region: awsRegion,
      ...(credentials && { credentials }),
    });

    this.snsClient = new SNSClient({
      region: awsRegion,
      ...(credentials && { credentials }),
    });
  }

  /**
   * Publish a provisioning started event
   */
  async publishProvisioningStarted(payload: ProvisioningStartedPayload): Promise<void> {
    await this.publishEvent(ProvisioningEventType.PROVISIONING_STARTED, payload);
  }

  /**
   * Publish a provisioning success event
   */
  async publishProvisioningSuccess(payload: ProvisioningSuccessPayload): Promise<void> {
    await this.publishEvent(ProvisioningEventType.PROVISIONING_COMPLETED, payload);

    // Also publish directly to SNS for immediate notifications
    if (this.successTopicArn) {
      await this.publishToSNS(this.successTopicArn, {
        eventType: ProvisioningEventType.PROVISIONING_COMPLETED,
        ...payload,
      });
    }
  }

  /**
   * Publish a provisioning failure event
   */
  async publishProvisioningFailure(payload: ProvisioningFailurePayload): Promise<void> {
    await this.publishEvent(ProvisioningEventType.PROVISIONING_FAILED, payload);

    // Also publish directly to SNS for immediate notifications
    if (this.failureTopicArn) {
      await this.publishToSNS(this.failureTopicArn, {
        eventType: ProvisioningEventType.PROVISIONING_FAILED,
        ...payload,
      });
    }
  }

  /**
   * Publish a deprovisioning started event
   */
  async publishDeprovisioningStarted(payload: ProvisioningStartedPayload): Promise<void> {
    await this.publishEvent(ProvisioningEventType.DEPROVISIONING_STARTED, payload);
  }

  /**
   * Publish a deprovisioning success event
   */
  async publishDeprovisioningSuccess(payload: ProvisioningSuccessPayload): Promise<void> {
    await this.publishEvent(ProvisioningEventType.DEPROVISIONING_COMPLETED, payload);
  }

  /**
   * Publish a deprovisioning failure event
   */
  async publishDeprovisioningFailure(payload: ProvisioningFailurePayload): Promise<void> {
    await this.publishEvent(ProvisioningEventType.DEPROVISIONING_FAILED, payload);

    // Failures are critical - publish to failure topic
    if (this.failureTopicArn) {
      await this.publishToSNS(this.failureTopicArn, {
        eventType: ProvisioningEventType.DEPROVISIONING_FAILED,
        ...payload,
      });
    }
  }

  /**
   * Publish an event to EventBridge
   */
  private async publishEvent(
    eventType: ProvisioningEventType,
    payload: ProvisioningEventPayload,
  ): Promise<void> {
    if (!this.isEnabled) {
      this.logger.debug(`Provisioning events disabled, skipping: ${eventType}`);
      return;
    }

    const entry: PutEventsRequestEntry = {
      EventBusName: this.eventBusName,
      Source: this.eventSource,
      DetailType: eventType,
      Detail: JSON.stringify({
        ...payload,
        timestamp: payload.timestamp || new Date().toISOString(),
      }),
      Time: new Date(),
    };

    try {
      const result = await this.eventBridgeClient.send(
        new PutEventsCommand({ Entries: [entry] }),
      );

      if (result.FailedEntryCount && result.FailedEntryCount > 0) {
        const failed = result.Entries?.find((e: any) => e.ErrorCode);
        this.logger.error(
          `Failed to publish event: ${failed?.ErrorCode} - ${failed?.ErrorMessage}`,
        );
        throw new Error(`EventBridge publish failed: ${failed?.ErrorMessage}`);
      }

      this.logger.log(`Published event: ${eventType} for account ${payload.accountId}`);
    } catch (error: any) {
      this.logger.error(`Failed to publish EventBridge event: ${error.message}`);
      // Don't throw - event publishing should not break provisioning flow
    }
  }

  /**
   * Publish directly to an SNS topic
   */
  private async publishToSNS(topicArn: string, payload: Record<string, unknown>): Promise<void> {
    if (!topicArn) {
      return;
    }

    try {
      await this.snsClient.send(
        new PublishCommand({
          TopicArn: topicArn,
          Message: JSON.stringify(payload, null, 2),
          Subject: `Account Provisioning: ${payload.eventType}`,
          MessageAttributes: {
            accountId: {
              DataType: 'String',
              StringValue: String(payload.accountId || ''),
            },
            cloudType: {
              DataType: 'String',
              StringValue: String(payload.cloudType || ''),
            },
            status: {
              DataType: 'String',
              StringValue: String(payload.status || ''),
            },
          },
        }),
      );

      this.logger.log(`Published SNS notification to ${topicArn}`);
    } catch (error: any) {
      this.logger.error(`Failed to publish SNS notification: ${error.message}`);
      // Don't throw - notifications should not break provisioning flow
    }
  }

  /**
   * Create a standard success payload
   */
  createSuccessPayload(
    accountId: string,
    accountName: string,
    cloudType: 'public' | 'private',
    tableName: string,
    startTime: number,
    options?: {
      tableArn?: string;
      stackId?: string;
      metadata?: Record<string, unknown>;
    },
  ): ProvisioningSuccessPayload {
    return {
      accountId,
      accountName,
      cloudType,
      status: 'success',
      tableName,
      tableArn: options?.tableArn,
      stackId: options?.stackId,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      metadata: options?.metadata,
    };
  }

  /**
   * Create a standard failure payload
   */
  createFailurePayload(
    accountId: string,
    accountName: string,
    cloudType: 'public' | 'private',
    error: Error | string,
    startTime?: number,
    options?: {
      errorCode?: string;
      retryable?: boolean;
      metadata?: Record<string, unknown>;
    },
  ): ProvisioningFailurePayload {
    const errorMessage = error instanceof Error ? error.message : error;
    const isRetryable = options?.retryable ?? this.isRetryableError(error);

    return {
      accountId,
      accountName,
      cloudType,
      status: 'failed',
      error: errorMessage,
      errorCode: options?.errorCode,
      retryable: isRetryable,
      timestamp: new Date().toISOString(),
      durationMs: startTime ? Date.now() - startTime : undefined,
      metadata: options?.metadata,
    };
  }

  /**
   * Create a started payload
   */
  createStartedPayload(
    accountId: string,
    accountName: string,
    cloudType: 'public' | 'private',
    requestId: string,
  ): ProvisioningStartedPayload {
    return {
      accountId,
      accountName,
      cloudType,
      status: 'started',
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: Error | string): boolean {
    const message = error instanceof Error ? error.message : error;
    const retryablePatterns = [
      'throttl',
      'timeout',
      'limit exceeded',
      'try again',
      'temporarily unavailable',
      'service unavailable',
      'internal error',
      'connection',
    ];

    return retryablePatterns.some((pattern) =>
      message.toLowerCase().includes(pattern),
    );
  }
}
