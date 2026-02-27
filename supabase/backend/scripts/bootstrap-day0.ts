#!/usr/bin/env ts-node
/**
 * Day-0 Bootstrap CLI Script
 *
 * Standalone script that initializes the platform WITHOUT requiring the
 * NestJS server to be running. Mirrors the exact logic from
 * BootstrapService but operates directly against DynamoDB and (optionally)
 * AWS Cognito.
 *
 * Usage:
 *   npx ts-node scripts/bootstrap-day0.ts                # DynamoDB only
 *   npx ts-node scripts/bootstrap-day0.ts --with-cognito  # DynamoDB + Cognito user
 *   npx ts-node scripts/bootstrap-day0.ts --dry-run       # Print items, don't write
 *   npx ts-node scripts/bootstrap-day0.ts --force          # Re-run even if already bootstrapped
 *
 * Environment variables (loaded from .env.migration or .env):
 *   AWS_REGION              — AWS region (default: us-east-1)
 *   AWS_ACCESS_KEY_ID       — IAM credentials
 *   AWS_SECRET_ACCESS_KEY   — IAM credentials
 *   DYNAMODB_TABLE_NAME     — Target table (required, no default)
 *   COGNITO_USER_POOL_ID    — Required when --with-cognito is used
 *   SSM_PREFIX              — SSM path prefix (default: /accounts)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  CreateGroupCommand,
  MessageActionType,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  SSMClient,
  PutParameterCommand,
} from '@aws-sdk/client-ssm';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

dotenv.config({ path: '.env.migration' });
dotenv.config({ path: '.env' });

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || process.env.CONTROL_PLANE_TABLE_NAME;
if (!TABLE_NAME) { console.error('ERROR: DYNAMODB_TABLE_NAME or CONTROL_PLANE_TABLE_NAME must be set'); process.exit(1); }
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const SSM_PREFIX = process.env.SSM_PREFIX || '/accounts';

// CLI flags
const args = process.argv.slice(2);
const WITH_COGNITO = args.includes('--with-cognito');
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

// ---------------------------------------------------------------------------
// Fixed UUIDs (identical to BootstrapService)
// ---------------------------------------------------------------------------

const FIXED_IDS = {
  ACCOUNT: 'a0000000-0000-0000-0000-000000000001',
  ENTERPRISE: '00000000-0000-0000-0000-000000000001',
  PRODUCT: '00000000-0000-0000-0000-000000000002',
  SERVICE: '00000000-0000-0000-0000-000000000003',
  PLATFORM_GROUP: 'b0000000-0000-0000-0000-000000000001',
  PLATFORM_ROLE: 'c0000000-0000-0000-0000-000000000001',
  TECHNICAL_GROUP: 'b0000000-0000-0000-0000-000000000002',
  TECHNICAL_ROLE: 'c0000000-0000-0000-0000-000000000002',
  ADMIN_USER: 'd0000000-0000-0000-0000-000000000001',
  GLOBAL_WORKSTREAM: 'e0000000-0000-0000-0000-000000000001',
  DEFAULT_WORKSTREAM: 'e0000000-0000-0000-0000-000000000002',
  LICENSE: 'f0000000-0000-0000-0000-000000000001',
  ADDRESS: 'f1000000-0000-0000-0000-000000000001',
};

// Total bootstrap steps
const TOTAL_STEPS = 14;

// ---------------------------------------------------------------------------
// Menu/Permission structures
// ---------------------------------------------------------------------------

const MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'overview', label: 'Overview' },
  { key: 'account-settings', label: 'Account Settings' },
  { key: 'access-control', label: 'Access Control' },
  { key: 'security', label: 'Security & Governance' },
  { key: 'pipelines', label: 'Pipelines' },
  { key: 'builds', label: 'Builds' },
];

const ACCOUNT_SETTINGS_TABS = [
  { key: 'enterprises', label: 'Enterprise' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'global-settings', label: 'Global Settings' },
];

const ACCESS_CONTROL_TABS = [
  { key: 'users', label: 'Users' },
  { key: 'groups', label: 'Groups' },
  { key: 'roles', label: 'Roles' },
];

// ---------------------------------------------------------------------------
// AWS Clients
// ---------------------------------------------------------------------------

// Build credentials: if explicit keys are set use them, otherwise let the SDK
// pick up the ambient credentials (OIDC / instance profile / session token).
const clientConfig: { region: string; credentials?: any } = { region: AWS_REGION };

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  const creds: any = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
  if (process.env.AWS_SESSION_TOKEN) {
    creds.sessionToken = process.env.AWS_SESSION_TOKEN;
  }
  clientConfig.credentials = creds;
}

const dynamoClient = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true },
});

const ssmClient = new SSMClient(clientConfig);

let cognitoClient: CognitoIdentityProviderClient | null = null;
if (WITH_COGNITO) {
  cognitoClient = new CognitoIdentityProviderClient(clientConfig);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(step: number, message: string) {
  const prefix = DRY_RUN ? '[DRY-RUN]' : '';
  console.log(`${prefix}[${step}/${TOTAL_STEPS}] ✅ ${message}`);
}

function getTabsForMenu(menuKey: string, fullAccess: boolean): any[] {
  if (menuKey === 'account-settings') {
    return ACCOUNT_SETTINGS_TABS.map((t) => ({
      key: t.key,
      label: t.label,
      isVisible: true,
      canView: true,
      canCreate: fullAccess,
      canEdit: fullAccess,
      canDelete: fullAccess,
    }));
  }
  if (menuKey === 'access-control') {
    return ACCESS_CONTROL_TABS.map((t) => ({
      key: t.key,
      label: t.label,
      isVisible: true,
      canView: true,
      canCreate: fullAccess,
      canEdit: fullAccess,
      canDelete: fullAccess,
    }));
  }
  return [];
}

async function putItem(item: Record<string, any>) {
  if (DRY_RUN) return;
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

async function transactWriteItems(operations: any[]) {
  if (DRY_RUN) return;
  await docClient.send(
    new TransactWriteCommand({
      TransactItems: operations.map((op) => ({
        ...op,
        ...(op.Put && { Put: { ...op.Put, TableName: TABLE_NAME } }),
      })),
    }),
  );
}

async function putSSMParameter(name: string, value: string) {
  if (DRY_RUN) return;
  try {
    await ssmClient.send(
      new PutParameterCommand({
        Name: name,
        Value: value,
        Type: 'String',
        Overwrite: true,
      }),
    );
  } catch (err: any) {
    console.warn(`    ⚠ SSM write skipped: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap Steps
// ---------------------------------------------------------------------------

async function checkExistingBootstrap(): Promise<boolean> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, SK: 'METADATA' },
      }),
    );
    return !!result.Item;
  } catch {
    return false;
  }
}

// Step 1 — Create ABC Account + Address + SSM registration
async function step1_createAccount(now: string) {
  log(1, `Account 'ABC' created (${FIXED_IDS.ACCOUNT})`);
  await transactWriteItems([
    {
      Put: {
        Item: {
          PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
          SK: 'METADATA',
          GSI1PK: 'ENTITY#ACCOUNT',
          GSI1SK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
          GSI2PK: 'CLOUD_TYPE#PUBLIC',
          GSI2SK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
          id: FIXED_IDS.ACCOUNT,
          name: 'ABC',
          masterAccountName: 'ABC',
          cloudType: 'public',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      },
    },
    {
      Put: {
        Item: {
          PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
          SK: `ADDRESS#${FIXED_IDS.ADDRESS}`,
          id: FIXED_IDS.ADDRESS,
          accountId: FIXED_IDS.ACCOUNT,
          line1: '123 Platform Street',
          line2: 'Suite 100',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94105',
          country: 'United States',
          createdAt: now,
        },
      },
    },
  ]);

  // Register in SSM Parameter Store
  await putSSMParameter(
    `${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/dynamodb/table-name`,
    TABLE_NAME,
  );
  await putSSMParameter(
    `${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/cloud-type`,
    'public',
  );
  await putSSMParameter(
    `${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/provisioning-status`,
    'completed',
  );
}

// Step 2 — Create Global Enterprise
async function step2_createEnterprise(now: string) {
  log(2, `Enterprise 'Global' created`);
  await putItem({
    PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#ENTERPRISE',
    GSI1SK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
    id: FIXED_IDS.ENTERPRISE,
    name: 'Global',
    createdAt: now,
    updatedAt: now,
  });
}

// Step 3 — Create Global Product
async function step3_createProduct(now: string) {
  log(3, `Product 'Global' created`);
  await putItem({
    PK: `PRODUCT#${FIXED_IDS.PRODUCT}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#PRODUCT',
    GSI1SK: `PRODUCT#${FIXED_IDS.PRODUCT}`,
    id: FIXED_IDS.PRODUCT,
    name: 'Global',
    description: 'Default global product',
    createdAt: now,
  });
}

// Step 4 — Create Global Service
async function step4_createService(now: string) {
  log(4, `Service 'Global' created`);
  await putItem({
    PK: `SERVICE#${FIXED_IDS.SERVICE}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#SERVICE',
    GSI1SK: `SERVICE#${FIXED_IDS.SERVICE}`,
    id: FIXED_IDS.SERVICE,
    name: 'Global',
    description: 'Default global service',
    createdAt: now,
  });
}

// Step 5 — Link Enterprise → Product (Enterprise 'Global' linked to Product 'Global')
async function step5_linkEnterpriseProduct(now: string) {
  log(5, `Enterprise 'Global' linked to Product 'Global'`);
  await putItem({
    PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
    SK: `PRODUCT#${FIXED_IDS.PRODUCT}`,
    enterpriseId: FIXED_IDS.ENTERPRISE,
    productId: FIXED_IDS.PRODUCT,
    createdAt: now,
  });
}

// Step 6 — Link Product → Service (Product 'Global' linked to Service 'Global')
async function step6_linkProductService(now: string) {
  log(6, `Product 'Global' linked to Service 'Global'`);
  await putItem({
    PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
    SK: `SERVICE#${FIXED_IDS.SERVICE}`,
    enterpriseId: FIXED_IDS.ENTERPRISE,
    productId: FIXED_IDS.PRODUCT,
    serviceId: FIXED_IDS.SERVICE,
    createdAt: now,
  });
}

// Step 7 — Create Global License (100 users)
async function step7_createLicense(now: string) {
  log(7, `License created (100 users, Global scope)`);
  await putItem({
    PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
    SK: `LICENSE#${FIXED_IDS.LICENSE}`,
    GSI1PK: 'ENTITY#LICENSE',
    GSI1SK: `LICENSE#${FIXED_IDS.LICENSE}`,
    GSI2PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
    GSI2SK: `LICENSE#${FIXED_IDS.LICENSE}`,
    GSI3PK: 'LICENSE#STATUS#active',
    GSI3SK: `2099-12-31#${FIXED_IDS.LICENSE}`,
    id: FIXED_IDS.LICENSE,
    accountId: FIXED_IDS.ACCOUNT,
    enterpriseId: FIXED_IDS.ENTERPRISE,
    productId: FIXED_IDS.PRODUCT,
    serviceId: FIXED_IDS.SERVICE,
    startDate: now.split('T')[0],
    endDate: '2099-12-31',
    numberOfUsers: 100,
    renewalNotify: true,
    noticeDays: 30,
    contactFullName: 'ABC DEF',
    contactEmail: 'admin@adminplatform.com',
    createdAt: now,
    updatedAt: now,
  });
}

// Step 8 — Create Platform Admin Role (full CRUD)
async function step8_createPlatformRole(now: string) {
  log(8, `Role 'Platform Admin' created (permissions: 0x7FFF)`);

  await putItem({
    PK: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#ROLE',
    GSI1SK: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`,
    id: FIXED_IDS.PLATFORM_ROLE,
    name: 'Platform Admin',
    description: 'Full application access for platform administrators',
    permissions: 0,
    accountId: FIXED_IDS.ACCOUNT,
    enterpriseId: FIXED_IDS.ENTERPRISE,
    workstreamId: FIXED_IDS.GLOBAL_WORKSTREAM,
    productId: FIXED_IDS.PRODUCT,
    serviceId: FIXED_IDS.SERVICE,
    createdAt: now,
    updatedAt: now,
  });

  // Platform Admin Role — full permissions for every menu
  for (const menu of MENU_ITEMS) {
    await putItem({
      PK: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`,
      SK: `PERMISSION#${menu.key}`,
      id: uuidv4(),
      roleId: FIXED_IDS.PLATFORM_ROLE,
      menuKey: menu.key,
      menuLabel: menu.label,
      isVisible: true,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      tabs: getTabsForMenu(menu.key, true),
      createdAt: now,
      updatedAt: now,
    });
  }

  // Link role to Global workstream
  await putItem({
    PK: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`,
    SK: `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`,
    id: uuidv4(),
    roleId: FIXED_IDS.PLATFORM_ROLE,
    workstreamId: FIXED_IDS.GLOBAL_WORKSTREAM,
    createdAt: now,
  });
}

// Step 9 — Create Technical Role (view-only)
async function step9_createTechnicalRole(now: string) {
  log(9, `Role 'Technical Role' created (permissions: view-only)`);

  await putItem({
    PK: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#ROLE',
    GSI1SK: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`,
    id: FIXED_IDS.TECHNICAL_ROLE,
    name: 'Technical Role',
    description: 'Base access for technical users in customer accounts',
    permissions: 0,
    accountId: FIXED_IDS.ACCOUNT,
    enterpriseId: FIXED_IDS.ENTERPRISE,
    workstreamId: FIXED_IDS.GLOBAL_WORKSTREAM,
    productId: FIXED_IDS.PRODUCT,
    serviceId: FIXED_IDS.SERVICE,
    createdAt: now,
    updatedAt: now,
  });

  // Technical Role — view-only permissions
  for (const menu of MENU_ITEMS) {
    await putItem({
      PK: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`,
      SK: `PERMISSION#${menu.key}`,
      id: uuidv4(),
      roleId: FIXED_IDS.TECHNICAL_ROLE,
      menuKey: menu.key,
      menuLabel: menu.label,
      isVisible: true,
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      tabs: getTabsForMenu(menu.key, false),
      createdAt: now,
      updatedAt: now,
    });
  }

  // Link role to Global workstream
  await putItem({
    PK: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`,
    SK: `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`,
    id: uuidv4(),
    roleId: FIXED_IDS.TECHNICAL_ROLE,
    workstreamId: FIXED_IDS.GLOBAL_WORKSTREAM,
    createdAt: now,
  });
}

// Step 10 — Create Platform Admin Group → Platform Admin role
async function step10_createAdminsGroup(now: string) {
  log(10, `Group 'Platform Admin' created → Platform Admin role`);
  await transactWriteItems([
    {
      Put: {
        Item: {
          PK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`,
          SK: 'METADATA',
          GSI1PK: 'ENTITY#GROUP',
          GSI1SK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`,
          id: FIXED_IDS.PLATFORM_GROUP,
          name: 'Platform Admin',
          description: 'Full platform administration access',
          accountId: FIXED_IDS.ACCOUNT,
          enterpriseId: FIXED_IDS.ENTERPRISE,
          workstreamId: FIXED_IDS.GLOBAL_WORKSTREAM,
          createdAt: now,
          updatedAt: now,
        },
      },
    },
    {
      Put: {
        Item: {
          PK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`,
          SK: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`,
          id: uuidv4(),
          groupId: FIXED_IDS.PLATFORM_GROUP,
          roleId: FIXED_IDS.PLATFORM_ROLE,
          createdAt: now,
        },
      },
    },
  ]);
}

// Step 11 — Create Technical Group → Technical Role
async function step11_createTechnicalGroup(now: string) {
  log(11, `Group 'Technical Group' created → Technical Role role`);
  await transactWriteItems([
    {
      Put: {
        Item: {
          PK: `GROUP#${FIXED_IDS.TECHNICAL_GROUP}`,
          SK: 'METADATA',
          GSI1PK: 'ENTITY#GROUP',
          GSI1SK: `GROUP#${FIXED_IDS.TECHNICAL_GROUP}`,
          id: FIXED_IDS.TECHNICAL_GROUP,
          name: 'Technical Group',
          description: 'Default technical user group for customer accounts',
          accountId: FIXED_IDS.ACCOUNT,
          enterpriseId: FIXED_IDS.ENTERPRISE,
          workstreamId: FIXED_IDS.GLOBAL_WORKSTREAM,
          createdAt: now,
          updatedAt: now,
        },
      },
    },
    {
      Put: {
        Item: {
          PK: `GROUP#${FIXED_IDS.TECHNICAL_GROUP}`,
          SK: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`,
          id: uuidv4(),
          groupId: FIXED_IDS.TECHNICAL_GROUP,
          roleId: FIXED_IDS.TECHNICAL_ROLE,
          createdAt: now,
        },
      },
    },
  ]);
}

// Step 12 — Create Admin User + Cognito provisioning
async function step12_createAdminUser(now: string) {
  log(12, `User 'admin@adminplatform.com' created in DynamoDB + Cognito`);

  await transactWriteItems([
    {
      Put: {
        Item: {
          PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
          SK: `TECH_USER#${FIXED_IDS.ADMIN_USER}`,
          GSI1PK: 'ENTITY#TECH_USER',
          GSI1SK: `USER#${FIXED_IDS.ADMIN_USER}`,
          id: FIXED_IDS.ADMIN_USER,
          accountId: FIXED_IDS.ACCOUNT,
          enterpriseId: FIXED_IDS.ENTERPRISE,
          firstName: 'ABC',
          lastName: 'DEF',
          email: 'admin@adminplatform.com',
          assignedRole: 'Platform Admin',
          assignedGroup: 'Platform Admin',
          startDate: now.split('T')[0],
          status: 'active',
          isTechnicalUser: true,
          createdAt: now,
          updatedAt: now,
        },
      },
    },
    {
      Put: {
        Item: {
          PK: `USER#${FIXED_IDS.ADMIN_USER}`,
          SK: 'METADATA',
          GSI1PK: 'ENTITY#USER',
          GSI1SK: `USER#${FIXED_IDS.ADMIN_USER}`,
          GSI2PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}#USERS`,
          GSI2SK: `USER#${FIXED_IDS.ADMIN_USER}`,
          id: FIXED_IDS.ADMIN_USER,
          accountId: FIXED_IDS.ACCOUNT,
          enterpriseId: FIXED_IDS.ENTERPRISE,
          firstName: 'ABC',
          lastName: 'DEF',
          email: 'admin@adminplatform.com',
          assignedRole: 'Platform Admin',
          assignedGroup: 'Platform Admin',
          startDate: now.split('T')[0],
          status: 'active',
          isTechnicalUser: true,
          createdAt: now,
          updatedAt: now,
        },
      },
    },
  ]);

  // Assign admin user to Admins group
  await putItem({
    PK: `USER#${FIXED_IDS.ADMIN_USER}`,
    SK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`,
    id: uuidv4(),
    userId: FIXED_IDS.ADMIN_USER,
    groupId: FIXED_IDS.PLATFORM_GROUP,
    createdAt: now,
  });

  // Cognito provisioning
  if (WITH_COGNITO) {
    await createCognitoUser();
  }
}

// Step 13 — Create Global Workstream
async function step13_createGlobalWorkstream(now: string) {
  log(13, `Workstream 'Global' created`);

  await putItem({
    PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
    SK: `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`,
    GSI1PK: 'ENTITY#WORKSTREAM',
    GSI1SK: `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`,
    GSI2PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
    GSI2SK: `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`,
    id: FIXED_IDS.GLOBAL_WORKSTREAM,
    name: 'Global',
    accountId: FIXED_IDS.ACCOUNT,
    enterpriseId: FIXED_IDS.ENTERPRISE,
    createdAt: now,
    updatedAt: now,
  });

  // Assign admin user to Global workstream
  await putItem({
    PK: `USER#${FIXED_IDS.ADMIN_USER}`,
    SK: `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`,
    id: uuidv4(),
    userId: FIXED_IDS.ADMIN_USER,
    workstreamId: FIXED_IDS.GLOBAL_WORKSTREAM,
    createdAt: now,
  });
}

// Step 14 — Create Default Workstream
async function step14_createDefaultWorkstream(now: string) {
  log(14, `Workstream 'Default' created`);

  await putItem({
    PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
    SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
    GSI1PK: 'ENTITY#WORKSTREAM',
    GSI1SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
    GSI2PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
    GSI2SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
    id: FIXED_IDS.DEFAULT_WORKSTREAM,
    name: 'Default',
    accountId: FIXED_IDS.ACCOUNT,
    enterpriseId: FIXED_IDS.ENTERPRISE,
    createdAt: now,
    updatedAt: now,
  });

  // Assign admin user to Default workstream
  await putItem({
    PK: `USER#${FIXED_IDS.ADMIN_USER}`,
    SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
    id: uuidv4(),
    userId: FIXED_IDS.ADMIN_USER,
    workstreamId: FIXED_IDS.DEFAULT_WORKSTREAM,
    createdAt: now,
  });
}

// ---------------------------------------------------------------------------
// Cognito User Provisioning (called from step 12)
// ---------------------------------------------------------------------------

async function createCognitoUser() {
  if (!COGNITO_USER_POOL_ID) {
    console.error('    ✗ COGNITO_USER_POOL_ID is required when using --with-cognito');
    return;
  }

  if (DRY_RUN) return;

  const email = 'admin@adminplatform.com';
  const password = 'Adminuser@123';

  try {
    // Create Cognito group first
    try {
      await cognitoClient!.send(
        new CreateGroupCommand({
          UserPoolId: COGNITO_USER_POOL_ID,
          GroupName: 'admin',
          Description: 'Platform administrators',
        }),
      );
      console.log('    ✓ Created Cognito group: admin');
    } catch (err: any) {
      if (err.name === 'GroupExistsException') {
        console.log('    ○ Cognito group "admin" already exists');
      } else {
        throw err;
      }
    }

    // Create user
    await cognitoClient!.send(
      new AdminCreateUserCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:account_id', Value: FIXED_IDS.ACCOUNT },
          { Name: 'custom:enterprise_id', Value: FIXED_IDS.ENTERPRISE },
          { Name: 'custom:role', Value: 'super_admin' },
        ],
        MessageAction: MessageActionType.SUPPRESS,
      }),
    );
    console.log(`    ✓ Created Cognito user: ${email}`);

    // Set permanent password
    await cognitoClient!.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true,
      }),
    );
    console.log('    ✓ Set permanent password');

    // Add user to admin group
    await cognitoClient!.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: email,
        GroupName: 'admin',
      }),
    );
    console.log('    ✓ Added user to admin group');
  } catch (err: any) {
    if (err.name === 'UsernameExistsException') {
      console.log(`    ○ Cognito user "${email}" already exists`);
    } else {
      console.error(`    ✗ Cognito error: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Day-0 Platform Bootstrap CLI                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Region:        ${AWS_REGION}`);
  console.log(`  Table:         ${TABLE_NAME}`);
  console.log(`  Cognito:       ${WITH_COGNITO ? COGNITO_USER_POOL_ID || '(missing pool ID!)' : 'disabled'}`);
  console.log(`  Dry Run:       ${DRY_RUN}`);
  console.log(`  Force:         ${FORCE}`);
  console.log('');

  // Pre-flight check
  if (!DRY_RUN) {
    const alreadyDone = await checkExistingBootstrap();
    if (alreadyDone && !FORCE) {
      console.log('  ⚠ Platform is already bootstrapped.');
      console.log('    Use --force to re-run and overwrite existing data.');
      console.log('');
      process.exit(0);
    }
    if (alreadyDone && FORCE) {
      console.log('  ⚠ Force mode: overwriting existing bootstrap data.\n');
    }
  }

  const now = new Date().toISOString();
  const startTime = Date.now();

  try {
    console.log('🚀 Day-0 Bootstrap Starting...');
    console.log('──────────────────────────────');

    await step1_createAccount(now);
    await step2_createEnterprise(now);
    await step3_createProduct(now);
    await step4_createService(now);
    await step5_linkEnterpriseProduct(now);
    await step6_linkProductService(now);
    await step7_createLicense(now);
    await step8_createPlatformRole(now);
    await step9_createTechnicalRole(now);
    await step10_createAdminsGroup(now);
    await step11_createTechnicalGroup(now);
    await step12_createAdminUser(now);
    await step13_createGlobalWorkstream(now);
    await step14_createDefaultWorkstream(now);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('──────────────────────────────');
    console.log(`🎉 Bootstrap ${DRY_RUN ? '(dry run) ' : ''}complete! ${TOTAL_STEPS}/${TOTAL_STEPS} steps succeeded.`);
    console.log('');
    console.log(`  Completed in ${elapsed}s`);
    console.log('');
    console.log('  Summary of created entities:');
    console.log(`    • Account:      ABC (${FIXED_IDS.ACCOUNT})`);
    console.log(`    • Enterprise:   Global (${FIXED_IDS.ENTERPRISE})`);
    console.log(`    • Product:      Global (${FIXED_IDS.PRODUCT})`);
    console.log(`    • Service:      Global (${FIXED_IDS.SERVICE})`);
    console.log(`    • License:      100 users (${FIXED_IDS.LICENSE})`);
    console.log(`    • Roles:        Platform Admin (full), Technical Role (view-only)`);
    console.log(`    • Groups:       Platform Admin → Platform Admin, Technical Group → Technical Role`);
    console.log(`    • Admin:        admin@adminplatform.com / Adminuser@123`);
    console.log(`    • Workstreams:  Global (${FIXED_IDS.GLOBAL_WORKSTREAM}), Default (${FIXED_IDS.DEFAULT_WORKSTREAM})`);
    if (WITH_COGNITO) {
      console.log(`    • Cognito:      admin@adminplatform.com in pool ${COGNITO_USER_POOL_ID}`);
    }
    console.log('');
  } catch (err: any) {
    console.error('');
    console.error(`  ✗ Bootstrap failed: ${err.message}`);
    console.error('');
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
