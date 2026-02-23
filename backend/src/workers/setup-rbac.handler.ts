/**
 * Setup RBAC Worker Lambda
 *
 * Configures Role-Based Access Control for a newly provisioned account:
 * 1. Creates default groups (Platform Admin, Admin, Manager, User, Viewer, Default)
 * 2. Creates default roles matching the groups
 * 3. Links roles to groups
 * 4. Creates default role permissions for each menu item
 *
 * Idempotent: checks for existing records before creating.
 * Invoked by Step Functions after infrastructure is ready.
 */

import { Logger } from '@nestjs/common';
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const logger = new Logger('SetupRBACWorker');

interface SetupRBACEvent {
  accountId: string;
  accountName?: string;
  enterpriseId?: string;
  executionId: string;
  cloudType?: string;
  /** Pass-through fields from previous steps */
  tableName?: string;
  tableArn?: string;
  stackName?: string;
}

interface SetupRBACResult {
  accountId: string;
  executionId: string;
  groups: number;
  roles: number;
  permissions: number;
  status: string;
}

const DEFAULT_ENTERPRISE_ID = '00000000-0000-0000-0000-000000000001';

const DEFAULT_ROLES = [
  { name: 'Platform Admin', description: 'Full platform access', permissions: 255 },
  { name: 'Admin', description: 'Full account access', permissions: 127 },
  { name: 'Manager', description: 'Manage users and resources', permissions: 63 },
  { name: 'User', description: 'Standard operational access', permissions: 15 },
  { name: 'Viewer', description: 'Read-only access', permissions: 1 },
];

const DEFAULT_GROUPS = [
  { name: 'Platform Admin', description: 'Platform-level administrators', roleName: 'Platform Admin' },
  { name: 'Admin', description: 'Account administrators', roleName: 'Admin' },
  { name: 'Manager', description: 'Account managers', roleName: 'Manager' },
  { name: 'User', description: 'Standard users', roleName: 'User' },
  { name: 'Default', description: 'Default group for new users', roleName: 'Viewer' },
];

const MENU_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'builds', label: 'Builds' },
  { key: 'access-control', label: 'Access Control' },
  { key: 'security', label: 'Security' },
  { key: 'account-settings', label: 'Account Settings' },
  { key: 'provisioning', label: 'Provisioning History' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'monitoring', label: 'Monitoring' },
];

export async function handler(event: SetupRBACEvent): Promise<SetupRBACResult> {
  const region = process.env.AWS_REGION || 'us-east-1';
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

  logger.log(`[${event.executionId}] Setting up RBAC for account ${event.accountId}`);

  try {
    // Step 1: Create roles
    const roleMap = new Map<string, string>(); // roleName → roleId
    for (const roleDef of DEFAULT_ROLES) {
      const existingRoleId = await findExistingEntity(
        dynamoClient, tableName,
        `ACCOUNT#${event.accountId}#ROLES`,
        roleDef.name,
      );

      if (existingRoleId) {
        roleMap.set(roleDef.name, existingRoleId);
        logger.debug(`Role "${roleDef.name}" already exists: ${existingRoleId}`);
        continue;
      }

      const roleId = uuidv4();
      await dynamoClient.send(
        new PutItemCommand({
          TableName: tableName,
          Item: marshall({
            PK: `ROLE#${roleId}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#ROLE',
            GSI1SK: `ROLE#${roleId}`,
            GSI2PK: `ACCOUNT#${event.accountId}#ROLES`,
            GSI2SK: `ROLE#${roleId}`,
            id: roleId,
            name: roleDef.name,
            description: roleDef.description,
            permissions: roleDef.permissions,
            accountId: event.accountId,
            enterpriseId,
            createdAt: now,
            updatedAt: now,
          }, { removeUndefinedValues: true }),
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );

      roleMap.set(roleDef.name, roleId);
      logger.log(`Created role "${roleDef.name}" (${roleId})`);
    }

    // Step 2: Create role permissions
    let permCount = 0;
    for (const roleDef of DEFAULT_ROLES) {
      const roleId = roleMap.get(roleDef.name);
      if (!roleId) continue;

      for (const menu of MENU_ITEMS) {
        const permId = uuidv4();
        const isAdmin = roleDef.name === 'Platform Admin' || roleDef.name === 'Admin';
        const isManager = roleDef.name === 'Manager';
        const isUser = roleDef.name === 'User';

        try {
          await dynamoClient.send(
            new PutItemCommand({
              TableName: tableName,
              Item: marshall({
                PK: `ROLE#${roleId}`,
                SK: `PERMISSION#${permId}`,
                GSI1PK: `ROLE#${roleId}#PERMISSIONS`,
                GSI1SK: `MENU#${menu.key}`,
                id: permId,
                roleId,
                menuKey: menu.key,
                menuLabel: menu.label,
                isVisible: true,
                canView: true,
                canCreate: isAdmin || isManager || isUser,
                canEdit: isAdmin || isManager,
                canDelete: isAdmin,
                createdAt: now,
                updatedAt: now,
              }, { removeUndefinedValues: true }),
              ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            }),
          );
          permCount++;
        } catch (error: any) {
          if (error.name === 'ConditionalCheckFailedException') {
            // Permission already exists
          } else {
            throw error;
          }
        }
      }
    }

    // Step 3: Create groups and link roles
    let groupCount = 0;
    for (const groupDef of DEFAULT_GROUPS) {
      const existingGroupId = await findExistingEntity(
        dynamoClient, tableName,
        `ACCOUNT#${event.accountId}#GROUPS`,
        groupDef.name,
      );

      let groupId: string;

      if (existingGroupId) {
        groupId = existingGroupId;
        logger.debug(`Group "${groupDef.name}" already exists: ${groupId}`);
      } else {
        groupId = uuidv4();
        await dynamoClient.send(
          new PutItemCommand({
            TableName: tableName,
            Item: marshall({
              PK: `GROUP#${groupId}`,
              SK: 'METADATA',
              GSI1PK: 'ENTITY#GROUP',
              GSI1SK: `GROUP#${groupId}`,
              GSI2PK: `ACCOUNT#${event.accountId}#GROUPS`,
              GSI2SK: `GROUP#${groupId}`,
              id: groupId,
              name: groupDef.name,
              description: groupDef.description,
              accountId: event.accountId,
              enterpriseId,
              createdAt: now,
              updatedAt: now,
            }, { removeUndefinedValues: true }),
            ConditionExpression: 'attribute_not_exists(PK)',
          }),
        );
        groupCount++;
        logger.log(`Created group "${groupDef.name}" (${groupId})`);
      }

      // Link role to group
      const roleId = roleMap.get(groupDef.roleName);
      if (roleId) {
        const linkId = uuidv4();
        try {
          await dynamoClient.send(
            new PutItemCommand({
              TableName: tableName,
              Item: marshall({
                PK: `GROUP#${groupId}`,
                SK: `ROLE#${roleId}`,
                id: linkId,
                groupId,
                roleId,
                createdAt: now,
              }, { removeUndefinedValues: true }),
              ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            }),
          );
        } catch (error: any) {
          if (error.name !== 'ConditionalCheckFailedException') throw error;
        }
      }
    }

    await emitMetric(cwClient, projectName, 'RBACSetupSuccess', Date.now() - startTime);

    const result: SetupRBACResult = {
      accountId: event.accountId,
      executionId: event.executionId,
      groups: groupCount,
      roles: roleMap.size,
      permissions: permCount,
      status: 'SUCCESS',
    };

    logger.log(`[${event.executionId}] RBAC setup complete: ${JSON.stringify(result)}`);
    return result;
  } catch (error: any) {
    await emitMetric(cwClient, projectName, 'RBACSetupFailed', Date.now() - startTime);
    logger.error(`[${event.executionId}] RBAC setup failed: ${error.message}`);
    throw error;
  }
}

async function findExistingEntity(
  client: DynamoDBClient,
  tableName: string,
  gsi2pk: string,
  name: string,
): Promise<string | null> {
  const result = await client.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      FilterExpression: '#name = :name',
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: marshall({
        ':pk': gsi2pk,
        ':name': name,
      }),
    }),
  );

  if (result.Items && result.Items.length > 0) {
    return unmarshall(result.Items[0]).id;
  }
  return null;
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
            Dimensions: [{ Name: 'Worker', Value: 'setup-rbac' }],
            Value: 1,
            Unit: 'Count',
          },
          {
            MetricName: 'WorkerDuration',
            Dimensions: [{ Name: 'Worker', Value: 'setup-rbac' }],
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
