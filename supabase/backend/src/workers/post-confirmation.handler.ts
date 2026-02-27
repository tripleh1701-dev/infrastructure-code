/**
 * Cognito Post-Confirmation Lambda Trigger
 *
 * Mirrors the Supabase `handle_new_user` database trigger for AWS deployments.
 * When a user self-registers and confirms their email via Cognito, this Lambda:
 *   1. Creates a technical user record in DynamoDB under the default account/enterprise
 *   2. Assigns the user to the "Default" group
 *   3. Links the "Viewer" role to the Default group (if not already linked)
 *   4. Updates Cognito custom attributes with the default account/enterprise
 *
 * Idempotent: If the user already has a DynamoDB record, it skips creation.
 *
 * Environment variables:
 *   CONTROL_PLANE_TABLE_NAME / DYNAMODB_TABLE_NAME  – DynamoDB table
 *   COGNITO_USER_POOL_ID                            – for attribute updates
 *   DEFAULT_ACCOUNT_ID     – default: a0000000-0000-0000-0000-000000000001
 *   DEFAULT_ENTERPRISE_ID  – default: 00000000-0000-0000-0000-000000000001
 */

import { Logger } from '@nestjs/common';
import { DynamoDBClient, QueryCommand, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('PostConfirmation');

const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || 'a0000000-0000-0000-0000-000000000001';
const DEFAULT_ENTERPRISE_ID = process.env.DEFAULT_ENTERPRISE_ID || '00000000-0000-0000-0000-000000000001';

interface PostConfirmationEvent {
  version: string;
  region: string;
  userPoolId: string;
  userName: string;
  callerContext: {
    awsSdkVersion: string;
    clientId: string;
  };
  triggerSource: string;
  request: {
    userAttributes: Record<string, string>;
  };
  response: Record<string, any>;
}

export async function handler(event: PostConfirmationEvent): Promise<PostConfirmationEvent> {
  // Only process post-confirmation (not post-admin-confirm or forgot-password)
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') {
    logger.log(`Skipping trigger source: ${event.triggerSource}`);
    return event;
  }

  const email = event.request.userAttributes.email;
  const sub = event.request.userAttributes.sub;

  if (!email) {
    logger.warn('No email in user attributes — skipping');
    return event;
  }

  const region = event.region || process.env.AWS_REGION || 'us-east-1';
  const tableName =
    process.env.CONTROL_PLANE_TABLE_NAME ||
    process.env.DYNAMODB_TABLE_NAME;

  if (!tableName) {
    logger.error('No CONTROL_PLANE_TABLE_NAME or DYNAMODB_TABLE_NAME configured — skipping');
    return event;
  }

  const dynamoClient = new DynamoDBClient({ region });

  try {
    // Step 1: Check if user already exists as a technical user (by email)
    const existingUser = await findTechnicalUserByEmail(dynamoClient, tableName, email);

    if (existingUser) {
      logger.log(`Technical user already exists for ${email} (id: ${existingUser.id}) — skipping creation`);

      // Still update Cognito custom attributes to match existing record
      await updateCognitoAttributes(region, event.userPoolId, email, {
        accountId: existingUser.accountId,
        enterpriseId: existingUser.enterpriseId || DEFAULT_ENTERPRISE_ID,
        role: existingUser.assignedRole || 'Viewer',
      });

      return event;
    }

    // Step 2: Create technical user in default account/enterprise
    const now = new Date().toISOString();
    const userId = uuidv4();
    const emailPrefix = email.split('@')[0];
    const isAdmin = email.toLowerCase() === 'admin@adminplatform.com';
    const assignedRole = isAdmin ? 'Platform Admin' : 'Viewer';
    const assignedGroup = isAdmin ? 'Platform Admin' : 'Default';

    const userItem = {
      PK: `USER#${userId}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#USER',
      GSI1SK: `USER#${userId}`,
      GSI2PK: `ACCOUNT#${DEFAULT_ACCOUNT_ID}#USERS`,
      GSI2SK: `USER#${userId}`,
      id: userId,
      accountId: DEFAULT_ACCOUNT_ID,
      enterpriseId: DEFAULT_ENTERPRISE_ID,
      firstName: emailPrefix,
      lastName: '',
      email,
      assignedRole,
      assignedGroup,
      startDate: now.split('T')[0],
      status: 'active',
      isTechnicalUser: true,
      cognitoSub: sub,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(userItem, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

    logger.log(`Created technical user ${userId} for ${email} in default account`);

    // Step 3: Find or create Default group for the account
    const defaultGroupId = await ensureDefaultGroup(dynamoClient, tableName, now);

    // Step 4: Assign user to Default group
    await assignUserToGroup(dynamoClient, tableName, userId, defaultGroupId, now);

    // Step 5: Link Viewer role to Default group (if not already linked)
    await ensureViewerRoleLinked(dynamoClient, tableName, defaultGroupId, now);

    // Step 6: Update Cognito custom attributes
    await updateCognitoAttributes(region, event.userPoolId, email, {
      accountId: DEFAULT_ACCOUNT_ID,
      enterpriseId: DEFAULT_ENTERPRISE_ID,
      role: assignedRole,
    });

    // Step 7: Add user to Cognito "user" group (default)
    if (!isAdmin) {
      await addToCognitoGroup(region, event.userPoolId, email, 'user');
    } else {
      await addToCognitoGroup(region, event.userPoolId, email, 'admin');
    }

    logger.log(`Post-confirmation complete for ${email}`);
  } catch (error: any) {
    // Log but don't throw — returning the event prevents Cognito from blocking the signup
    logger.error(`Post-confirmation error for ${email}: ${error.message}`, error.stack);
  }

  return event;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

async function findTechnicalUserByEmail(
  client: DynamoDBClient,
  tableName: string,
  email: string,
): Promise<{ id: string; accountId: string; enterpriseId?: string; assignedRole?: string } | null> {
  // Query GSI1 for all users and filter by email
  const result = await client.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      FilterExpression: 'email = :email AND #status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: marshall({
        ':pk': 'ENTITY#USER',
        ':email': email,
        ':active': 'active',
      }),
    }),
  );

  if (result.Items && result.Items.length > 0) {
    const item = unmarshall(result.Items[0]);
    return {
      id: item.id,
      accountId: item.accountId,
      enterpriseId: item.enterpriseId,
      assignedRole: item.assignedRole,
    };
  }

  return null;
}

async function ensureDefaultGroup(
  client: DynamoDBClient,
  tableName: string,
  now: string,
): Promise<string> {
  // Query for existing Default group in the default account
  const result = await client.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      FilterExpression: '#name = :name',
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: marshall({
        ':pk': `ACCOUNT#${DEFAULT_ACCOUNT_ID}#GROUPS`,
        ':name': 'Default',
      }),
    }),
  );

  if (result.Items && result.Items.length > 0) {
    return unmarshall(result.Items[0]).id;
  }

  // Create Default group
  const groupId = uuidv4();
  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshall(
        {
          PK: `GROUP#${groupId}`,
          SK: 'METADATA',
          GSI1PK: 'ENTITY#GROUP',
          GSI1SK: `GROUP#${groupId}`,
          GSI2PK: `ACCOUNT#${DEFAULT_ACCOUNT_ID}#GROUPS`,
          GSI2SK: `GROUP#${groupId}`,
          id: groupId,
          name: 'Default',
          description: 'Default group for new users',
          accountId: DEFAULT_ACCOUNT_ID,
          enterpriseId: DEFAULT_ENTERPRISE_ID,
          createdAt: now,
          updatedAt: now,
        },
        { removeUndefinedValues: true },
      ),
    }),
  );

  logger.log(`Created Default group ${groupId} for default account`);
  return groupId;
}

async function assignUserToGroup(
  client: DynamoDBClient,
  tableName: string,
  userId: string,
  groupId: string,
  now: string,
): Promise<void> {
  const linkId = uuidv4();
  try {
    await client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(
          {
            PK: `USER#${userId}`,
            SK: `GROUP#${groupId}`,
            id: linkId,
            userId,
            groupId,
            createdAt: now,
          },
          { removeUndefinedValues: true },
        ),
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      }),
    );
    logger.log(`Assigned user ${userId} to group ${groupId}`);
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      logger.log(`User ${userId} already in group ${groupId}`);
    } else {
      throw error;
    }
  }
}

async function ensureViewerRoleLinked(
  client: DynamoDBClient,
  tableName: string,
  groupId: string,
  now: string,
): Promise<void> {
  // Find the Viewer role for the default account
  const rolesResult = await client.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      FilterExpression: '#name = :name',
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: marshall({
        ':pk': `ACCOUNT#${DEFAULT_ACCOUNT_ID}#ROLES`,
        ':name': 'Viewer',
      }),
    }),
  );

  if (!rolesResult.Items || rolesResult.Items.length === 0) {
    logger.warn('Viewer role not found for default account — skipping role link');
    return;
  }

  const roleId = unmarshall(rolesResult.Items[0]).id;

  // Check if already linked
  const existingLink = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: marshall({
        ':pk': `GROUP#${groupId}`,
        ':sk': `ROLE#${roleId}`,
      }),
    }),
  );

  if (existingLink.Items && existingLink.Items.length > 0) {
    return; // Already linked
  }

  const linkId = uuidv4();
  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshall(
        {
          PK: `GROUP#${groupId}`,
          SK: `ROLE#${roleId}`,
          id: linkId,
          groupId,
          roleId,
          createdAt: now,
        },
        { removeUndefinedValues: true },
      ),
    }),
  );

  logger.log(`Linked Viewer role ${roleId} to Default group ${groupId}`);
}

async function updateCognitoAttributes(
  region: string,
  userPoolId: string,
  email: string,
  attrs: { accountId: string; enterpriseId: string; role: string },
): Promise<void> {
  try {
    const cognitoClient = new CognitoIdentityProviderClient({ region });
    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'custom:account_id', Value: attrs.accountId },
          { Name: 'custom:enterprise_id', Value: attrs.enterpriseId },
          { Name: 'custom:role', Value: attrs.role },
        ],
      }),
    );
    logger.log(`Updated Cognito attributes for ${email}`);
  } catch (error: any) {
    logger.warn(`Failed to update Cognito attributes for ${email}: ${error.message}`);
  }
}

async function addToCognitoGroup(
  region: string,
  userPoolId: string,
  email: string,
  groupName: string,
): Promise<void> {
  try {
    const cognitoClient = new CognitoIdentityProviderClient({ region });
    await cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: email,
        GroupName: groupName,
      }),
    );
    logger.log(`Added ${email} to Cognito group: ${groupName}`);
  } catch (error: any) {
    logger.warn(`Failed to add ${email} to Cognito group ${groupName}: ${error.message}`);
  }
}
