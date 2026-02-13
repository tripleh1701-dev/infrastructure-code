import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from '@aws-sdk/client-ses';
import {
  CredentialEmailParams,
  renderCredentialProvisionedEmail,
} from './templates/credential-provisioned.template';
import { NotificationAuditService } from './notification-audit.service';

/**
 * Result of a notification attempt
 */
export interface NotificationResult {
  sent: boolean;
  skipped: boolean;
  messageId?: string;
  reason?: string;
  /** ID of the audit log entry recorded for this attempt */
  auditId?: string;
}

/**
 * Additional context for audit trail recording
 */
export interface NotificationContext {
  accountId?: string;
  accountName?: string;
  userId?: string;
}

/**
 * NotificationService
 *
 * Sends transactional emails to platform users via AWS SES.
 * Every send attempt (success, failure, or skip) is recorded in the
 * notification audit log stored in DynamoDB for compliance tracking.
 *
 * Currently supports:
 *  - Credential provisioned notification (temporary password delivery)
 *
 * Feature-flagged via CREDENTIAL_NOTIFICATION_ENABLED.
 * Gracefully degrades when SES is not configured (local dev).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private client: SESClient | null = null;

  private readonly senderEmail: string;
  private readonly loginUrl: string;
  private readonly platformName: string;
  private readonly supportEmail: string;
  private readonly isEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly auditService: NotificationAuditService,
  ) {
    this.isEnabled =
      this.configService.get('CREDENTIAL_NOTIFICATION_ENABLED', 'false') === 'true';

    this.senderEmail = this.configService.get(
      'SES_SENDER_EMAIL',
      'noreply@example.com',
    );
    this.loginUrl = this.configService.get(
      'PLATFORM_LOGIN_URL',
      'https://portal.example.com/login',
    );
    this.platformName = this.configService.get('PLATFORM_NAME', 'License Portal');
    this.supportEmail = this.configService.get(
      'PLATFORM_SUPPORT_EMAIL',
      'support@example.com',
    );

    if (this.isEnabled) {
      const region = this.configService.get('AWS_REGION', 'us-east-1');
      this.client = new SESClient({ region });
      this.logger.log('Credential notification service enabled via SES');
    } else {
      this.logger.log(
        'Credential notification disabled (CREDENTIAL_NOTIFICATION_ENABLED != true)',
      );
    }
  }

  /**
   * Send credential provisioned notification to a newly created technical user.
   *
   * @param recipient        The user's details
   * @param temporaryPassword The plaintext temporary password
   * @param accountName      Human-readable account name (for the email body)
   * @param context          Additional context for audit trail
   *
   * Every attempt is recorded in the notification audit log, regardless of outcome.
   * This method never throws — failures are logged and a result is returned.
   */
  async sendCredentialProvisionedEmail(
    recipient: {
      email: string;
      firstName: string;
      lastName: string;
    },
    temporaryPassword: string,
    accountName?: string,
    context?: NotificationContext,
  ): Promise<NotificationResult> {
    const emailParams: CredentialEmailParams = {
      firstName: recipient.firstName,
      lastName: recipient.lastName,
      email: recipient.email,
      temporaryPassword,
      loginUrl: this.loginUrl,
      accountName: accountName || context?.accountName,
      platformName: this.platformName,
      supportEmail: this.supportEmail,
    };

    const { subject } = renderCredentialProvisionedEmail(emailParams);

    // ── Skip path: notifications disabled ────────────────────────────────
    if (!this.isEnabled || !this.client) {
      this.logger.debug(
        `Credential notification skipped for ${recipient.email} (disabled)`,
      );

      const auditEntry = await this.auditService.record({
        notificationType: 'credential_provisioned',
        recipientEmail: recipient.email,
        recipientFirstName: recipient.firstName,
        recipientLastName: recipient.lastName,
        accountId: context?.accountId,
        accountName: accountName || context?.accountName,
        userId: context?.userId,
        deliveryStatus: 'skipped',
        skipReason: 'Notifications disabled (CREDENTIAL_NOTIFICATION_ENABLED != true)',
        senderEmail: this.senderEmail,
        subject,
      });

      return {
        sent: false,
        skipped: true,
        reason: 'Notifications disabled',
        auditId: auditEntry?.id,
      };
    }

    // ── Send path ────────────────────────────────────────────────────────
    const { htmlBody, textBody } = renderCredentialProvisionedEmail(emailParams);

    const sesParams: SendEmailCommandInput = {
      Source: this.senderEmail,
      Destination: {
        ToAddresses: [recipient.email],
      },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          Text: { Data: textBody, Charset: 'UTF-8' },
        },
      },
      Tags: [
        { Name: 'notification-type', Value: 'credential-provisioned' },
        { Name: 'platform', Value: this.platformName.replace(/\s/g, '-') },
      ],
    };

    try {
      const result = await this.client.send(new SendEmailCommand(sesParams));

      this.logger.log(
        `Credential email sent to ${recipient.email} (messageId: ${result.MessageId})`,
      );

      // Record successful delivery in audit log
      const auditEntry = await this.auditService.record({
        notificationType: 'credential_provisioned',
        recipientEmail: recipient.email,
        recipientFirstName: recipient.firstName,
        recipientLastName: recipient.lastName,
        accountId: context?.accountId,
        accountName: accountName || context?.accountName,
        userId: context?.userId,
        deliveryStatus: 'sent',
        sesMessageId: result.MessageId,
        senderEmail: this.senderEmail,
        subject,
        metadata: {
          platform: this.platformName,
          loginUrl: this.loginUrl,
        },
      });

      return {
        sent: true,
        skipped: false,
        messageId: result.MessageId,
        auditId: auditEntry?.id,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to send credential email to ${recipient.email}: ${error.message}`,
        error.stack,
      );

      // Record failed delivery in audit log
      const auditEntry = await this.auditService.record({
        notificationType: 'credential_provisioned',
        recipientEmail: recipient.email,
        recipientFirstName: recipient.firstName,
        recipientLastName: recipient.lastName,
        accountId: context?.accountId,
        accountName: accountName || context?.accountName,
        userId: context?.userId,
        deliveryStatus: 'failed',
        errorMessage: error.message,
        senderEmail: this.senderEmail,
        subject,
        metadata: {
          errorCode: error.code || error.name,
          errorStack: error.stack?.substring(0, 500),
        },
      });

      // Never throw — notification failure must not block provisioning
      return {
        sent: false,
        skipped: false,
        reason: error.message,
        auditId: auditEntry?.id,
      };
    }
  }
}
