/**
 * SES Notification Worker Lambda
 *
 * Sends credential provisioned emails to newly created users via AWS SES.
 * Records every attempt in the notification audit trail (DynamoDB).
 *
 * Invoked by Step Functions Map iterator — one invocation per new user.
 * Non-critical: notification failures do NOT block the provisioning workflow.
 */

import { Logger } from '@nestjs/common';
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from '@aws-sdk/client-ses';
import {
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('SESNotification');

interface SESWorkerEvent {
  action: 'send_credentials';
  email: string;
  temporaryPassword: string;
  accountName: string;
  accountId: string;
  executionId: string;
}

interface SESWorkerResult {
  sent: boolean;
  messageId?: string;
  auditId?: string;
  reason?: string;
}

export async function handler(event: SESWorkerEvent): Promise<SESWorkerResult> {
  const region = process.env.AWS_REGION || 'us-east-1';
  const isEnabled = process.env.CREDENTIAL_NOTIFICATION_ENABLED === 'true';
  const senderEmail = process.env.SES_SENDER_EMAIL || 'noreply@example.com';
  const loginUrl = process.env.PLATFORM_LOGIN_URL || 'https://portal.example.com/login';
  const platformName = process.env.PLATFORM_NAME || 'License Portal';
  const supportEmail = process.env.PLATFORM_SUPPORT_EMAIL || 'support@example.com';
  const tableName = process.env.DYNAMODB_TABLE_NAME || 'app_data';
  const projectName = process.env.PROJECT_NAME || 'app';

  const cwClient = new CloudWatchClient({ region });
  const startTime = Date.now();

  logger.log(`[${event.executionId}] Sending credentials to ${event.email}`);

  // Record audit entry ID
  const auditId = uuidv4();

  if (!isEnabled) {
    logger.log(`[${event.executionId}] Notifications disabled — skipping`);
    await recordAudit(region, tableName, {
      id: auditId,
      accountId: event.accountId,
      email: event.email,
      status: 'skipped',
      reason: 'CREDENTIAL_NOTIFICATION_ENABLED != true',
    });
    return { sent: false, auditId, reason: 'Notifications disabled' };
  }

  const sesClient = new SESClient({ region });

  const subject = `Welcome to ${platformName} — Your Credentials`;
  const htmlBody = buildCredentialEmailHtml({
    email: event.email,
    temporaryPassword: event.temporaryPassword,
    accountName: event.accountName,
    loginUrl,
    platformName,
    supportEmail,
  });

  const textBody = `Welcome to ${platformName}\n\nYour account has been created for ${event.accountName}.\n\nEmail: ${event.email}\nTemporary Password: ${event.temporaryPassword}\n\nLogin at: ${loginUrl}\n\nPlease change your password upon first login.\n\nSupport: ${supportEmail}`;

  const sesParams: SendEmailCommandInput = {
    Source: senderEmail,
    Destination: { ToAddresses: [event.email] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
        Text: { Data: textBody, Charset: 'UTF-8' },
      },
    },
    Tags: [
      { Name: 'notification-type', Value: 'credential-provisioned' },
      { Name: 'execution-id', Value: event.executionId },
    ],
  };

  try {
    const result = await sesClient.send(new SendEmailCommand(sesParams));
    logger.log(`[${event.executionId}] Email sent to ${event.email} (messageId: ${result.MessageId})`);

    await recordAudit(region, tableName, {
      id: auditId,
      accountId: event.accountId,
      email: event.email,
      status: 'sent',
      messageId: result.MessageId,
    });

    await emitMetric(cwClient, projectName, 'NotificationSent', Date.now() - startTime);
    return { sent: true, messageId: result.MessageId, auditId };
  } catch (error: any) {
    logger.error(`[${event.executionId}] SES send failed: ${error.message}`);

    await recordAudit(region, tableName, {
      id: auditId,
      accountId: event.accountId,
      email: event.email,
      status: 'failed',
      reason: error.message,
    });

    await emitMetric(cwClient, projectName, 'NotificationFailed', Date.now() - startTime);
    return { sent: false, auditId, reason: error.message };
  }
}

async function recordAudit(
  region: string,
  tableName: string,
  data: {
    id: string;
    accountId: string;
    email: string;
    status: string;
    messageId?: string;
    reason?: string;
  },
): Promise<void> {
  try {
    const ddbClient = new DynamoDBClient({ region });
    await ddbClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          PK: { S: `ACCT#${data.accountId}` },
          SK: { S: `NOTIFICATION_AUDIT#${data.id}` },
          GSI1PK: { S: `NOTIFICATION_AUDIT` },
          GSI1SK: { S: new Date().toISOString() },
          id: { S: data.id },
          recipientEmail: { S: data.email },
          accountId: { S: data.accountId },
          deliveryStatus: { S: data.status },
          notificationType: { S: 'credential_provisioned' },
          createdAt: { S: new Date().toISOString() },
          ...(data.messageId ? { sesMessageId: { S: data.messageId } } : {}),
          ...(data.reason ? { reason: { S: data.reason } } : {}),
        },
      }),
    );
  } catch (error: any) {
    logger.warn(`Failed to record audit: ${error.message}`);
  }
}

function buildCredentialEmailHtml(params: {
  email: string;
  temporaryPassword: string;
  accountName: string;
  loginUrl: string;
  platformName: string;
  supportEmail: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <h1 style="color: #18181b; font-size: 22px; margin: 0 0 24px;">Welcome to ${params.platformName}</h1>
    <p style="color: #3f3f46; line-height: 1.6;">Your account has been created for <strong>${params.accountName}</strong>.</p>
    <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; color: #71717a; font-size: 13px;">Email</td><td style="padding: 6px 0; font-weight: 600;">${params.email}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a; font-size: 13px;">Temporary Password</td><td style="padding: 6px 0; font-family: monospace; font-weight: 600; color: #dc2626;">${params.temporaryPassword}</td></tr>
      </table>
    </div>
    <a href="${params.loginUrl}" style="display: inline-block; background: #18181b; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">Sign In</a>
    <p style="color: #a1a1aa; font-size: 12px; margin-top: 32px; line-height: 1.5;">Please change your password immediately after signing in.<br/>Need help? Contact <a href="mailto:${params.supportEmail}" style="color: #3b82f6;">${params.supportEmail}</a></p>
  </div>
</body>
</html>`;
}

async function emitMetric(cwClient: CloudWatchClient, projectName: string, metricName: string, durationMs: number): Promise<void> {
  try {
    await cwClient.send(
      new PutMetricDataCommand({
        Namespace: `${projectName}/Workers`,
        MetricData: [
          { MetricName: metricName, Dimensions: [{ Name: 'Worker', Value: 'ses-notification' }], Value: 1, Unit: 'Count' },
          { MetricName: 'WorkerDuration', Dimensions: [{ Name: 'Worker', Value: 'ses-notification' }], Value: durationMs, Unit: 'Milliseconds' },
        ],
      }),
    );
  } catch { /* silent */ }
}
