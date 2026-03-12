/**
 * Seed Script: Populate DynamoDB with Comprehensive Sample Data
 *
 * Creates sample data across ALL entity types in both control-plane and
 * data-plane DynamoDB tables for regression testing.
 *
 * All seeded items include a `smoke_test_seed: true` marker for cleanup.
 *
 * Usage: npx ts-node -P tsconfig.scripts.json scripts/seed-sample-data.ts
 *
 * Environment Variables:
 *   CONTROL_PLANE_TABLE_NAME / DYNAMODB_TABLE_NAME — control-plane table
 *   DATA_PLANE_TABLE_NAME — (optional) data-plane table for connectors/credentials/etc
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.migration' });
dotenv.config({ path: '.env' });

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function resolveCredentials() {
  // In Lambda / CI (OIDC), do NOT provide explicit credentials — use default chain
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.CI) {
    return undefined;
  }
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
    };
  }
  return undefined;
}

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: resolveCredentials(),
});

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true },
});

const CP_TABLE = process.env.DYNAMODB_TABLE_NAME || process.env.CONTROL_PLANE_TABLE_NAME;
if (!CP_TABLE) { console.error('ERROR: DYNAMODB_TABLE_NAME or CONTROL_PLANE_TABLE_NAME must be set'); process.exit(1); }

const DP_TABLE = process.env.DATA_PLANE_TABLE_NAME || '';

// ---------------------------------------------------------------------------
// Fixed UUIDs from bootstrap-day0.ts (for cross-referencing)
// ---------------------------------------------------------------------------

const BOOTSTRAP_IDS = {
  ACCOUNT: 'a0000000-0000-0000-0000-000000000001',
  ENTERPRISE: '00000000-0000-0000-0000-000000000001',
  PRODUCT: '00000000-0000-0000-0000-000000000002',
  SERVICE: '00000000-0000-0000-0000-000000000003',
  PLATFORM_GROUP: 'b0000000-0000-0000-0000-000000000001',
  PLATFORM_ROLE: 'c0000000-0000-0000-0000-000000000001',
  TECHNICAL_GROUP: 'b0000000-0000-0000-0000-000000000002',
  TECHNICAL_ROLE: 'c0000000-0000-0000-0000-000000000002',
  GLOBAL_WORKSTREAM: 'e0000000-0000-0000-0000-000000000001',
  DEFAULT_WORKSTREAM: 'e0000000-0000-0000-0000-000000000002',
};

// Deterministic smoke-test UUIDs for predictable cleanup
const SMOKE_IDS = {
  ACCOUNT_1: 'smoke-a01-0000-0000-000000000001',
  ACCOUNT_2: 'smoke-a02-0000-0000-000000000002',
  ACCOUNT_3: 'smoke-a03-0000-0000-000000000003',
  ENTERPRISE_1: 'smoke-e01-0000-0000-000000000001',
  ENTERPRISE_2: 'smoke-e02-0000-0000-000000000002',
  ENTERPRISE_3: 'smoke-e03-0000-0000-000000000003',
};

// ---------------------------------------------------------------------------
// Menu/Permission structures (must match bootstrap-day0.ts)
// ---------------------------------------------------------------------------

const MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'overview', label: 'Overview' },
  { key: 'account-settings', label: 'Account Settings' },
  { key: 'access-control', label: 'Access Control' },
  { key: 'security', label: 'Security & Governance' },
  { key: 'pipelines', label: 'Pipelines' },
  { key: 'builds', label: 'Builds' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'monitoring', label: 'Monitoring' },
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
// Batch Write Helper
// ---------------------------------------------------------------------------

async function batchWriteItems(tableName: string, items: Record<string, any>[]) {
  if (!tableName || items.length === 0) return;

  const batches: Record<string, any>[][] = [];
  for (let i = 0; i < items.length; i += 25) {
    batches.push(items.slice(i, i + 25));
  }

  for (const batch of batches) {
    const command = new BatchWriteCommand({
      RequestItems: {
        [tableName]: batch.map((item) => ({
          PutRequest: { Item: item },
        })),
      },
    });
    await docClient.send(command);
  }
}

// ---------------------------------------------------------------------------
// Marker function — adds smoke_test_seed flag to every item
// ---------------------------------------------------------------------------
function mark(item: Record<string, any>): Record<string, any> {
  return { ...item, smoke_test_seed: true };
}

// ---------------------------------------------------------------------------
// Generate Control-Plane Data
// ---------------------------------------------------------------------------

function generateControlPlaneData() {
  const now = new Date().toISOString();
  const items: Record<string, any>[] = [];

  // ============================================
  // PRODUCTS (additional)
  // ============================================
  const products = [
    { id: uuidv4(), name: 'smoke-test Oracle Cloud', description: 'Oracle Cloud Infrastructure' },
    { id: uuidv4(), name: 'smoke-test SAP S/4HANA', description: 'SAP Enterprise Resource Planning' },
    { id: uuidv4(), name: 'smoke-test Salesforce', description: 'Salesforce CRM Platform' },
    { id: uuidv4(), name: 'smoke-test Microsoft Azure', description: 'Microsoft Cloud Services' },
    { id: uuidv4(), name: 'smoke-test AWS', description: 'Amazon Web Services' },
  ];

  products.forEach((p) => {
    items.push(mark({
      PK: `PRODUCT#${p.id}`, SK: 'METADATA',
      GSI1PK: 'ENTITY#PRODUCT', GSI1SK: `PRODUCT#${p.id}`,
      id: p.id, name: p.name, description: p.description, createdAt: now,
    }));
  });

  // ============================================
  // SERVICES (additional)
  // ============================================
  const services = [
    { id: uuidv4(), name: 'smoke-test Implementation', description: 'Full implementation services' },
    { id: uuidv4(), name: 'smoke-test Support', description: '24/7 technical support' },
    { id: uuidv4(), name: 'smoke-test Consulting', description: 'Strategic consulting services' },
    { id: uuidv4(), name: 'smoke-test Training', description: 'User training programs' },
    { id: uuidv4(), name: 'smoke-test Migration', description: 'Data migration services' },
  ];

  services.forEach((s) => {
    items.push(mark({
      PK: `SERVICE#${s.id}`, SK: 'METADATA',
      GSI1PK: 'ENTITY#SERVICE', GSI1SK: `SERVICE#${s.id}`,
      id: s.id, name: s.name, description: s.description, createdAt: now,
    }));
  });

  // ============================================
  // ENTERPRISES
  // ============================================
  const enterprises = [
    { id: SMOKE_IDS.ENTERPRISE_1, name: 'smoke-test Oracle Ent', productIndex: 0, serviceIndices: [0, 1] },
    { id: SMOKE_IDS.ENTERPRISE_2, name: 'smoke-test SAP Ent', productIndex: 1, serviceIndices: [0, 1, 2] },
    { id: SMOKE_IDS.ENTERPRISE_3, name: 'smoke-test SF Ent', productIndex: 2, serviceIndices: [1, 3] },
  ];

  enterprises.forEach((e) => {
    items.push(mark({
      PK: `ENTERPRISE#${e.id}`, SK: 'METADATA',
      GSI1PK: 'ENTITY#ENTERPRISE', GSI1SK: `ENTERPRISE#${e.id}`,
      id: e.id, name: e.name, createdAt: now, updatedAt: now,
    }));

    items.push(mark({
      PK: `ENTERPRISE#${e.id}`, SK: `PRODUCT#${products[e.productIndex].id}`,
      enterpriseId: e.id, productId: products[e.productIndex].id, createdAt: now,
    }));

    e.serviceIndices.forEach((svcIdx) => {
      items.push(mark({
        PK: `ENTERPRISE#${e.id}`, SK: `SERVICE#${services[svcIdx].id}`,
        enterpriseId: e.id, productId: products[e.productIndex].id,
        serviceId: services[svcIdx].id, createdAt: now,
      }));
    });
  });

  // ============================================
  // ACCOUNTS
  // ============================================
  const accounts = [
    { id: SMOKE_IDS.ACCOUNT_1, name: 'smoke-test Acme Corp', masterAccountName: 'smoke-test Acme Master', cloudType: 'public' },
    { id: SMOKE_IDS.ACCOUNT_2, name: 'smoke-test TechStart', masterAccountName: 'smoke-test TechStart Main', cloudType: 'private' },
    { id: SMOKE_IDS.ACCOUNT_3, name: 'smoke-test GlobalFin', masterAccountName: 'smoke-test GF Master', cloudType: 'private' },
  ];

  accounts.forEach((a, index) => {
    items.push(mark({
      PK: `ACCOUNT#${a.id}`, SK: 'METADATA',
      GSI1PK: 'ENTITY#ACCOUNT', GSI1SK: `ACCOUNT#${a.id}`,
      GSI2PK: `CLOUD_TYPE#${a.cloudType.toUpperCase()}`, GSI2SK: `ACCOUNT#${a.id}`,
      id: a.id, name: a.name, masterAccountName: a.masterAccountName,
      cloudType: a.cloudType, status: 'active', createdAt: now, updatedAt: now,
    }));

    // Address
    const addressId = uuidv4();
    items.push(mark({
      PK: `ACCOUNT#${a.id}`, SK: `ADDRESS#${addressId}`,
      id: addressId, accountId: a.id,
      line1: `${100 + index} Smoke Test Blvd`, line2: `Suite ${index + 1}00`,
      city: ['New York', 'San Francisco', 'Chicago'][index],
      state: ['NY', 'CA', 'IL'][index],
      postalCode: ['10001', '94102', '60601'][index],
      country: 'United States', createdAt: now,
    }));
  });

  // ============================================
  // LICENSES (for each account)
  // ============================================
  accounts.forEach((account, accountIndex) => {
    const enterprise = enterprises[accountIndex % enterprises.length];
    const product = products[enterprise.productIndex];
    const service = services[enterprise.serviceIndices[0]];

    // Active license
    const activeLicenseId = uuidv4();
    const futureEnd = '2027-12-31';
    items.push(mark({
      PK: `ACCOUNT#${account.id}`, SK: `LICENSE#${activeLicenseId}`,
      GSI1PK: 'ENTITY#LICENSE', GSI1SK: `LICENSE#${activeLicenseId}`,
      GSI2PK: `ENTERPRISE#${enterprise.id}`, GSI2SK: `LICENSE#${activeLicenseId}`,
      GSI3PK: 'LICENSE#STATUS#active', GSI3SK: `${futureEnd}#${activeLicenseId}`,
      id: activeLicenseId, accountId: account.id, enterpriseId: enterprise.id,
      productId: product.id, serviceId: service.id,
      startDate: '2024-01-01', endDate: futureEnd,
      numberOfUsers: 50 + accountIndex * 25, renewalNotify: true, noticeDays: 30,
      contactFullName: `smoke-test Contact ${accountIndex + 1}`,
      contactEmail: `smoke-contact${accountIndex + 1}@example.com`,
      contactPhone: `+1-555-${100 + accountIndex}-0000`,
      contactDepartment: 'IT', contactDesignation: 'IT Manager',
      createdAt: now, updatedAt: now,
    }));

    // Expired license (for testing expiry widgets)
    const expiredLicenseId = uuidv4();
    const pastEnd = '2025-01-15';
    items.push(mark({
      PK: `ACCOUNT#${account.id}`, SK: `LICENSE#${expiredLicenseId}`,
      GSI1PK: 'ENTITY#LICENSE', GSI1SK: `LICENSE#${expiredLicenseId}`,
      GSI2PK: `ENTERPRISE#${enterprise.id}`, GSI2SK: `LICENSE#${expiredLicenseId}`,
      GSI3PK: 'LICENSE#STATUS#active', GSI3SK: `${pastEnd}#${expiredLicenseId}`,
      id: expiredLicenseId, accountId: account.id, enterpriseId: enterprise.id,
      productId: product.id, serviceId: service.id,
      startDate: '2023-01-01', endDate: pastEnd,
      numberOfUsers: 10, renewalNotify: true, noticeDays: 30,
      contactFullName: `smoke-test Expired Contact ${accountIndex + 1}`,
      contactEmail: `smoke-expired${accountIndex + 1}@example.com`,
      createdAt: now, updatedAt: now,
    }));
  });

  // ============================================
  // WORKSTREAMS
  // ============================================
  const workstreamsByAccount: Record<string, { id: string; name: string }[]> = {};
  accounts.forEach((account, accountIndex) => {
    const enterprise = enterprises[accountIndex % enterprises.length];
    const wsList: { id: string; name: string }[] = [];

    ['Global', 'Default', 'smoke-test Dev', 'smoke-test Ops'].forEach((wsName) => {
      const wsId = uuidv4();
      wsList.push({ id: wsId, name: wsName });
      items.push(mark({
        PK: `ACCOUNT#${account.id}`, SK: `WORKSTREAM#${wsId}`,
        GSI1PK: 'ENTITY#WORKSTREAM', GSI1SK: `WORKSTREAM#${wsId}`,
        GSI2PK: `ENTERPRISE#${enterprise.id}`, GSI2SK: `WORKSTREAM#${wsId}`,
        id: wsId, name: wsName, accountId: account.id, enterpriseId: enterprise.id,
        createdAt: now, updatedAt: now,
      }));

      // Tools for non-standard workstreams
      if (wsName.startsWith('smoke-test')) {
        [{ name: 'Jenkins', category: 'CI/CD' }, { name: 'GitHub', category: 'Version Control' }].forEach((tool) => {
          const toolId = uuidv4();
          items.push(mark({
            PK: `WORKSTREAM#${wsId}`, SK: `TOOL#${toolId}`,
            id: toolId, workstreamId: wsId, toolName: tool.name, category: tool.category, createdAt: now,
          }));
        });
      }
    });
    workstreamsByAccount[account.id] = wsList;
  });

  // ============================================
  // ROLES
  // ============================================
  const customerRoles = [
    { id: uuidv4(), name: 'smoke-test Manager', description: 'Manage account settings', fullAccess: true },
    { id: uuidv4(), name: 'smoke-test Developer', description: 'Development access', fullAccess: false },
    { id: uuidv4(), name: 'smoke-test Viewer', description: 'Read-only access', fullAccess: false },
  ];

  customerRoles.forEach((r) => {
    items.push(mark({
      PK: `ROLE#${r.id}`, SK: 'METADATA',
      GSI1PK: 'ENTITY#ROLE', GSI1SK: `ROLE#${r.id}`,
      id: r.id, name: r.name, description: r.description, permissions: 0,
      createdAt: now, updatedAt: now,
    }));

    MENU_ITEMS.forEach((menu) => {
      items.push(mark({
        PK: `ROLE#${r.id}`, SK: `PERMISSION#${menu.key}`,
        id: uuidv4(), roleId: r.id, menuKey: menu.key, menuLabel: menu.label,
        isVisible: true, canView: true,
        canCreate: r.fullAccess, canEdit: r.fullAccess, canDelete: r.fullAccess,
        tabs: getTabsForMenu(menu.key, r.fullAccess),
        createdAt: now, updatedAt: now,
      }));
    });
  });

  // ============================================
  // GROUPS
  // ============================================
  const customerGroups = [
    { id: uuidv4(), name: 'smoke-test Developers', description: 'Dev team', roleIndex: 1 },
    { id: uuidv4(), name: 'smoke-test Analysts', description: 'Business analysts', roleIndex: 2 },
    { id: uuidv4(), name: 'smoke-test Support', description: 'Support team', roleIndex: 2 },
  ];

  customerGroups.forEach((g) => {
    items.push(mark({
      PK: `GROUP#${g.id}`, SK: 'METADATA',
      GSI1PK: 'ENTITY#GROUP', GSI1SK: `GROUP#${g.id}`,
      id: g.id, name: g.name, description: g.description, createdAt: now, updatedAt: now,
    }));

    items.push(mark({
      PK: `GROUP#${g.id}`, SK: `ROLE#${customerRoles[g.roleIndex].id}`,
      id: uuidv4(), groupId: g.id, roleId: customerRoles[g.roleIndex].id, createdAt: now,
    }));
  });

  // ============================================
  // USERS (Technical Users)
  // ============================================
  accounts.forEach((account, accountIndex) => {
    const enterprise = enterprises[accountIndex % enterprises.length];
    const userCount = 3 + accountIndex;

    for (let i = 0; i < userCount; i++) {
      const userId = uuidv4();
      const isActive = i < userCount - 1;
      const endDate = isActive ? '2027-12-31' : '2024-06-30';

      const assignedGroup = i === 0 ? 'Platform Admin' : customerGroups[i % customerGroups.length].name;
      const assignedRole = i === 0 ? 'Platform Admin' : customerRoles[i % customerRoles.length].name;

      // USER entity
      items.push(mark({
        PK: `USER#${userId}`, SK: 'METADATA',
        GSI1PK: 'ENTITY#USER', GSI1SK: `USER#${userId}`,
        GSI2PK: `ACCOUNT#${account.id}#USERS`, GSI2SK: `USER#${userId}`,
        GSI3PK: `USER#STATUS#${isActive ? 'active' : 'inactive'}`,
        GSI3SK: `${endDate}#${userId}`,
        id: userId, accountId: account.id, enterpriseId: enterprise.id,
        firstName: ['Alice', 'Bob', 'Carol', 'David', 'Eve'][i % 5],
        lastName: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][i % 5],
        middleName: i % 2 === 0 ? 'M.' : undefined,
        email: `smoke-user${i + 1}@${account.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        assignedRole, assignedGroup,
        startDate: '2024-01-15', endDate,
        status: isActive ? 'active' : 'inactive',
        isTechnicalUser: i === 0, createdAt: now, updatedAt: now,
      }));

      // TECH_USER record (under account PK for GSI2 queries)
      items.push(mark({
        PK: `ACCOUNT#${account.id}`, SK: `TECH_USER#${userId}`,
        GSI1PK: 'ENTITY#TECH_USER', GSI1SK: `USER#${userId}`,
        id: userId, accountId: account.id, enterpriseId: enterprise.id,
        firstName: ['Alice', 'Bob', 'Carol', 'David', 'Eve'][i % 5],
        lastName: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][i % 5],
        email: `smoke-user${i + 1}@${account.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        assignedRole, assignedGroup,
        startDate: '2024-01-15', endDate,
        status: isActive ? 'active' : 'inactive',
        isTechnicalUser: i === 0, createdAt: now, updatedAt: now,
      }));
    }
  });

  return { items, accounts, enterprises, products, services, workstreamsByAccount };
}

// ---------------------------------------------------------------------------
// Generate Data-Plane Data (Connectors, Credentials, Environments, Pipelines, Builds)
// ---------------------------------------------------------------------------

function generateDataPlaneData(
  accounts: { id: string; name: string }[],
  enterprises: { id: string; name: string; productIndex: number; serviceIndices: number[] }[],
  products: { id: string; name: string }[],
  services: { id: string; name: string }[],
  workstreamsByAccount: Record<string, { id: string; name: string }[]>,
) {
  const now = new Date().toISOString();
  const items: Record<string, any>[] = [];

  accounts.forEach((account, accountIndex) => {
    const enterprise = enterprises[accountIndex % enterprises.length];
    const workstreams = workstreamsByAccount[account.id] || [];

    // ── Credentials ──────────────────────────────────────────
    const credentials = [
      { id: uuidv4(), name: 'smoke-test Jenkins Token', connector: 'Jenkins', authType: 'token', category: 'CI/CD', expiresInDays: -10 },
      { id: uuidv4(), name: 'smoke-test GitHub PAT', connector: 'GitHub', authType: 'pat', category: 'Version Control', expiresInDays: 20 },
      { id: uuidv4(), name: 'smoke-test SAP CPI Basic', connector: 'SAP CPI', authType: 'basic', category: 'Integration', expiresInDays: 90 },
    ];

    credentials.forEach((cred) => {
      const expiresAt = new Date(Date.now() + cred.expiresInDays * 86400000).toISOString();
      items.push(mark({
        PK: `ACCOUNT#${account.id}`, SK: `CREDENTIAL#${cred.id}`,
        GSI1PK: 'ENTITY#CREDENTIAL', GSI1SK: `CREDENTIAL#${cred.id}`,
        GSI2PK: `ENTERPRISE#${enterprise.id}`, GSI2SK: `CREDENTIAL#${cred.id}`,
        id: cred.id, accountId: account.id, enterpriseId: enterprise.id,
        name: cred.name, connector: cred.connector, authType: cred.authType,
        category: cred.category, status: 'active',
        expiresAt, expiryNotify: true, expiryNoticeDays: 30,
        createdAt: now, updatedAt: now,
      }));
    });

    // ── Connectors ───────────────────────────────────────────
    const connectors = [
      { id: uuidv4(), name: 'smoke-test Jenkins CI', connectorType: 'CI/CD', connectorTool: 'Jenkins', category: 'Build', credentialId: credentials[0].id },
      { id: uuidv4(), name: 'smoke-test GitHub SCM', connectorType: 'SCM', connectorTool: 'GitHub', category: 'Source', credentialId: credentials[1].id },
      { id: uuidv4(), name: 'smoke-test SAP CPI', connectorType: 'iPaaS', connectorTool: 'SAP CPI', category: 'Integration', credentialId: credentials[2].id },
    ];

    connectors.forEach((conn) => {
      items.push(mark({
        PK: `ACCOUNT#${account.id}`, SK: `CONNECTOR#${conn.id}`,
        GSI1PK: 'ENTITY#CONNECTOR', GSI1SK: `CONNECTOR#${conn.id}`,
        GSI2PK: `ENTERPRISE#${enterprise.id}`, GSI2SK: `CONNECTOR#${conn.id}`,
        id: conn.id, accountId: account.id, enterpriseId: enterprise.id,
        name: conn.name, connectorType: conn.connectorType, connectorTool: conn.connectorTool,
        category: conn.category, credentialId: conn.credentialId,
        status: 'connected', health: 'healthy', syncCount: 0,
        createdAt: now, updatedAt: now,
      }));
    });

    // ── Environments ─────────────────────────────────────────
    const environments = [
      { id: uuidv4(), name: 'smoke-test DEV', description: 'Development environment' },
      { id: uuidv4(), name: 'smoke-test QA', description: 'QA testing environment' },
      { id: uuidv4(), name: 'smoke-test PROD', description: 'Production environment' },
    ];

    environments.forEach((env) => {
      items.push(mark({
        PK: `ACCOUNT#${account.id}`, SK: `ENVIRONMENT#${env.id}`,
        GSI1PK: 'ENTITY#ENVIRONMENT', GSI1SK: `ENVIRONMENT#${env.id}`,
        GSI2PK: `ENTERPRISE#${enterprise.id}`, GSI2SK: `ENVIRONMENT#${env.id}`,
        id: env.id, accountId: account.id, enterpriseId: enterprise.id,
        name: env.name, description: env.description,
        connectivityStatus: 'unknown', connectors: [],
        createdAt: now, updatedAt: now,
      }));
    });

    // ── Pipelines ────────────────────────────────────────────
    const pipelines = [
      { id: uuidv4(), name: 'smoke-test Integration Pipeline', status: 'active', deploymentType: 'Integration' },
      { id: uuidv4(), name: 'smoke-test Deploy Pipeline', status: 'draft', deploymentType: 'Deployment' },
    ];

    pipelines.forEach((pl) => {
      items.push(mark({
        PK: `ACCOUNT#${account.id}`, SK: `PIPELINE#${pl.id}`,
        GSI1PK: 'ENTITY#PIPELINE', GSI1SK: `PIPELINE#${pl.id}`,
        GSI2PK: `ENTERPRISE#${enterprise.id}`, GSI2SK: `PIPELINE#${pl.id}`,
        id: pl.id, accountId: account.id, enterpriseId: enterprise.id,
        name: pl.name, status: pl.status, deploymentType: pl.deploymentType,
        nodes: [], edges: [], createdAt: now, updatedAt: now,
      }));
    });

    // ── Build Jobs ───────────────────────────────────────────
    const buildJobs = [
      { id: uuidv4(), connectorName: 'smoke-test Jenkins CI', product: 'DevOps', service: 'Integration', status: 'ACTIVE', pipelineId: pipelines[0].id },
    ];

    buildJobs.forEach((bj) => {
      items.push(mark({
        PK: `ACCOUNT#${account.id}`, SK: `BUILD_JOB#${bj.id}`,
        GSI1PK: 'ENTITY#BUILD_JOB', GSI1SK: `BUILD_JOB#${bj.id}`,
        GSI2PK: `ENTERPRISE#${enterprise.id}`, GSI2SK: `BUILD_JOB#${bj.id}`,
        id: bj.id, accountId: account.id, enterpriseId: enterprise.id,
        connectorName: bj.connectorName, product: bj.product, service: bj.service,
        status: bj.status, pipeline: pipelines[0].name,
        pipelineStagesState: {}, selectedArtifacts: [],
        createdAt: now, updatedAt: now,
      }));

      // One execution per build job
      const execId = uuidv4();
      items.push(mark({
        PK: `BUILD_JOB#${bj.id}`, SK: `EXECUTION#${execId}`,
        GSI1PK: 'ENTITY#EXECUTION', GSI1SK: `EXECUTION#${execId}`,
        id: execId, buildJobId: bj.id,
        buildNumber: 'smoke-1', status: 'success',
        branch: 'main', duration: '2m 30s',
        timestamp: now, createdAt: now,
      }));
    });
  });

  return items;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Comprehensive Sample Data Seed Script                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Region:           ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`  Control-Plane:    ${CP_TABLE}`);
  console.log(`  Data-Plane:       ${DP_TABLE || '(not configured)'}`);
  console.log('');
  console.log('  ⚠ Prerequisite: Run bootstrap-day0.ts first!');
  console.log('  All items tagged with smoke_test_seed=true for cleanup.');
  console.log('');

  // Generate data
  const { items: cpItems, accounts, enterprises, products, services, workstreamsByAccount } = generateControlPlaneData();
  const dpItems = generateDataPlaneData(accounts, enterprises, products, services, workstreamsByAccount);

  // Count items by entity
  function countEntities(items: Record<string, any>[]) {
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      const pk = item.PK as string;
      const sk = item.SK as string;
      let entityType: string;
      if (sk === 'METADATA') entityType = pk.split('#')[0];
      else if (sk.startsWith('PERMISSION#')) entityType = 'PERMISSION';
      else if (sk.startsWith('TOOL#')) entityType = 'TOOL';
      else if (sk.startsWith('ROLE#') && pk.startsWith('GROUP#')) entityType = 'GROUP_ROLE_LINK';
      else if (sk.startsWith('PRODUCT#') || sk.startsWith('SERVICE#')) entityType = 'ENTITY_LINK';
      else entityType = sk.split('#')[0];
      counts[entityType] = (counts[entityType] || 0) + 1;
    });
    return counts;
  }

  console.log('── Control-Plane Data ──');
  const cpCounts = countEntities(cpItems);
  Object.entries(cpCounts).sort(([a], [b]) => a.localeCompare(b)).forEach(([entity, count]) => {
    console.log(`  • ${entity}: ${count}`);
  });
  console.log(`  Total: ${cpItems.length}`);

  console.log('');
  console.log('── Data-Plane Data ──');
  const dpCounts = countEntities(dpItems);
  Object.entries(dpCounts).sort(([a], [b]) => a.localeCompare(b)).forEach(([entity, count]) => {
    console.log(`  • ${entity}: ${count}`);
  });
  console.log(`  Total: ${dpItems.length}`);

  // Write control-plane
  console.log(`\nWriting ${cpItems.length} items to control-plane (${Math.ceil(cpItems.length / 25)} batches)...`);
  let startTime = Date.now();
  await batchWriteItems(CP_TABLE, cpItems);
  console.log(`  ✅ Control-plane seeded in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

  // Write data-plane (if configured)
  if (DP_TABLE) {
    console.log(`\nWriting ${dpItems.length} items to data-plane (${Math.ceil(dpItems.length / 25)} batches)...`);
    startTime = Date.now();
    await batchWriteItems(DP_TABLE, dpItems);
    console.log(`  ✅ Data-plane seeded in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  } else {
    // Write data-plane items to control-plane too (for single-table setups)
    console.log(`\nNo DATA_PLANE_TABLE_NAME set — writing data-plane items to control-plane table...`);
    startTime = Date.now();
    await batchWriteItems(CP_TABLE, dpItems);
    console.log(`  ✅ Data-plane items written to control-plane in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  }

  console.log(`\n✅ Seed complete! Total items: ${cpItems.length + dpItems.length}`);
  console.log('');
}

// Run seed
seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
