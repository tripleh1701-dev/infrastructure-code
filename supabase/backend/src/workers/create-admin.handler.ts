/**
 * Create Admin Worker Lambda
 *
 * Final step in the account provisioning workflow.
 * Creates the admin user for a newly provisioned account:
 * 1. Creates a Cognito user with admin group membership
 * 2. Creates the DynamoDB technical user record
 * 3. Sends credential notification email (if SES enabled)
 *
 * Invoked by Step Functions after RBAC setup is complete.
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
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('CreateAdminWorker');

interface CreateAdminEvent {
  accountId: string;
  accountName?: string;
  enterpriseId?: string;
  adminEmail: string;
  adminFirstName?: string;
  adminLastName?: string;
  executionId: string;
}

interface CreateAdminResult {
  accountId: string;
  executionId: string;
  email: string;
  cognitoSub: string | null;
  userId: string;
  created: boolean;
  status: string;
}

const DEFAULT_ENTERPRISE_ID = '00000000-0000-0000-0000-000000000001';

export async function handler(event: CreateAdminEvent): Promise<CreateAdminResult> {
  const region = process.env.AWS_REGION || 'us-east-1';
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const tableName = process.env.CONTROL_PLANE_TABLE_NAME || process.env.DYNAMODB_TABLE_NAME;
  const projectName = process.env.PROJECT_NAME || 'app';

  if (!tableName) {
    throw new Error('CONTROL_PLANE_TABLE_NAME or DYNAMODB_TABLE_NAME must be set');
  }

  const dynamoClient = new DynamoDBClient({ region });
  const cwClient = new CloudWatchClient({ region });
  const startTime = Date.now();
  const enterpriseId = event.enterpriseId || DEFAULT_ENTERPRISE_ID;
  const now = new Date().toISOString();

  logger.log(`[${event.executionId}] Creating admin user for account ${event.accountId}: ${event.adminEmail}`);

  try {
    // Step 1: Check if user already exists in DynamoDB
    const existingUser = await findUserByEmail(dynamoClient, tableName, event.adminEmail);
    if (existingUser) {
      logger.log(`[${event.executionId}] Admin user already exists: ${existingUser.id}`);
      return {
        accountId: event.accountId,
        executionId: event.executionId,
        email: event.adminEmail,
        cognitoSub: existingUser.cognitoSub || null,
        userId: existingUser.id,
        created: false,
        status: 'ALREADY_EXISTS',
      };
    }

    // Step 2: Create Cognito user (if pool configured)
    let cognitoSub: string | null = null;
    let temporaryPassword: string | null = null;

    if (userPoolId) {
      const cognitoResult = await provisionCognitoUser(
        region, userPoolId, event, enterpriseId,
      );
      cognitoSub = cognitoResult.sub;
      temporaryPassword = cognitoResult.password;
    } else {
      logger.warn(`[${event.executionId}] COGNITO_USER_POOL_ID not set — skipping Cognito provisioning`);
    }

    // Step 3: Create DynamoDB technical user record
    const userId = uuidv4();
    const firstName = event.adminFirstName || event.adminEmail.split('@')[0];
    const lastName = event.adminLastName || '';

    // Find the Admin group for this account
    const adminGroupId = await findGroupByName(dynamoClient, tableName, event.accountId, 'Admin');

    await dynamoClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          PK: `USER#${userId}`,
          SK: 'METADATA',
          GSI1PK: 'ENTITY#USER',
          GSI1SK: `USER#${userId}`,
          GSI2PK: `ACCOUNT#${event.accountId}#USERS`,
          GSI2SK: `USER#${userId}`,
          id: userId,
          accountId: event.accountId,
          enterpriseId,
          firstName,
          lastName,
          email: event.adminEmail,
          assignedRole: 'Admin',
          assignedGroup: 'Admin',
          startDate: now.split('T')[0],
          status: 'active',
          isTechnicalUser: true,
          cognitoSub: cognitoSub || undefined,
          createdAt: now,
          updatedAt: now,
        }, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

    logger.log(`[${event.executionId}] Created DynamoDB user ${userId}`);

    // Step 4: Assign user to Admin group
    if (adminGroupId) {
      const linkId = uuidv4();
      try {
        await dynamoClient.send(
          new PutItemCommand({
            TableName: tableName,
            Item: marshall({
              PK: `USER#${userId}`,
              SK: `GROUP#${adminGroupId}`,
              id: linkId,
              userId,
              groupId: adminGroupId,
              createdAt: now,
            }, { removeUndefinedValues: true }),
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
          }),
        );
      } catch (error: any) {
        if (error.name !== 'ConditionalCheckFailedException') throw error;
      }
    }

    // Step 5: Send credential email
    if (temporaryPassword) {
      await sendCredentialEmail(region, event, temporaryPassword);
    }

    await emitMetric(cwClient, projectName, 'AdminCreated', Date.now() - startTime);

    return {
      accountId: event.accountId,
      executionId: event.executionId,
      email: event.adminEmail,
      cognitoSub,
      userId,
      created: true,
      status: 'SUCCESS',
    };
  } catch (error: any) {
    await emitMetric(cwClient, projectName, 'AdminCreateFailed', Date.now() - startTime);
    logger.error(`[${event.executionId}] Failed: ${error.message}`);
    throw error;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

async function findUserByEmail(
  client: DynamoDBClient,
  tableName: string,
  email: string,
): Promise<{ id: string; cognitoSub?: string } | null> {
  const result = await client.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: marshall({
        ':pk': 'ENTITY#USER',
        ':email': email,
      }),
    }),
  );

  if (result.Items && result.Items.length > 0) {
    const item = unmarshall(result.Items[0]);
    return { id: item.id, cognitoSub: item.cognitoSub };
  }
  return null;
}

async function findGroupByName(
  client: DynamoDBClient,
  tableName: string,
  accountId: string,
  groupName: string,
): Promise<string | null> {
  const result = await client.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      FilterExpression: '#name = :name',
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: marshall({
        ':pk': `ACCOUNT#${accountId}#GROUPS`,
        ':name': groupName,
      }),
    }),
  );

  if (result.Items && result.Items.length > 0) {
    return unmarshall(result.Items[0]).id;
  }
  return null;
}

async function provisionCognitoUser(
  region: string,
  userPoolId: string,
  event: CreateAdminEvent,
  enterpriseId: string,
): Promise<{ sub: string | null; password: string }> {
  const cognitoClient = new CognitoIdentityProviderClient({ region });
  const password = generateTemporaryPassword();

  const userAttributes = [
    { Name: 'email', Value: event.adminEmail },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'given_name', Value: event.adminFirstName || event.adminEmail.split('@')[0] },
    { Name: 'family_name', Value: event.adminLastName || '' },
    { Name: 'custom:account_id', Value: event.accountId },
    { Name: 'custom:enterprise_id', Value: enterpriseId },
    { Name: 'custom:role', Value: 'Admin' },
  ];

  // Check if user already exists in Cognito
  try {
    const existing = await cognitoClient.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: event.adminEmail }),
    );
    // Update attributes
    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: event.adminEmail,
        UserAttributes: userAttributes,
      }),
    );
    const sub = existing.UserAttributes?.find((a) => a.Name === 'sub')?.Value || null;
    logger.log(`[${event.executionId}] Cognito user exists, updated attributes (sub: ${sub})`);
    return { sub, password };
  } catch (error: any) {
    if (error.name !== 'UserNotFoundException') throw error;
  }

  // Create new user
  const createResult = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: event.adminEmail,
      UserAttributes: userAttributes,
      MessageAction: MessageActionType.SUPPRESS,
      TemporaryPassword: password,
    }),
  );

  const sub = createResult.User?.Attributes?.find((a) => a.Name === 'sub')?.Value || null;

  // Set permanent password
  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: event.adminEmail,
      Password: password,
      Permanent: true,
    }),
  );

  // Add to admin group
  try {
    await cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: event.adminEmail,
        GroupName: 'admin',
      }),
    );
  } catch (error: any) {
    logger.warn(`[${event.executionId}] Failed to add to Cognito admin group: ${error.message}`);
  }

  logger.log(`[${event.executionId}] Created Cognito user (sub: ${sub})`);
  return { sub, password };
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

async function sendCredentialEmail(
  region: string,
  event: CreateAdminEvent,
  temporaryPassword: string,
): Promise<void> {
  const enabled = process.env.CREDENTIAL_NOTIFICATION_ENABLED === 'true';
  if (!enabled) return;

  const senderEmail = process.env.SES_SENDER_EMAIL || 'noreply@example.com';
  const loginUrl = process.env.PLATFORM_LOGIN_URL || 'https://portal.example.com/login';
  const platformName = process.env.PLATFORM_NAME || 'License Portal';
  const supportEmail = process.env.PLATFORM_SUPPORT_EMAIL || 'support@example.com';

  try {
    const sesClient = new SESClient({ region });
    await sesClient.send(
      new SendEmailCommand({
        Source: senderEmail,
        Destination: { ToAddresses: [event.adminEmail] },
        Message: {
          Subject: {
            Data: `Welcome to ${platformName} — Your Admin Credentials`,
            Charset: 'UTF-8',
          },
          Body: {
            Text: {
              Data: `Welcome to ${platformName}\n\nYour admin account has been created for ${event.accountName || event.accountId}.\n\nEmail: ${event.adminEmail}\nTemporary Password: ${temporaryPassword}\n\nLogin at: ${loginUrl}\n\nPlease change your password upon first login.\n\nSupport: ${supportEmail}`,
              Charset: 'UTF-8',
            },
          },
        },
        Tags: [
          { Name: 'notification-type', Value: 'admin-credential-provisioned' },
          { Name: 'execution-id', Value: event.executionId },
        ],
      }),
    );
    logger.log(`[${event.executionId}] Credential email sent to ${event.adminEmail}`);
  } catch (error: any) {
    logger.error(`[${event.executionId}] Failed to send credential email: ${error.message}`);
  }
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
            Dimensions: [{ Name: 'Worker', Value: 'create-admin' }],
            Value: 1,
            Unit: 'Count',
          },
          {
            MetricName: 'WorkerDuration',
            Dimensions: [{ Name: 'Worker', Value: 'create-admin' }],
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
