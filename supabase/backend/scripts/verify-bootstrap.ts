#!/usr/bin/env ts-node
/**
 * Day-0 Bootstrap Verification & Auto-Fix Script
 *
 * Validates that all required Day-0 entities exist in DynamoDB and
 * (optionally) AWS Cognito, reporting any missing or inconsistent data.
 * With --fix, automatically re-provisions any missing entities.
 *
 * Usage:
 *   npx ts-node scripts/verify-bootstrap.ts                # DynamoDB only
 *   npx ts-node scripts/verify-bootstrap.ts --with-cognito  # Include Cognito checks
 *   npx ts-node scripts/verify-bootstrap.ts --json          # Machine-readable output
 *   npx ts-node scripts/verify-bootstrap.ts --verbose       # Show all checks (pass + fail)
 *   npx ts-node scripts/verify-bootstrap.ts --fix           # Auto-fix missing entities
 *   npx ts-node scripts/verify-bootstrap.ts --fix --with-cognito  # Fix DynamoDB + Cognito
 *
 * Environment variables (loaded from .env.migration or .env):
 *   AWS_REGION              — AWS region (default: us-east-1)
 *   AWS_ACCESS_KEY_ID       — IAM credentials
 *   AWS_SECRET_ACCESS_KEY   — IAM credentials
 *   DYNAMODB_TABLE_NAME     — Target table (required, no default)
 *   COGNITO_USER_POOL_ID    — Required when --with-cognito is used
 *   SSM_PREFIX              — SSM path prefix (default: /accounts)
 *   BOOTSTRAP_ADMIN_PASSWORD— Admin password (default: Adminuser@123)
 *
 * Exit codes:
 *   0 — All checks passed (or all fixes succeeded)
 *   1 — One or more checks failed (and --fix was not used, or fix failed)
 *   2 — Script configuration error
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  CreateGroupCommand,
  GetGroupCommand,
  AdminListGroupsForUserCommand,
  MessageActionType,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  SSMClient,
  GetParameterCommand,
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
const ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Adminuser@123';

// CLI flags
const args = process.argv.slice(2);
const WITH_COGNITO = args.includes('--with-cognito');
const JSON_OUTPUT = args.includes('--json');
const VERBOSE = args.includes('--verbose');
const FIX_MODE = args.includes('--fix');

// ---------------------------------------------------------------------------
// Fixed UUIDs (must match bootstrap-day0.ts / BootstrapService)
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

const ADMIN_EMAIL = 'admin@adminplatform.com';

const MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'overview', label: 'Overview' },
  { key: 'account-settings', label: 'Account Settings' },
  { key: 'access-control', label: 'Access Control' },
  { key: 'security', label: 'Security & Governance' },
  { key: 'pipelines', label: 'Pipelines' },
  { key: 'builds', label: 'Builds' },
];

const MENU_KEYS = MENU_ITEMS.map((m) => m.key);

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

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
};

const dynamoClient = new DynamoDBClient({ region: AWS_REGION, credentials });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true },
});

const ssmClient = new SSMClient({ region: AWS_REGION, credentials });

let cognitoClient: CognitoIdentityProviderClient | null = null;
if (WITH_COGNITO && COGNITO_USER_POOL_ID) {
  cognitoClient = new CognitoIdentityProviderClient({ region: AWS_REGION, credentials });
}

// ---------------------------------------------------------------------------
// Check result types & tracking
// ---------------------------------------------------------------------------

type CheckStatus = 'pass' | 'fail' | 'warn' | 'fixed';

interface CheckResult {
  category: string;
  check: string;
  status: CheckStatus;
  detail?: string;
  expected?: string;
  actual?: string;
}

const results: CheckResult[] = [];

// Track which categories have failures so --fix can target them
const failedCategories = new Set<string>();

function record(
  category: string,
  check: string,
  status: CheckStatus,
  opts?: { detail?: string; expected?: string; actual?: string },
) {
  results.push({ category, check, status, ...opts });
  if (status === 'fail') {
    failedCategories.add(category);
  }
}

// ---------------------------------------------------------------------------
// DynamoDB Helpers
// ---------------------------------------------------------------------------

async function getItem(pk: string, sk: string): Promise<Record<string, any> | null> {
  try {
    const result = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: sk } }),
    );
    return result.Item || null;
  } catch {
    return null;
  }
}

async function putItem(item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

async function transactWriteItems(operations: any[]): Promise<void> {
  await docClient.send(
    new TransactWriteCommand({
      TransactItems: operations.map((op) => ({
        ...op,
        ...(op.Put && { Put: { ...op.Put, TableName: TABLE_NAME } }),
      })),
    }),
  );
}

async function queryItems(pk: string, skPrefix: string): Promise<Record<string, any>[]> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': pk, ':sk': skPrefix },
      }),
    );
    return result.Items || [];
  } catch {
    return [];
  }
}

async function getSSMParam(name: string): Promise<string | null> {
  try {
    const result = await ssmClient.send(new GetParameterCommand({ Name: name }));
    return result.Parameter?.Value || null;
  } catch {
    return null;
  }
}

async function putSSMParam(name: string, value: string): Promise<void> {
  await ssmClient.send(
    new PutParameterCommand({ Name: name, Value: value, Type: 'String', Overwrite: true }),
  );
}

function getTabsForMenu(menuKey: string, fullAccess: boolean): any[] {
  if (menuKey === 'account-settings') {
    return ACCOUNT_SETTINGS_TABS.map((t) => ({
      key: t.key, label: t.label, isVisible: true, canView: true,
      canCreate: fullAccess, canEdit: fullAccess, canDelete: fullAccess,
    }));
  }
  if (menuKey === 'access-control') {
    return ACCESS_CONTROL_TABS.map((t) => ({
      key: t.key, label: t.label, isVisible: true, canView: true,
      canCreate: fullAccess, canEdit: fullAccess, canDelete: fullAccess,
    }));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Verification Checks
// ---------------------------------------------------------------------------

async function verifyMasterData() {
  const cat = 'Master Data';

  const product = await getItem(`PRODUCT#${FIXED_IDS.PRODUCT}`, 'METADATA');
  if (product) {
    record(cat, 'Global Product exists', 'pass');
    if (product.name !== 'Global') {
      record(cat, 'Global Product name', 'fail', { expected: 'Global', actual: product.name });
    } else {
      record(cat, 'Global Product name', 'pass');
    }
  } else {
    record(cat, 'Global Product exists', 'fail', {
      detail: `PK=PRODUCT#${FIXED_IDS.PRODUCT}, SK=METADATA not found`,
    });
  }

  const service = await getItem(`SERVICE#${FIXED_IDS.SERVICE}`, 'METADATA');
  if (service) {
    record(cat, 'Global Service exists', 'pass');
    if (service.name !== 'Global') {
      record(cat, 'Global Service name', 'fail', { expected: 'Global', actual: service.name });
    } else {
      record(cat, 'Global Service name', 'pass');
    }
  } else {
    record(cat, 'Global Service exists', 'fail', {
      detail: `PK=SERVICE#${FIXED_IDS.SERVICE}, SK=METADATA not found`,
    });
  }
}

async function verifyGlobalEnterprise() {
  const cat = 'Global Enterprise';

  const enterprise = await getItem(`ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, 'METADATA');
  if (enterprise) {
    record(cat, 'Global Enterprise exists', 'pass');
    if (enterprise.name !== 'Global') {
      record(cat, 'Enterprise name', 'fail', { expected: 'Global', actual: enterprise.name });
    } else {
      record(cat, 'Enterprise name', 'pass');
    }
  } else {
    record(cat, 'Global Enterprise exists', 'fail');
    return;
  }

  const productLink = await getItem(`ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, `PRODUCT#${FIXED_IDS.PRODUCT}`);
  record(cat, 'Enterprise → Product linkage', productLink ? 'pass' : 'fail');

  const serviceLink = await getItem(`ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, `SERVICE#${FIXED_IDS.SERVICE}`);
  record(cat, 'Product → Service linkage', serviceLink ? 'pass' : 'fail');
}

async function verifyABCAccount() {
  const cat = 'ABC Account';

  const account = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, 'METADATA');
  if (account) {
    record(cat, 'ABC Account exists', 'pass');
    const fieldChecks: Array<{ field: string; expected: string }> = [
      { field: 'name', expected: 'ABC' },
      { field: 'cloudType', expected: 'public' },
      { field: 'status', expected: 'active' },
    ];
    for (const { field, expected } of fieldChecks) {
      if (account[field] === expected) {
        record(cat, `Account ${field}`, 'pass');
      } else {
        record(cat, `Account ${field}`, 'fail', { expected, actual: account[field] });
      }
    }
  } else {
    record(cat, 'ABC Account exists', 'fail');
    return;
  }

  const address = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, `ADDRESS#${FIXED_IDS.ADDRESS}`);
  record(cat, 'Default address exists', address ? 'pass' : 'warn', {
    detail: address ? undefined : 'Address record missing (non-critical)',
  });
}

async function verifySSMRegistration() {
  const cat = 'SSM Registration';

  const tableName = await getSSMParam(`${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/dynamodb/table-name`);
  if (tableName) {
    record(cat, 'SSM table-name parameter', 'pass');
    if (tableName !== TABLE_NAME) {
      record(cat, 'SSM table-name value', 'warn', {
        expected: TABLE_NAME, actual: tableName,
        detail: 'Table name mismatch — may indicate a different environment',
      });
    } else {
      record(cat, 'SSM table-name value', 'pass');
    }
  } else {
    record(cat, 'SSM table-name parameter', 'warn', {
      detail: 'SSM parameter missing — provisioning may not have completed or SSM is unconfigured',
    });
  }

  const cloudType = await getSSMParam(`${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/cloud-type`);
  record(cat, 'SSM cloud-type parameter', cloudType ? 'pass' : 'warn');

  const provisioningStatus = await getSSMParam(`${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/provisioning-status`);
  if (provisioningStatus === 'completed') {
    record(cat, 'SSM provisioning-status', 'pass');
  } else {
    record(cat, 'SSM provisioning-status', 'warn', {
      expected: 'completed', actual: provisioningStatus || '(not set)',
    });
  }
}

async function verifyLicense() {
  const cat = 'License';

  const license = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, `LICENSE#${FIXED_IDS.LICENSE}`);
  if (license) {
    record(cat, 'Global License exists', 'pass');

    if (license.numberOfUsers === 100) {
      record(cat, 'License user count', 'pass');
    } else {
      record(cat, 'License user count', 'warn', { expected: '100', actual: String(license.numberOfUsers) });
    }

    if (license.endDate === '2099-12-31') {
      record(cat, 'License expiry date', 'pass');
    } else {
      record(cat, 'License expiry date', 'warn', { expected: '2099-12-31', actual: license.endDate });
    }

    if (license.enterpriseId !== FIXED_IDS.ENTERPRISE) {
      record(cat, 'License enterprise linkage', 'fail', { expected: FIXED_IDS.ENTERPRISE, actual: license.enterpriseId });
    } else {
      record(cat, 'License enterprise linkage', 'pass');
    }

    if (license.productId !== FIXED_IDS.PRODUCT) {
      record(cat, 'License product linkage', 'fail', { expected: FIXED_IDS.PRODUCT, actual: license.productId });
    } else {
      record(cat, 'License product linkage', 'pass');
    }
  } else {
    record(cat, 'Global License exists', 'fail');
  }
}

async function verifyGroups() {
  const cat = 'Groups';

  const groupChecks = [
    { id: FIXED_IDS.PLATFORM_GROUP, name: 'Platform Admin', label: 'Platform Admin Group' },
    { id: FIXED_IDS.TECHNICAL_GROUP, name: 'Technical Group', label: 'Technical Group' },
  ];

  for (const { id, name, label } of groupChecks) {
    const group = await getItem(`GROUP#${id}`, 'METADATA');
    if (group) {
      record(cat, `${label} exists`, 'pass');
      if (group.name !== name) {
        record(cat, `${label} name`, 'fail', { expected: name, actual: group.name });
      } else {
        record(cat, `${label} name`, 'pass');
      }
      if (group.accountId !== FIXED_IDS.ACCOUNT) {
        record(cat, `${label} account linkage`, 'fail', { expected: FIXED_IDS.ACCOUNT, actual: group.accountId });
      } else {
        record(cat, `${label} account linkage`, 'pass');
      }
    } else {
      record(cat, `${label} exists`, 'fail');
    }
  }
}

async function verifyRoles() {
  const cat = 'Roles';

  const roleChecks = [
    { id: FIXED_IDS.PLATFORM_ROLE, name: 'Platform Admin', label: 'Platform Admin', fullAccess: true },
    { id: FIXED_IDS.TECHNICAL_ROLE, name: 'Technical Role', label: 'Technical Role', fullAccess: false },
  ];

  for (const { id, name, label, fullAccess } of roleChecks) {
    const role = await getItem(`ROLE#${id}`, 'METADATA');
    if (role) {
      record(cat, `${label} exists`, 'pass');
      if (role.name !== name) {
        record(cat, `${label} name`, 'fail', { expected: name, actual: role.name });
      } else {
        record(cat, `${label} name`, 'pass');
      }
    } else {
      record(cat, `${label} exists`, 'fail');
      continue;
    }

    const permissions = await queryItems(`ROLE#${id}`, 'PERMISSION#');
    const foundKeys = permissions.map((p) => p.menuKey);

    for (const menuKey of MENU_KEYS) {
      if (foundKeys.includes(menuKey)) {
        const perm = permissions.find((p) => p.menuKey === menuKey)!;
        record(cat, `${label} → ${menuKey} permission`, 'pass');

        if (fullAccess) {
          if (!perm.canCreate || !perm.canEdit || !perm.canDelete) {
            record(cat, `${label} → ${menuKey} full access`, 'fail', {
              detail: `Expected full CRUD, got create=${perm.canCreate} edit=${perm.canEdit} delete=${perm.canDelete}`,
            });
          }
        } else {
          if (perm.canCreate || perm.canEdit || perm.canDelete) {
            record(cat, `${label} → ${menuKey} view-only`, 'warn', {
              detail: 'Expected view-only, but write permissions are enabled',
            });
          }
        }
      } else {
        record(cat, `${label} → ${menuKey} permission`, 'fail', {
          detail: `PERMISSION#${menuKey} item missing for ROLE#${id}`,
        });
      }
    }
  }
}

async function verifyRoleGroupLinkage() {
  const cat = 'Role-Group Linkage';

  const platformLink = await getItem(`GROUP#${FIXED_IDS.PLATFORM_GROUP}`, `ROLE#${FIXED_IDS.PLATFORM_ROLE}`);
  record(cat, 'Platform Group → Platform Role', platformLink ? 'pass' : 'fail');

  const technicalLink = await getItem(`GROUP#${FIXED_IDS.TECHNICAL_GROUP}`, `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`);
  record(cat, 'Technical Group → Technical Role', technicalLink ? 'pass' : 'fail');
}

async function verifyAdminUser() {
  const cat = 'Admin User';

  const techUser = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, `TECH_USER#${FIXED_IDS.ADMIN_USER}`);
  if (techUser) {
    record(cat, 'Admin tech user record', 'pass');
    if (techUser.email !== ADMIN_EMAIL) {
      record(cat, 'Admin email', 'fail', { expected: ADMIN_EMAIL, actual: techUser.email });
    } else {
      record(cat, 'Admin email', 'pass');
    }
    if (techUser.status !== 'active') {
      record(cat, 'Admin status', 'fail', { expected: 'active', actual: techUser.status });
    } else {
      record(cat, 'Admin status', 'pass');
    }
  } else {
    record(cat, 'Admin tech user record', 'fail');
  }

  const userEntity = await getItem(`USER#${FIXED_IDS.ADMIN_USER}`, 'METADATA');
  if (userEntity) {
    record(cat, 'Admin user entity', 'pass');
    if (techUser && userEntity.email !== techUser.email) {
      record(cat, 'TECH_USER ↔ USER email consistency', 'fail', {
        detail: `TECH_USER has ${techUser.email}, USER has ${userEntity.email}`,
      });
    } else if (techUser) {
      record(cat, 'TECH_USER ↔ USER email consistency', 'pass');
    }
  } else {
    record(cat, 'Admin user entity', 'fail');
  }

  const userGroup = await getItem(`USER#${FIXED_IDS.ADMIN_USER}`, `GROUP#${FIXED_IDS.PLATFORM_GROUP}`);
  record(cat, 'Admin → Platform Admin Group assignment', userGroup ? 'pass' : 'fail');
}

async function verifyWorkstreams() {
  const cat = 'Workstreams';

  // Verify Global Workstream
  const globalWorkstream = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`);
  if (globalWorkstream) {
    record(cat, 'Global workstream exists', 'pass');
    if (globalWorkstream.name !== 'Global') {
      record(cat, 'Global workstream name', 'fail', { expected: 'Global', actual: globalWorkstream.name });
    } else {
      record(cat, 'Global workstream name', 'pass');
    }
  } else {
    record(cat, 'Global workstream exists', 'fail');
  }

  const userGlobalWorkstream = await getItem(`USER#${FIXED_IDS.ADMIN_USER}`, `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`);
  record(cat, 'Admin → Global Workstream assignment', userGlobalWorkstream ? 'pass' : 'fail');

  // Verify Default Workstream
  const defaultWorkstream = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`);
  if (defaultWorkstream) {
    record(cat, 'Default workstream exists', 'pass');
    if (defaultWorkstream.name !== 'Default') {
      record(cat, 'Default workstream name', 'fail', { expected: 'Default', actual: defaultWorkstream.name });
    } else {
      record(cat, 'Default workstream name', 'pass');
    }
  } else {
    record(cat, 'Default workstream exists', 'fail');
  }

  const userDefaultWorkstream = await getItem(`USER#${FIXED_IDS.ADMIN_USER}`, `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`);
  record(cat, 'Admin → Default Workstream assignment', userDefaultWorkstream ? 'pass' : 'fail');
}

async function verifyCognito() {
  const cat = 'Cognito';

  if (!WITH_COGNITO) {
    record(cat, 'Cognito verification', 'warn', { detail: 'Skipped — use --with-cognito to enable' });
    return;
  }

  if (!COGNITO_USER_POOL_ID || !cognitoClient) {
    record(cat, 'Cognito configuration', 'fail', { detail: 'COGNITO_USER_POOL_ID is not set' });
    return;
  }

  // Check PlatformAdmins group
  try {
    await cognitoClient.send(new GetGroupCommand({ GroupName: 'PlatformAdmins', UserPoolId: COGNITO_USER_POOL_ID }));
    record(cat, 'PlatformAdmins group exists', 'pass');
  } catch (err: any) {
    if (err.name === 'ResourceNotFoundException') {
      try {
        await cognitoClient.send(new GetGroupCommand({ GroupName: 'admin', UserPoolId: COGNITO_USER_POOL_ID }));
        record(cat, 'PlatformAdmins group exists', 'warn', {
          detail: 'Legacy "admin" group found instead of "PlatformAdmins" — consider migrating',
        });
      } catch {
        record(cat, 'PlatformAdmins group exists', 'fail');
      }
    } else {
      record(cat, 'PlatformAdmins group exists', 'fail', { detail: err.message });
    }
  }

  // Check admin user exists
  try {
    const userResult = await cognitoClient.send(
      new AdminGetUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: ADMIN_EMAIL }),
    );
    record(cat, 'Admin user exists in Cognito', 'pass');

    const userStatus = userResult.UserStatus;
    if (userStatus === 'CONFIRMED') {
      record(cat, 'Admin user status', 'pass');
    } else {
      record(cat, 'Admin user status', 'warn', { expected: 'CONFIRMED', actual: userStatus || 'unknown' });
    }

    const attrs = userResult.UserAttributes || [];
    const getAttr = (name: string) => attrs.find((a) => a.Name === name)?.Value;

    const cognitoSub = getAttr('sub');
    if (cognitoSub) {
      record(cat, 'Admin Cognito sub', 'pass', { detail: `sub=${cognitoSub}` });
    }

    const accountId = getAttr('custom:account_id');
    if (accountId === FIXED_IDS.ACCOUNT) {
      record(cat, 'Admin custom:account_id', 'pass');
    } else {
      record(cat, 'Admin custom:account_id', 'fail', { expected: FIXED_IDS.ACCOUNT, actual: accountId || '(not set)' });
    }

    const enterpriseId = getAttr('custom:enterprise_id');
    if (enterpriseId === FIXED_IDS.ENTERPRISE) {
      record(cat, 'Admin custom:enterprise_id', 'pass');
    } else {
      record(cat, 'Admin custom:enterprise_id', 'fail', { expected: FIXED_IDS.ENTERPRISE, actual: enterpriseId || '(not set)' });
    }

    const role = getAttr('custom:role');
    if (role === 'super_admin') {
      record(cat, 'Admin custom:role', 'pass');
    } else {
      record(cat, 'Admin custom:role', 'fail', { expected: 'super_admin', actual: role || '(not set)' });
    }

    // Group membership
    try {
      const groupsResult = await cognitoClient.send(
        new AdminListGroupsForUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: ADMIN_EMAIL }),
      );
      const groupNames = (groupsResult.Groups || []).map((g) => g.GroupName);
      if (groupNames.includes('PlatformAdmins') || groupNames.includes('admin')) {
        record(cat, 'Admin group membership', 'pass', { detail: `Member of: ${groupNames.join(', ')}` });
      } else {
        record(cat, 'Admin group membership', 'fail', {
          detail: `Not in PlatformAdmins or admin group. Groups: ${groupNames.join(', ') || '(none)'}`,
        });
      }
    } catch (err: any) {
      record(cat, 'Admin group membership', 'fail', { detail: err.message });
    }

    // Cross-reference DynamoDB cognitoSub
    const userEntity = await getItem(`USER#${FIXED_IDS.ADMIN_USER}`, 'METADATA');
    if (userEntity) {
      if (userEntity.cognitoSub === cognitoSub) {
        record(cat, 'DynamoDB ↔ Cognito sub consistency', 'pass');
      } else if (!userEntity.cognitoSub) {
        record(cat, 'DynamoDB ↔ Cognito sub consistency', 'warn', {
          detail: `DynamoDB user missing cognitoSub (expected: ${cognitoSub}). Run reconciliation.`,
        });
      } else {
        record(cat, 'DynamoDB ↔ Cognito sub consistency', 'fail', {
          expected: cognitoSub || '', actual: userEntity.cognitoSub,
        });
      }
    }
  } catch (err: any) {
    if (err.name === 'UserNotFoundException') {
      record(cat, 'Admin user exists in Cognito', 'fail', {
        detail: `${ADMIN_EMAIL} not found in user pool ${COGNITO_USER_POOL_ID}`,
      });
    } else {
      record(cat, 'Admin user exists in Cognito', 'fail', { detail: err.message });
    }
  }
}

// ==========================================================================
// FIX FUNCTIONS — each idempotently re-creates a specific entity category
// ==========================================================================

const fixResults: CheckResult[] = [];

function recordFix(check: string, status: 'fixed' | 'fail', detail?: string) {
  fixResults.push({ category: 'Auto-Fix', check, status, detail });
}

async function fixMasterData() {
  const now = new Date().toISOString();
  try {
    const product = await getItem(`PRODUCT#${FIXED_IDS.PRODUCT}`, 'METADATA');
    const service = await getItem(`SERVICE#${FIXED_IDS.SERVICE}`, 'METADATA');
    const ops: any[] = [];

    if (!product || product.name !== 'Global') {
      ops.push({
        Put: {
          Item: {
            PK: `PRODUCT#${FIXED_IDS.PRODUCT}`, SK: 'METADATA',
            GSI1PK: 'ENTITY#PRODUCT', GSI1SK: `PRODUCT#${FIXED_IDS.PRODUCT}`,
            id: FIXED_IDS.PRODUCT, name: 'Global', description: 'Default global product', createdAt: now,
          },
        },
      });
    }
    if (!service || service.name !== 'Global') {
      ops.push({
        Put: {
          Item: {
            PK: `SERVICE#${FIXED_IDS.SERVICE}`, SK: 'METADATA',
            GSI1PK: 'ENTITY#SERVICE', GSI1SK: `SERVICE#${FIXED_IDS.SERVICE}`,
            id: FIXED_IDS.SERVICE, name: 'Global', description: 'Default global service', createdAt: now,
          },
        },
      });
    }

    if (ops.length > 0) {
      await transactWriteItems(ops);
      recordFix('Global Product & Service', 'fixed');
    }
  } catch (err: any) {
    recordFix('Global Product & Service', 'fail', err.message);
  }
}

async function fixGlobalEnterprise() {
  const now = new Date().toISOString();
  try {
    const ops: any[] = [];
    const enterprise = await getItem(`ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, 'METADATA');
    if (!enterprise) {
      ops.push({
        Put: {
          Item: {
            PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, SK: 'METADATA',
            GSI1PK: 'ENTITY#ENTERPRISE', GSI1SK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
            id: FIXED_IDS.ENTERPRISE, name: 'Global', createdAt: now, updatedAt: now,
          },
        },
      });
    }
    const prodLink = await getItem(`ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, `PRODUCT#${FIXED_IDS.PRODUCT}`);
    if (!prodLink) {
      ops.push({
        Put: {
          Item: {
            PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, SK: `PRODUCT#${FIXED_IDS.PRODUCT}`,
            enterpriseId: FIXED_IDS.ENTERPRISE, productId: FIXED_IDS.PRODUCT, createdAt: now,
          },
        },
      });
    }
    const svcLink = await getItem(`ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, `SERVICE#${FIXED_IDS.SERVICE}`);
    if (!svcLink) {
      ops.push({
        Put: {
          Item: {
            PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, SK: `SERVICE#${FIXED_IDS.SERVICE}`,
            enterpriseId: FIXED_IDS.ENTERPRISE, serviceId: FIXED_IDS.SERVICE, createdAt: now,
          },
        },
      });
    }
    if (ops.length > 0) {
      await transactWriteItems(ops);
      recordFix('Global Enterprise + linkages', 'fixed');
    }
  } catch (err: any) {
    recordFix('Global Enterprise + linkages', 'fail', err.message);
  }
}

async function fixABCAccount() {
  const now = new Date().toISOString();
  try {
    const ops: any[] = [];
    const account = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, 'METADATA');
    if (!account) {
      ops.push({
        Put: {
          Item: {
            PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, SK: 'METADATA',
            GSI1PK: 'ENTITY#ACCOUNT', GSI1SK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
            GSI2PK: 'CLOUD_TYPE#PUBLIC', GSI2SK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
            id: FIXED_IDS.ACCOUNT, name: 'ABC', masterAccountName: 'ABC',
            cloudType: 'public', status: 'active', createdAt: now, updatedAt: now,
          },
        },
      });
    }
    const address = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, `ADDRESS#${FIXED_IDS.ADDRESS}`);
    if (!address) {
      ops.push({
        Put: {
          Item: {
            PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, SK: `ADDRESS#${FIXED_IDS.ADDRESS}`,
            id: FIXED_IDS.ADDRESS, accountId: FIXED_IDS.ACCOUNT,
            line1: '123 Platform Street', line2: 'Suite 100', city: 'San Francisco',
            state: 'CA', postalCode: '94105', country: 'United States', createdAt: now,
          },
        },
      });
    }
    if (ops.length > 0) {
      await transactWriteItems(ops);
      recordFix('ABC Account + address', 'fixed');
    }
  } catch (err: any) {
    recordFix('ABC Account + address', 'fail', err.message);
  }
}

async function fixSSMRegistration() {
  try {
    await putSSMParam(`${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/dynamodb/table-name`, TABLE_NAME);
    await putSSMParam(`${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/cloud-type`, 'public');
    await putSSMParam(`${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/provisioning-status`, 'completed');
    recordFix('SSM parameters', 'fixed');
  } catch (err: any) {
    recordFix('SSM parameters', 'fail', err.message);
  }
}

async function fixLicense() {
  const now = new Date().toISOString();
  try {
    const license = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, `LICENSE#${FIXED_IDS.LICENSE}`);
    if (!license) {
      await putItem({
        PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, SK: `LICENSE#${FIXED_IDS.LICENSE}`,
        GSI1PK: 'ENTITY#LICENSE', GSI1SK: `LICENSE#${FIXED_IDS.LICENSE}`,
        GSI2PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, GSI2SK: `LICENSE#${FIXED_IDS.LICENSE}`,
        GSI3PK: 'LICENSE#STATUS#active', GSI3SK: `2099-12-31#${FIXED_IDS.LICENSE}`,
        id: FIXED_IDS.LICENSE, accountId: FIXED_IDS.ACCOUNT, enterpriseId: FIXED_IDS.ENTERPRISE,
        productId: FIXED_IDS.PRODUCT, serviceId: FIXED_IDS.SERVICE,
        startDate: now.split('T')[0], endDate: '2099-12-31', numberOfUsers: 100,
        renewalNotify: true, noticeDays: 30,
        contactFullName: 'ABC DEF', contactEmail: ADMIN_EMAIL,
        createdAt: now, updatedAt: now,
      });
      recordFix('Global License', 'fixed');
    }
  } catch (err: any) {
    recordFix('Global License', 'fail', err.message);
  }
}

async function fixGroups() {
  const now = new Date().toISOString();
  try {
    const ops: any[] = [];

    const platformGroup = await getItem(`GROUP#${FIXED_IDS.PLATFORM_GROUP}`, 'METADATA');
    if (!platformGroup) {
      ops.push({
        Put: {
          Item: {
            PK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`, SK: 'METADATA',
            GSI1PK: 'ENTITY#GROUP', GSI1SK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`,
            id: FIXED_IDS.PLATFORM_GROUP, name: 'Platform Admin',
            description: 'Full platform administration access',
            accountId: FIXED_IDS.ACCOUNT, enterpriseId: FIXED_IDS.ENTERPRISE,
            workstreamId: FIXED_IDS.GLOBAL_WORKSTREAM, createdAt: now, updatedAt: now,
          },
        },
      });
    }

    const technicalGroup = await getItem(`GROUP#${FIXED_IDS.TECHNICAL_GROUP}`, 'METADATA');
    if (!technicalGroup) {
      ops.push({
        Put: {
          Item: {
            PK: `GROUP#${FIXED_IDS.TECHNICAL_GROUP}`, SK: 'METADATA',
            GSI1PK: 'ENTITY#GROUP', GSI1SK: `GROUP#${FIXED_IDS.TECHNICAL_GROUP}`,
            id: FIXED_IDS.TECHNICAL_GROUP, name: 'Technical Group',
            description: 'Default technical user group for customer accounts',
            accountId: FIXED_IDS.ACCOUNT, enterpriseId: FIXED_IDS.ENTERPRISE,
            workstreamId: FIXED_IDS.GLOBAL_WORKSTREAM, createdAt: now, updatedAt: now,
          },
        },
      });
    }

    if (ops.length > 0) {
      await transactWriteItems(ops);
      recordFix('Groups', 'fixed');
    }
  } catch (err: any) {
    recordFix('Groups', 'fail', err.message);
  }
}

async function fixRoles() {
  const now = new Date().toISOString();
  try {
    // Fix role metadata
    const roleConfigs = [
      {
        id: FIXED_IDS.PLATFORM_ROLE, name: 'Platform Admin',
        description: 'Full application access for platform administrators', fullAccess: true,
      },
      {
        id: FIXED_IDS.TECHNICAL_ROLE, name: 'Technical Role',
        description: 'Base access for technical users in customer accounts', fullAccess: false,
      },
    ];

    for (const cfg of roleConfigs) {
      const role = await getItem(`ROLE#${cfg.id}`, 'METADATA');
      if (!role) {
        await putItem({
          PK: `ROLE#${cfg.id}`, SK: 'METADATA',
          GSI1PK: 'ENTITY#ROLE', GSI1SK: `ROLE#${cfg.id}`,
          id: cfg.id, name: cfg.name, description: cfg.description, permissions: 0,
          accountId: FIXED_IDS.ACCOUNT, enterpriseId: FIXED_IDS.ENTERPRISE,
          workstreamId: FIXED_IDS.GLOBAL_WORKSTREAM,
          productId: FIXED_IDS.PRODUCT, serviceId: FIXED_IDS.SERVICE,
          createdAt: now, updatedAt: now,
        });
        recordFix(`${cfg.name} metadata`, 'fixed');
      }

      // Fix missing permissions
      const existingPerms = await queryItems(`ROLE#${cfg.id}`, 'PERMISSION#');
      const existingKeys = existingPerms.map((p) => p.menuKey);

      for (const menu of MENU_ITEMS) {
        if (!existingKeys.includes(menu.key)) {
          await putItem({
            PK: `ROLE#${cfg.id}`, SK: `PERMISSION#${menu.key}`,
            id: uuidv4(), roleId: cfg.id, menuKey: menu.key, menuLabel: menu.label,
            isVisible: true, canView: true,
            canCreate: cfg.fullAccess, canEdit: cfg.fullAccess, canDelete: cfg.fullAccess,
            tabs: getTabsForMenu(menu.key, cfg.fullAccess),
            createdAt: now, updatedAt: now,
          });
          recordFix(`${cfg.name} → ${menu.key} permission`, 'fixed');
        }
      }
    }
  } catch (err: any) {
    recordFix('Roles', 'fail', err.message);
  }
}

async function fixRoleGroupLinkage() {
  const now = new Date().toISOString();
  try {
    const ops: any[] = [];

    const platformLink = await getItem(`GROUP#${FIXED_IDS.PLATFORM_GROUP}`, `ROLE#${FIXED_IDS.PLATFORM_ROLE}`);
    if (!platformLink) {
      ops.push({
        Put: {
          Item: {
            PK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`, SK: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`,
            id: uuidv4(), groupId: FIXED_IDS.PLATFORM_GROUP, roleId: FIXED_IDS.PLATFORM_ROLE, createdAt: now,
          },
        },
      });
    }

    const technicalLink = await getItem(`GROUP#${FIXED_IDS.TECHNICAL_GROUP}`, `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`);
    if (!technicalLink) {
      ops.push({
        Put: {
          Item: {
            PK: `GROUP#${FIXED_IDS.TECHNICAL_GROUP}`, SK: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`,
            id: uuidv4(), groupId: FIXED_IDS.TECHNICAL_GROUP, roleId: FIXED_IDS.TECHNICAL_ROLE, createdAt: now,
          },
        },
      });
    }

    if (ops.length > 0) {
      await transactWriteItems(ops);
      recordFix('Role-Group linkages', 'fixed');
    }
  } catch (err: any) {
    recordFix('Role-Group linkages', 'fail', err.message);
  }
}

async function fixAdminUser() {
  const now = new Date().toISOString();
  try {
    const ops: any[] = [];

    const techUser = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, `TECH_USER#${FIXED_IDS.ADMIN_USER}`);
    if (!techUser) {
      ops.push({
        Put: {
          Item: {
            PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, SK: `TECH_USER#${FIXED_IDS.ADMIN_USER}`,
            GSI1PK: 'ENTITY#TECH_USER', GSI1SK: `USER#${FIXED_IDS.ADMIN_USER}`,
            id: FIXED_IDS.ADMIN_USER, accountId: FIXED_IDS.ACCOUNT, enterpriseId: FIXED_IDS.ENTERPRISE,
            firstName: 'ABC', lastName: 'DEF', email: ADMIN_EMAIL,
            assignedRole: 'Platform Admin', assignedGroup: 'Platform Admin',
            startDate: now.split('T')[0], status: 'active', isTechnicalUser: true,
            createdAt: now, updatedAt: now,
          },
        },
      });
    }

    const userEntity = await getItem(`USER#${FIXED_IDS.ADMIN_USER}`, 'METADATA');
    if (!userEntity) {
      ops.push({
        Put: {
          Item: {
            PK: `USER#${FIXED_IDS.ADMIN_USER}`, SK: 'METADATA',
            GSI1PK: 'ENTITY#USER', GSI1SK: `USER#${FIXED_IDS.ADMIN_USER}`,
            GSI2PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}#USERS`, GSI2SK: `USER#${FIXED_IDS.ADMIN_USER}`,
            id: FIXED_IDS.ADMIN_USER, accountId: FIXED_IDS.ACCOUNT, enterpriseId: FIXED_IDS.ENTERPRISE,
            firstName: 'ABC', lastName: 'DEF', email: ADMIN_EMAIL,
            assignedRole: 'Platform Admin', assignedGroup: 'Platform Admin',
            startDate: now.split('T')[0], status: 'active', isTechnicalUser: true,
            createdAt: now, updatedAt: now,
          },
        },
      });
    }

    if (ops.length > 0) {
      await transactWriteItems(ops);
      recordFix('Admin user records', 'fixed');
    }

    // Fix group assignment separately (might already exist)
    const userGroup = await getItem(`USER#${FIXED_IDS.ADMIN_USER}`, `GROUP#${FIXED_IDS.PLATFORM_GROUP}`);
    if (!userGroup) {
      await putItem({
        PK: `USER#${FIXED_IDS.ADMIN_USER}`, SK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`,
        id: uuidv4(), userId: FIXED_IDS.ADMIN_USER, groupId: FIXED_IDS.PLATFORM_GROUP, createdAt: now,
      });
      recordFix('Admin → Platform Admin Group assignment', 'fixed');
    }
  } catch (err: any) {
    recordFix('Admin user', 'fail', err.message);
  }
}

async function fixWorkstreams() {
  const now = new Date().toISOString();
  try {
    // Fix Global Workstream
    const globalWorkstream = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`);
    if (!globalWorkstream) {
      await putItem({
        PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, SK: `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`,
        GSI1PK: 'ENTITY#WORKSTREAM', GSI1SK: `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`,
        GSI2PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, GSI2SK: `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`,
        id: FIXED_IDS.GLOBAL_WORKSTREAM, name: 'Global',
        accountId: FIXED_IDS.ACCOUNT, enterpriseId: FIXED_IDS.ENTERPRISE,
        createdAt: now, updatedAt: now,
      });
      recordFix('Global workstream', 'fixed');
    }

    const userGlobalWorkstream = await getItem(`USER#${FIXED_IDS.ADMIN_USER}`, `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`);
    if (!userGlobalWorkstream) {
      await putItem({
        PK: `USER#${FIXED_IDS.ADMIN_USER}`, SK: `WORKSTREAM#${FIXED_IDS.GLOBAL_WORKSTREAM}`,
        id: uuidv4(), userId: FIXED_IDS.ADMIN_USER, workstreamId: FIXED_IDS.GLOBAL_WORKSTREAM, createdAt: now,
      });
      recordFix('Admin → Global Workstream assignment', 'fixed');
    }

    // Fix Default Workstream
    const defaultWorkstream = await getItem(`ACCOUNT#${FIXED_IDS.ACCOUNT}`, `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`);
    if (!defaultWorkstream) {
      await putItem({
        PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
        GSI1PK: 'ENTITY#WORKSTREAM', GSI1SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
        GSI2PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, GSI2SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
        id: FIXED_IDS.DEFAULT_WORKSTREAM, name: 'Default',
        accountId: FIXED_IDS.ACCOUNT, enterpriseId: FIXED_IDS.ENTERPRISE,
        createdAt: now, updatedAt: now,
      });
      recordFix('Default workstream', 'fixed');
    }

    const userDefaultWorkstream = await getItem(`USER#${FIXED_IDS.ADMIN_USER}`, `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`);
    if (!userDefaultWorkstream) {
      await putItem({
        PK: `USER#${FIXED_IDS.ADMIN_USER}`, SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
        id: uuidv4(), userId: FIXED_IDS.ADMIN_USER, workstreamId: FIXED_IDS.DEFAULT_WORKSTREAM, createdAt: now,
      });
      recordFix('Admin → Default Workstream assignment', 'fixed');
    }
  } catch (err: any) {
    recordFix('Workstreams', 'fail', err.message);
  }
}

async function fixCognito() {
  if (!WITH_COGNITO || !cognitoClient || !COGNITO_USER_POOL_ID) {
    recordFix('Cognito', 'fail', 'Cognito not configured — use --with-cognito and set COGNITO_USER_POOL_ID');
    return;
  }

  // Fix PlatformAdmins group
  try {
    await cognitoClient.send(new GetGroupCommand({ GroupName: 'PlatformAdmins', UserPoolId: COGNITO_USER_POOL_ID }));
  } catch (err: any) {
    if (err.name === 'ResourceNotFoundException') {
      try {
        await cognitoClient.send(new CreateGroupCommand({
          GroupName: 'PlatformAdmins', UserPoolId: COGNITO_USER_POOL_ID,
          Description: 'Platform administrators with full access to all features', Precedence: 0,
        }));
        recordFix('PlatformAdmins Cognito group', 'fixed');
      } catch (createErr: any) {
        recordFix('PlatformAdmins Cognito group', 'fail', createErr.message);
      }
    }
  }

  // Fix admin user
  const customAttributes = [
    { Name: 'email', Value: ADMIN_EMAIL },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'given_name', Value: 'ABC' },
    { Name: 'family_name', Value: 'DEF' },
    { Name: 'custom:account_id', Value: FIXED_IDS.ACCOUNT },
    { Name: 'custom:enterprise_id', Value: FIXED_IDS.ENTERPRISE },
    { Name: 'custom:role', Value: 'super_admin' },
  ];

  let userSub: string | null = null;

  try {
    const existingUser = await cognitoClient.send(
      new AdminGetUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: ADMIN_EMAIL }),
    );
    userSub = existingUser.UserAttributes?.find((a) => a.Name === 'sub')?.Value || null;

    // Update custom attributes to ensure consistency
    await cognitoClient.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: COGNITO_USER_POOL_ID, Username: ADMIN_EMAIL,
      UserAttributes: customAttributes.filter((a) => a.Name.startsWith('custom:')),
    }));
    recordFix('Admin Cognito attributes', 'fixed');
  } catch (err: any) {
    if (err.name === 'UserNotFoundException') {
      // Create the user
      try {
        const createResult = await cognitoClient.send(new AdminCreateUserCommand({
          UserPoolId: COGNITO_USER_POOL_ID, Username: ADMIN_EMAIL,
          UserAttributes: customAttributes, MessageAction: MessageActionType.SUPPRESS,
          TemporaryPassword: ADMIN_PASSWORD,
        }));
        userSub = createResult.User?.Attributes?.find((a) => a.Name === 'sub')?.Value || null;

        // Set permanent password
        await cognitoClient.send(new AdminSetUserPasswordCommand({
          UserPoolId: COGNITO_USER_POOL_ID, Username: ADMIN_EMAIL,
          Password: ADMIN_PASSWORD, Permanent: true,
        }));
        recordFix('Admin Cognito user', 'fixed');
      } catch (createErr: any) {
        recordFix('Admin Cognito user', 'fail', createErr.message);
        return;
      }
    } else {
      recordFix('Admin Cognito user', 'fail', err.message);
      return;
    }
  }

  // Fix group membership
  try {
    await cognitoClient.send(new AdminAddUserToGroupCommand({
      UserPoolId: COGNITO_USER_POOL_ID, Username: ADMIN_EMAIL, GroupName: 'PlatformAdmins',
    }));
    recordFix('Admin → PlatformAdmins group membership', 'fixed');
  } catch (err: any) {
    recordFix('Admin → PlatformAdmins group membership', 'fail', err.message);
  }

  // Sync cognitoSub back to DynamoDB if available
  if (userSub) {
    try {
      const userEntity = await getItem(`USER#${FIXED_IDS.ADMIN_USER}`, 'METADATA');
      if (userEntity && !userEntity.cognitoSub) {
        const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
        await docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${FIXED_IDS.ADMIN_USER}`, SK: 'METADATA' },
          UpdateExpression: 'SET #cognitoSub = :sub, #updatedAt = :now',
          ExpressionAttributeNames: { '#cognitoSub': 'cognitoSub', '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: { ':sub': userSub, ':now': new Date().toISOString() },
        }));
        recordFix('DynamoDB cognitoSub backfill', 'fixed');
      }
    } catch (err: any) {
      recordFix('DynamoDB cognitoSub backfill', 'fail', err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Fix Orchestrator — maps failed categories to fix functions
// ---------------------------------------------------------------------------

const FIX_MAP: Record<string, () => Promise<void>> = {
  'Master Data': fixMasterData,
  'Global Enterprise': fixGlobalEnterprise,
  'ABC Account': fixABCAccount,
  'SSM Registration': fixSSMRegistration,
  'License': fixLicense,
  'Groups': fixGroups,
  'Roles': fixRoles,
  'Role-Group Linkage': fixRoleGroupLinkage,
  'Admin User': fixAdminUser,
  'Workstreams': fixWorkstreams,
  'Cognito': fixCognito,
};

async function runFixes(): Promise<void> {
  if (failedCategories.size === 0) return;

  if (!JSON_OUTPUT) {
    console.log('');
    console.log('  ┌──────────────────────────────────────────────────────────┐');
    console.log('  │  🔧 AUTO-FIX: Re-provisioning missing entities...        │');
    console.log('  └──────────────────────────────────────────────────────────┘');
    console.log('');
  }

  // Run fixes in dependency order
  const fixOrder = [
    'Master Data', 'Global Enterprise', 'ABC Account', 'SSM Registration',
    'License', 'Groups', 'Roles', 'Role-Group Linkage',
    'Admin User', 'Workstreams', 'Cognito',
  ];

  for (const category of fixOrder) {
    if (!failedCategories.has(category)) continue;
    const fixFn = FIX_MAP[category];
    if (!fixFn) continue;

    if (!JSON_OUTPUT) {
      console.log(`  ⚙ Fixing: ${category}...`);
    }
    await fixFn();
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printResults() {
  const allResults = [...results, ...fixResults];
  const passed = allResults.filter((r) => r.status === 'pass').length;
  const failed = allResults.filter((r) => r.status === 'fail').length;
  const warned = allResults.filter((r) => r.status === 'warn').length;
  const fixed = allResults.filter((r) => r.status === 'fixed').length;
  const total = allResults.length;

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      summary: { total, passed, failed, warnings: warned, fixed },
      fixMode: FIX_MODE,
      results: allResults,
    }, null, 2));
    return;
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Day-0 Bootstrap Verification Report               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Region:    ${AWS_REGION}`);
  console.log(`  Table:     ${TABLE_NAME}`);
  console.log(`  Cognito:   ${WITH_COGNITO ? COGNITO_USER_POOL_ID || '(missing!)' : 'skipped'}`);
  console.log(`  Fix mode:  ${FIX_MODE ? 'ENABLED' : 'disabled'}`);
  console.log('');

  // Group by category
  const categories = [...new Set(allResults.map((r) => r.category))];

  for (const category of categories) {
    const catResults = allResults.filter((r) => r.category === category);
    const catFails = catResults.filter((r) => r.status === 'fail').length;
    const catWarns = catResults.filter((r) => r.status === 'warn').length;
    const catFixed = catResults.filter((r) => r.status === 'fixed').length;

    const catIcon = catFails > 0 ? '✗' : catFixed > 0 ? '🔧' : catWarns > 0 ? '⚠' : '✓';
    const catColor = catFails > 0 ? '31' : catFixed > 0 ? '36' : catWarns > 0 ? '33' : '32';

    console.log(`  \x1b[${catColor}m${catIcon}\x1b[0m ${category}`);

    for (const result of catResults) {
      if (!VERBOSE && result.status === 'pass') continue;

      const icon =
        result.status === 'pass' ? '✓' :
        result.status === 'fail' ? '✗' :
        result.status === 'fixed' ? '🔧' : '⚠';
      const color =
        result.status === 'pass' ? '32' :
        result.status === 'fail' ? '31' :
        result.status === 'fixed' ? '36' : '33';

      console.log(`    \x1b[${color}m${icon}\x1b[0m ${result.check}`);

      if (result.expected && result.actual) {
        console.log(`      Expected: ${result.expected}`);
        console.log(`      Actual:   ${result.actual}`);
      }
      if (result.detail) {
        console.log(`      ${result.detail}`);
      }
    }
    console.log('');
  }

  // Summary
  console.log('  ══════════════════════════════════════════════════════════');
  console.log(`  Total checks: ${total}`);
  console.log(`    \x1b[32m✓ Passed:\x1b[0m  ${passed}`);
  if (fixed > 0) console.log(`    \x1b[36m🔧 Fixed:\x1b[0m   ${fixed}`);
  if (warned > 0) console.log(`    \x1b[33m⚠ Warnings:\x1b[0m ${warned}`);
  if (failed > 0) console.log(`    \x1b[31m✗ Failed:\x1b[0m  ${failed}`);
  console.log('');

  if (failed === 0 && warned === 0 && fixed === 0) {
    console.log('  \x1b[32m✅ All Day-0 bootstrap checks passed!\x1b[0m');
  } else if (failed === 0 && fixed > 0) {
    console.log('  \x1b[36m🔧 Auto-fix completed successfully! Run again without --fix to verify.\x1b[0m');
  } else if (failed === 0) {
    console.log('  \x1b[33m⚠ Bootstrap is functional but has warnings.\x1b[0m');
  } else if (FIX_MODE) {
    console.log('  \x1b[31m❌ Some fixes failed. Review errors above and retry.\x1b[0m');
  } else {
    console.log('  \x1b[31m❌ Bootstrap verification failed! Use --fix to auto-repair.\x1b[0m');
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('Error: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required.');
    process.exit(2);
  }

  const startTime = Date.now();

  // ── Phase 1: Verification ────────────────────────────────────────────
  await Promise.all([
    verifyMasterData(),
    verifyGlobalEnterprise(),
    verifyABCAccount(),
    verifySSMRegistration(),
    verifyLicense(),
    verifyGroups(),
    verifyRoles(),
    verifyRoleGroupLinkage(),
    verifyAdminUser(),
    verifyWorkstreams(),
  ]);

  await verifyCognito();

  // ── Phase 2: Auto-fix (if enabled and failures detected) ─────────────
  if (FIX_MODE && failedCategories.size > 0) {
    await runFixes();
  } else if (FIX_MODE && failedCategories.size === 0) {
    if (!JSON_OUTPUT) {
      console.log('\n  \x1b[32m✓\x1b[0m --fix specified but no failures detected. Nothing to fix.\n');
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  if (!JSON_OUTPUT) {
    results.push({
      category: 'Timing',
      check: `Verification${FIX_MODE ? ' + fix' : ''} completed in ${elapsed}s`,
      status: 'pass',
    });
  }

  printResults();

  // Exit with success if all fixes succeeded (no remaining failures in fixResults)
  const hasFixFailures = fixResults.some((r) => r.status === 'fail');
  const hasVerifyFailures = results.some((r) => r.status === 'fail');

  if (FIX_MODE) {
    process.exit(hasFixFailures ? 1 : 0);
  } else {
    process.exit(hasVerifyFailures ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(2);
});
