import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SESClient,
  GetSendQuotaCommand,
  GetIdentityVerificationAttributesCommand,
} from '@aws-sdk/client-ses';

export interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration_ms: number;
  details?: Record<string, any>;
}

export interface SesHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  region: string;
  checks: Record<string, CheckResult>;
}

@Injectable()
export class SesHealthService {
  private readonly logger = new Logger(SesHealthService.name);

  constructor(private readonly configService: ConfigService) {}

  async check(): Promise<SesHealthResult> {
    const region = this.configService.get<string>('AWS_REGION') || process.env.AWS_REGION || 'us-east-1';
    const senderEmail = this.configService.get<string>('SES_SENDER_EMAIL') || process.env.SES_SENDER_EMAIL || 'noreply@example.com';
    const notificationsEnabled = (this.configService.get<string>('CREDENTIAL_NOTIFICATION_ENABLED') || process.env.CREDENTIAL_NOTIFICATION_ENABLED || 'true') === 'true';

    const sesClient = new SESClient({ region });
    const checks: Record<string, CheckResult> = {};

    // 1. Notifications enabled
    checks['notifications_enabled'] = {
      status: notificationsEnabled ? 'pass' : 'warn',
      message: notificationsEnabled
        ? 'Credential notifications are enabled'
        : 'CREDENTIAL_NOTIFICATION_ENABLED is not set to "true" — emails will be skipped',
      duration_ms: 0,
    };

    // 2. Sender identity verification
    const verifyStart = Date.now();
    const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : senderEmail;
    try {
      const result = await sesClient.send(
        new GetIdentityVerificationAttributesCommand({
          Identities: [senderEmail, senderDomain],
        }),
      );
      const emailStatus = result.VerificationAttributes?.[senderEmail]?.VerificationStatus || 'NotFound';
      const domainStatus = result.VerificationAttributes?.[senderDomain]?.VerificationStatus || 'NotFound';
      const isEmailVerified = emailStatus === 'Success';
      const isDomainVerified = domainStatus === 'Success';
      const isVerified = isEmailVerified || isDomainVerified;

      checks['sender_verification'] = {
        status: isVerified ? 'pass' : 'fail',
        message: isVerified
          ? isEmailVerified
            ? `Sender "${senderEmail}" is verified in SES`
            : `Sender domain "${senderDomain}" is verified in SES`
          : `Sender "${senderEmail}" and domain "${senderDomain}" are NOT verified. Emails will fail.`,
        duration_ms: Date.now() - verifyStart,
        details: {
          sender: senderEmail,
          domain: senderDomain,
          sender_verification_status: emailStatus,
          domain_verification_status: domainStatus,
          action: isVerified
            ? null
            : 'Verify this email address or domain in AWS SES, or update SES_SENDER_EMAIL to a verified identity.',
        },
      };
    } catch (error: any) {
      checks['sender_verification'] = {
        status: 'fail',
        message: `Failed to check sender verification: ${error.message}`,
        duration_ms: Date.now() - verifyStart,
        details: {
          sender: senderEmail,
          domain: senderDomain,
          error: error.name,
          action: 'Check IAM permissions for ses:GetIdentityVerificationAttributes',
        },
      };
    }

    // 3. SES account status
    const accountStart = Date.now();
    try {
      const quota = await sesClient.send(new GetSendQuotaCommand({}));
      const sendingEnabled = (quota.Max24HourSend ?? 0) > 0;
      const isSandbox = (quota.Max24HourSend ?? 0) <= 200;

      checks['account_status'] = {
        status: sendingEnabled ? (isSandbox ? 'warn' : 'pass') : 'fail',
        message: !sendingEnabled
          ? 'SES sending is DISABLED on this account. No emails can be sent.'
          : isSandbox
            ? 'SES account is in SANDBOX mode — emails can only be sent to verified addresses.'
            : 'SES account is in PRODUCTION mode — emails can be sent to any address.',
        duration_ms: Date.now() - accountStart,
        details: {
          sending_enabled: sendingEnabled,
          enforcement_status: isSandbox ? 'SANDBOX' : 'PRODUCTION',
          max_24hr_send: quota.Max24HourSend,
          max_send_rate: quota.MaxSendRate,
          sent_last_24hr: quota.SentLast24Hours,
          action: isSandbox
            ? 'Request production access in the AWS SES console to send emails to unverified addresses.'
            : null,
        },
      };
    } catch (error: any) {
      checks['account_status'] = {
        status: 'fail',
        message: `Failed to retrieve SES account status: ${error.message}`,
        duration_ms: Date.now() - accountStart,
        details: {
          error: error.name,
          action: 'Check IAM permissions for ses:GetSendQuota',
        },
      };
    }

    // 4. Config completeness
    const isDefaultSender = senderEmail === 'noreply@example.com';
    checks['config_completeness'] = {
      status: isDefaultSender ? 'fail' : 'pass',
      message: isDefaultSender
        ? 'SES_SENDER_EMAIL is still set to default "noreply@example.com" — this will NOT work.'
        : `SES_SENDER_EMAIL is configured as "${senderEmail}"`,
      duration_ms: 0,
      details: {
        action: isDefaultSender
          ? 'Set SES_SENDER_EMAIL to a verified email address or domain in your environment variables.'
          : null,
      },
    };

    const hasFail = Object.values(checks).some((c) => c.status === 'fail');
    const hasWarn = Object.values(checks).some((c) => c.status === 'warn');

    return {
      status: hasFail ? 'unhealthy' : hasWarn ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      region,
      checks,
    };
  }
}
