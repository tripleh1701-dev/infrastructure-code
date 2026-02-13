/**
 * Cognito Provisioner Worker Lambda
 *
 * Provisions Cognito user identities during account onboarding.
 * Creates users, sets permanent passwords, assigns group memberships,
 * and syncs custom attributes (account_id, enterprise_id, role).
 *
 * Invoked by Step Functions Map iterator — one invocation per user.
 */

import { Logger } from '@nestjs/common';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  MessageActionType,
} from '@aws-sdk/client-cognito-identity-provider';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { renderCredentialProvisionedEmail } from '../common/notifications/templates/credential-provisioned.template';

const logger = new Logger('CognitoProvisioner');

interface CognitoWorkerEvent {
  action: 'provision_user';
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  groupName?: string;
  accountId: string;
  enterpriseId?: string;
  executionId: string;
}

interface CognitoWorkerResult {
  email: string;
  cognitoSub: string | null;
  created: boolean;
  updated: boolean;
  temporaryPassword?: string;
}

export async function handler(event: CognitoWorkerEvent): Promise<CognitoWorkerResult> {
  const region = process.env.AWS_REGION || process.env.COGNITO_REGION || 'us-east-1';
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const projectName = process.env.PROJECT_NAME || 'app';

  if (!userPoolId) {
    logger.warn(`[${event.executionId}] COGNITO_USER_POOL_ID not configured — skipping`);
    return { email: event.email, cognitoSub: null, created: false, updated: false };
  }

  const cognitoClient = new CognitoIdentityProviderClient({ region });
  const cwClient = new CloudWatchClient({ region });
  const startTime = Date.now();

  logger.log(`[${event.executionId}] Provisioning Cognito user: ${event.email}`);

  try {
    const userAttributes = [
      { Name: 'email', Value: event.email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'given_name', Value: event.firstName },
      { Name: 'family_name', Value: event.lastName },
      { Name: 'custom:account_id', Value: event.accountId },
      { Name: 'custom:enterprise_id', Value: event.enterpriseId || '' },
      { Name: 'custom:role', Value: event.role },
    ];

    // Check if user already exists (idempotent)
    try {
      const existing = await cognitoClient.send(
        new AdminGetUserCommand({ UserPoolId: userPoolId, Username: event.email }),
      );

      // User exists — update attributes
      await cognitoClient.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: event.email,
          UserAttributes: userAttributes,
        }),
      );

      const sub = existing.UserAttributes?.find((a: any) => a.Name === 'sub')?.Value || null;
      logger.log(`[${event.executionId}] Cognito user exists: ${event.email} (sub: ${sub}) — attributes updated`);

      if (event.groupName) {
        await ensureGroupMembership(cognitoClient, userPoolId, event.email, event.groupName);
      }

      await emitMetric(cwClient, projectName, 'CognitoUserUpdated', Date.now() - startTime);
      return { email: event.email, cognitoSub: sub, created: false, updated: true };
    } catch (error: any) {
      if (error.name !== 'UserNotFoundException') {
        throw error;
      }
    }

    // User does not exist — create
    const password = generateTemporaryPassword();

    const createResult = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: event.email,
        UserAttributes: userAttributes,
        MessageAction: MessageActionType.SUPPRESS,
        TemporaryPassword: password,
      }),
    );

    const sub = createResult.User?.Attributes?.find((a: any) => a.Name === 'sub')?.Value || null;

    // Set permanent password
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: event.email,
        Password: password,
        Permanent: true,
      }),
    );

    if (event.groupName) {
      await ensureGroupMembership(cognitoClient, userPoolId, event.email, event.groupName);
    }

    logger.log(`[${event.executionId}] Created Cognito user: ${event.email} (sub: ${sub})`);
    await emitMetric(cwClient, projectName, 'CognitoUserCreated', Date.now() - startTime);

    // Send credential email via SES if enabled
    await sendCredentialEmail(region, event, password);

    return {
      email: event.email,
      cognitoSub: sub,
      created: true,
      updated: false,
      temporaryPassword: password,
    };
  } catch (error: any) {
    await emitMetric(cwClient, projectName, 'CognitoUserFailed', Date.now() - startTime);
    logger.error(`[${event.executionId}] Failed: ${error.message}`);
    throw error;
  }
}

async function ensureGroupMembership(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string,
  groupName: string,
): Promise<void> {
  try {
    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: email,
        GroupName: groupName,
      }),
    );
  } catch (error: any) {
    logger.warn(`Failed to assign ${email} to group ${groupName}: ${error.message}`);
  }
}

function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*';

  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

  let password = pick(upper) + pick(lower) + pick(digits) + pick(special);
  const all = upper + lower + digits + special;
  for (let i = 0; i < 8; i++) {
    password += pick(all);
  }

  return password.split('').sort(() => Math.random() - 0.5).join('');
}

async function emitMetric(
  cwClient: CloudWatchClient,
  projectName: string,
  metricName: string,
  durationMs: number,
): Promise<void> {
  try {
    await cwClient.send(
      new PutMetricDataCommand({
        Namespace: `${projectName}/Workers`,
        MetricData: [
          {
            MetricName: metricName,
            Dimensions: [{ Name: 'Worker', Value: 'cognito-provisioner' }],
            Value: 1,
            Unit: 'Count',
          },
          {
            MetricName: 'WorkerDuration',
            Dimensions: [{ Name: 'Worker', Value: 'cognito-provisioner' }],
            Value: durationMs,
            Unit: 'Milliseconds',
          },
        ],
      }),
    );
  } catch {
    // Never fail on metric emission
  }
}

/**
 * Sends credential provisioned email via SES.
 * Feature-flagged via CREDENTIAL_NOTIFICATION_ENABLED env var.
 * Never throws — failures are logged but do not block provisioning.
 */
async function sendCredentialEmail(
  region: string,
  event: CognitoWorkerEvent,
  temporaryPassword: string,
): Promise<void> {
  const enabled = process.env.CREDENTIAL_NOTIFICATION_ENABLED === 'true';
  if (!enabled) {
    logger.debug(`[${event.executionId}] Credential email skipped (CREDENTIAL_NOTIFICATION_ENABLED != true)`);
    return;
  }

  const senderEmail = process.env.SES_SENDER_EMAIL || 'noreply@example.com';
  const loginUrl = process.env.PLATFORM_LOGIN_URL || 'https://portal.example.com/login';
  const platformName = process.env.PLATFORM_NAME || 'License Portal';
  const supportEmail = process.env.PLATFORM_SUPPORT_EMAIL || 'support@example.com';

  try {
    const sesClient = new SESClient({ region });

    const { subject, htmlBody, textBody } = renderCredentialProvisionedEmail({
      firstName: event.firstName,
      lastName: event.lastName,
      email: event.email,
      temporaryPassword,
      loginUrl,
      platformName,
      supportEmail,
    });

    await sesClient.send(
      new SendEmailCommand({
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
      }),
    );

    logger.log(`[${event.executionId}] Credential email sent to ${event.email}`);
  } catch (error: any) {
    // Never fail provisioning due to email failure
    logger.error(`[${event.executionId}] Failed to send credential email to ${event.email}: ${error.message}`);
  }
}
