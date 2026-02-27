/**
 * Seed Script: Populate DynamoDB with Sample Data
 *
 * This script creates sample data in DynamoDB matching the application's
 * data model. It assumes the Day-0 bootstrap has already been run and
 * references the fixed bootstrap IDs for the ABC account context.
 *
 * Usage: npx ts-node scripts/seed-sample-data.ts
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

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || process.env.CONTROL_PLANE_TABLE_NAME;
if (!TABLE_NAME) { console.error('ERROR: DYNAMODB_TABLE_NAME or CONTROL_PLANE_TABLE_NAME must be set'); process.exit(1); }

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

async function batchWriteItems(items: Record<string, any>[]) {
  const batches: Record<string, any>[][] = [];
  for (let i = 0; i < items.length; i += 25) {
    batches.push(items.slice(i, i + 25));
  }

  for (const batch of batches) {
    const command = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: batch.map((item) => ({
          PutRequest: { Item: item },
        })),
      },
    });
    await docClient.send(command);
  }
}

// ---------------------------------------------------------------------------
// Generate Sample Data
// ---------------------------------------------------------------------------

function generateSampleData() {
  const now = new Date().toISOString();
  const items: Record<string, any>[] = [];

  // ============================================
  // PRODUCTS (additional — bootstrap already has 'Global')
  // ============================================
  const products = [
    { id: uuidv4(), name: 'Oracle Cloud', description: 'Oracle Cloud Infrastructure' },
    { id: uuidv4(), name: 'SAP S/4HANA', description: 'SAP Enterprise Resource Planning' },
    { id: uuidv4(), name: 'Salesforce', description: 'Salesforce CRM Platform' },
    { id: uuidv4(), name: 'Microsoft Azure', description: 'Microsoft Cloud Services' },
    { id: uuidv4(), name: 'AWS', description: 'Amazon Web Services' },
  ];

  products.forEach((p) => {
    items.push({
      PK: `PRODUCT#${p.id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#PRODUCT',
      GSI1SK: `PRODUCT#${p.id}`,
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: now,
    });
  });

  // ============================================
  // SERVICES (additional — bootstrap already has 'Global')
  // ============================================
  const services = [
    { id: uuidv4(), name: 'Implementation', description: 'Full implementation services' },
    { id: uuidv4(), name: 'Support', description: '24/7 technical support' },
    { id: uuidv4(), name: 'Consulting', description: 'Strategic consulting services' },
    { id: uuidv4(), name: 'Training', description: 'User training programs' },
    { id: uuidv4(), name: 'Migration', description: 'Data migration services' },
  ];

  services.forEach((s) => {
    items.push({
      PK: `SERVICE#${s.id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#SERVICE',
      GSI1SK: `SERVICE#${s.id}`,
      id: s.id,
      name: s.name,
      description: s.description,
      createdAt: now,
    });
  });

  // ============================================
  // ENTERPRISES (with Enterprise → Product → Service hierarchy)
  // ============================================
  const enterprises = [
    { id: uuidv4(), name: 'Oracle', productIndex: 0, serviceIndices: [0, 1] },
    { id: uuidv4(), name: 'SAP', productIndex: 1, serviceIndices: [0, 1, 2] },
    { id: uuidv4(), name: 'Salesforce', productIndex: 2, serviceIndices: [1, 3] },
  ];

  enterprises.forEach((e) => {
    // Enterprise metadata
    items.push({
      PK: `ENTERPRISE#${e.id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#ENTERPRISE',
      GSI1SK: `ENTERPRISE#${e.id}`,
      id: e.id,
      name: e.name,
      createdAt: now,
      updatedAt: now,
    });

    // Enterprise → Product link
    items.push({
      PK: `ENTERPRISE#${e.id}`,
      SK: `PRODUCT#${products[e.productIndex].id}`,
      enterpriseId: e.id,
      productId: products[e.productIndex].id,
      createdAt: now,
    });

    // Product → Service links (stored under Enterprise PK for query efficiency)
    e.serviceIndices.forEach((svcIdx) => {
      items.push({
        PK: `ENTERPRISE#${e.id}`,
        SK: `SERVICE#${services[svcIdx].id}`,
        enterpriseId: e.id,
        productId: products[e.productIndex].id,
        serviceId: services[svcIdx].id,
        createdAt: now,
      });
    });
  });

  // ============================================
  // ACCOUNTS (customer accounts — bootstrap already has 'ABC')
  // ============================================
  const accounts = [
    { id: uuidv4(), name: 'Acme Corporation', masterAccountName: 'Acme Master', cloudType: 'public' },
    { id: uuidv4(), name: 'TechStart Inc', masterAccountName: 'TechStart Main', cloudType: 'hybrid' },
    { id: uuidv4(), name: 'Global Finance Ltd', masterAccountName: 'GF Master Account', cloudType: 'private' },
  ];

  accounts.forEach((a, index) => {
    // Account metadata
    items.push({
      PK: `ACCOUNT#${a.id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#ACCOUNT',
      GSI1SK: `ACCOUNT#${a.id}`,
      GSI2PK: `CLOUD_TYPE#${a.cloudType.toUpperCase()}`,
      GSI2SK: `ACCOUNT#${a.id}`,
      id: a.id,
      name: a.name,
      masterAccountName: a.masterAccountName,
      cloudType: a.cloudType,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    // Account address
    const addressId = uuidv4();
    items.push({
      PK: `ACCOUNT#${a.id}`,
      SK: `ADDRESS#${addressId}`,
      id: addressId,
      accountId: a.id,
      line1: `${100 + index} Main Street`,
      line2: `Suite ${index + 1}00`,
      city: ['New York', 'San Francisco', 'Chicago'][index],
      state: ['NY', 'CA', 'IL'][index],
      postalCode: ['10001', '94102', '60601'][index],
      country: 'United States',
      createdAt: now,
    });
  });

  // ============================================
  // LICENSES (for customer accounts)
  // ============================================
  accounts.forEach((account, accountIndex) => {
    const enterprise = enterprises[accountIndex % enterprises.length];
    const product = products[enterprise.productIndex];
    const service = services[enterprise.serviceIndices[0]];
    const licenseId = uuidv4();
    const startDate = '2024-01-01';
    const endDate = '2025-12-31';

    items.push({
      PK: `ACCOUNT#${account.id}`,
      SK: `LICENSE#${licenseId}`,
      GSI1PK: 'ENTITY#LICENSE',
      GSI1SK: `LICENSE#${licenseId}`,
      GSI2PK: `ENTERPRISE#${enterprise.id}`,
      GSI2SK: `LICENSE#${licenseId}`,
      GSI3PK: 'LICENSE#STATUS#active',
      GSI3SK: `${endDate}#${licenseId}`,
      id: licenseId,
      accountId: account.id,
      enterpriseId: enterprise.id,
      productId: product.id,
      serviceId: service.id,
      startDate,
      endDate,
      numberOfUsers: 50 + accountIndex * 25,
      renewalNotify: true,
      noticeDays: 30,
      contactFullName: `John Contact ${accountIndex + 1}`,
      contactEmail: `contact${accountIndex + 1}@${account.name.toLowerCase().replace(/\s/g, '')}.com`,
      contactPhone: `+1-555-${100 + accountIndex}-0000`,
      contactDepartment: 'IT',
      contactDesignation: 'IT Manager',
      createdAt: now,
      updatedAt: now,
    });
  });

  // ============================================
  // WORKSTREAMS (Global + Default for each customer account)
  // ============================================
  const additionalWorkstreamNames = ['Development', 'Operations', 'Analytics', 'Security'];

  accounts.forEach((account, accountIndex) => {
    const enterprise = enterprises[accountIndex % enterprises.length];
    const globalWsId = uuidv4();
    const defaultWsId = uuidv4();

    // Global workstream for this account
    items.push({
      PK: `ACCOUNT#${account.id}`,
      SK: `WORKSTREAM#${globalWsId}`,
      GSI1PK: 'ENTITY#WORKSTREAM',
      GSI1SK: `WORKSTREAM#${globalWsId}`,
      GSI2PK: `ENTERPRISE#${enterprise.id}`,
      GSI2SK: `WORKSTREAM#${globalWsId}`,
      id: globalWsId,
      name: 'Global',
      accountId: account.id,
      enterpriseId: enterprise.id,
      createdAt: now,
      updatedAt: now,
    });

    // Default workstream for this account
    items.push({
      PK: `ACCOUNT#${account.id}`,
      SK: `WORKSTREAM#${defaultWsId}`,
      GSI1PK: 'ENTITY#WORKSTREAM',
      GSI1SK: `WORKSTREAM#${defaultWsId}`,
      GSI2PK: `ENTERPRISE#${enterprise.id}`,
      GSI2SK: `WORKSTREAM#${defaultWsId}`,
      id: defaultWsId,
      name: 'Default',
      accountId: account.id,
      enterpriseId: enterprise.id,
      createdAt: now,
      updatedAt: now,
    });

    // Additional workstreams per account
    additionalWorkstreamNames.slice(0, 2 + accountIndex).forEach((wsName, wsIndex) => {
      const workstreamId = uuidv4();

      items.push({
        PK: `ACCOUNT#${account.id}`,
        SK: `WORKSTREAM#${workstreamId}`,
        GSI1PK: 'ENTITY#WORKSTREAM',
        GSI1SK: `WORKSTREAM#${workstreamId}`,
        GSI2PK: `ENTERPRISE#${enterprise.id}`,
        GSI2SK: `WORKSTREAM#${workstreamId}`,
        id: workstreamId,
        name: wsName,
        accountId: account.id,
        enterpriseId: enterprise.id,
        createdAt: now,
        updatedAt: now,
      });

      // Add tools for each additional workstream
      const tools = [
        { name: 'Jenkins', category: 'CI/CD' },
        { name: 'GitHub', category: 'Version Control' },
        { name: 'Jira', category: 'Project Management' },
      ];

      tools.slice(0, 2 + (wsIndex % 2)).forEach((tool) => {
        const toolId = uuidv4();
        items.push({
          PK: `WORKSTREAM#${workstreamId}`,
          SK: `TOOL#${toolId}`,
          id: toolId,
          workstreamId: workstreamId,
          toolName: tool.name,
          category: tool.category,
          createdAt: now,
        });
      });
    });
  });

  // ============================================
  // ROLES (customer account roles — scoped to workstreams)
  // ============================================
  const customerRoles = [
    { id: uuidv4(), name: 'Account Manager', description: 'Manage account settings', fullAccess: true },
    { id: uuidv4(), name: 'Developer', description: 'Development access', fullAccess: false },
    { id: uuidv4(), name: 'Viewer Role', description: 'Read-only access', fullAccess: false },
  ];

  customerRoles.forEach((r) => {
    items.push({
      PK: `ROLE#${r.id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#ROLE',
      GSI1SK: `ROLE#${r.id}`,
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Add permissions for each role
    MENU_ITEMS.forEach((menu) => {
      items.push({
        PK: `ROLE#${r.id}`,
        SK: `PERMISSION#${menu.key}`,
        id: uuidv4(),
        roleId: r.id,
        menuKey: menu.key,
        menuLabel: menu.label,
        isVisible: true,
        canView: true,
        canCreate: r.fullAccess,
        canEdit: r.fullAccess,
        canDelete: r.fullAccess,
        tabs: getTabsForMenu(menu.key, r.fullAccess),
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  // ============================================
  // GROUPS (customer account groups)
  // Note: Bootstrap already created 'Platform Admin' and 'Technical Group'
  // ============================================
  const customerGroups = [
    { id: uuidv4(), name: 'Developers', description: 'Development team members', roleIndex: 1 },
    { id: uuidv4(), name: 'Analysts', description: 'Business analysts', roleIndex: 2 },
    { id: uuidv4(), name: 'Support Team', description: 'Customer support team', roleIndex: 2 },
  ];

  customerGroups.forEach((g) => {
    items.push({
      PK: `GROUP#${g.id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#GROUP',
      GSI1SK: `GROUP#${g.id}`,
      id: g.id,
      name: g.name,
      description: g.description,
      createdAt: now,
      updatedAt: now,
    });

    // Link group to role
    items.push({
      PK: `GROUP#${g.id}`,
      SK: `ROLE#${customerRoles[g.roleIndex].id}`,
      id: uuidv4(),
      groupId: g.id,
      roleId: customerRoles[g.roleIndex].id,
      createdAt: now,
    });
  });

  // ============================================
  // USERS (Technical Users for customer accounts)
  // Uses bootstrap group/role names for ABC account users
  // ============================================
  accounts.forEach((account, accountIndex) => {
    const enterprise = enterprises[accountIndex % enterprises.length];
    const userCount = 3 + accountIndex;

    for (let i = 0; i < userCount; i++) {
      const userId = uuidv4();
      const isActive = i < userCount - 1;
      const endDate = isActive ? '2025-12-31' : '2024-06-30';

      // Assign groups/roles: first user gets Platform Admin, rest get customer groups
      const assignedGroup = i === 0 ? 'Platform Admin' : customerGroups[i % customerGroups.length].name;
      const assignedRole = i === 0 ? 'Platform Admin' : customerRoles[i % customerRoles.length].name;

      // User entity (main record)
      items.push({
        PK: `USER#${userId}`,
        SK: 'METADATA',
        GSI1PK: 'ENTITY#USER',
        GSI1SK: `USER#${userId}`,
        GSI2PK: `ACCOUNT#${account.id}#USERS`,
        GSI2SK: `USER#${userId}`,
        GSI3PK: `USER#STATUS#${isActive ? 'active' : 'inactive'}`,
        GSI3SK: `${endDate}#${userId}`,
        id: userId,
        accountId: account.id,
        enterpriseId: enterprise.id,
        firstName: ['Alice', 'Bob', 'Carol', 'David', 'Eve'][i % 5],
        lastName: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][i % 5],
        middleName: i % 2 === 0 ? 'M.' : undefined,
        email: `user${i + 1}@${account.name.toLowerCase().replace(/\s/g, '')}.com`,
        assignedRole,
        assignedGroup,
        startDate: '2024-01-15',
        endDate,
        status: isActive ? 'active' : 'inactive',
        isTechnicalUser: i === 0,
        createdAt: now,
        updatedAt: now,
      });

      // Tech user record (under account PK)
      items.push({
        PK: `ACCOUNT#${account.id}`,
        SK: `TECH_USER#${userId}`,
        GSI1PK: 'ENTITY#TECH_USER',
        GSI1SK: `USER#${userId}`,
        id: userId,
        accountId: account.id,
        enterpriseId: enterprise.id,
        firstName: ['Alice', 'Bob', 'Carol', 'David', 'Eve'][i % 5],
        lastName: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][i % 5],
        email: `user${i + 1}@${account.name.toLowerCase().replace(/\s/g, '')}.com`,
        assignedRole,
        assignedGroup,
        startDate: '2024-01-15',
        endDate,
        status: isActive ? 'active' : 'inactive',
        isTechnicalUser: i === 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  return items;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Sample Data Seed Script                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Region:  ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`  Table:   ${TABLE_NAME}`);
  console.log('');
  console.log('  ⚠ Prerequisite: Run bootstrap-day0.ts first!');
  console.log('    Bootstrap provides: ABC account, Global enterprise/product/service,');
  console.log('    Platform Admin group/role, Technical Group/Role, Global & Default workstreams');
  console.log('');

  console.log('Generating sample data...\n');

  const items = generateSampleData();

  // Count by entity type
  console.log('Sample data generated:');
  const counts: Record<string, number> = {};
  items.forEach((item) => {
    const pk = item.PK as string;
    const sk = item.SK as string;
    let entityType: string;

    if (sk === 'METADATA') {
      entityType = pk.split('#')[0];
    } else if (sk.startsWith('PERMISSION#')) {
      entityType = 'PERMISSION';
    } else if (sk.startsWith('TOOL#')) {
      entityType = 'TOOL';
    } else if (sk.startsWith('ROLE#') && pk.startsWith('GROUP#')) {
      entityType = 'GROUP_ROLE_LINK';
    } else if (sk.startsWith('PRODUCT#') || sk.startsWith('SERVICE#')) {
      entityType = 'ENTITY_LINK';
    } else if (sk.startsWith('LICENSE#')) {
      entityType = 'LICENSE';
    } else if (sk.startsWith('ADDRESS#')) {
      entityType = 'ADDRESS';
    } else if (sk.startsWith('TECH_USER#')) {
      entityType = 'TECH_USER';
    } else if (sk.startsWith('WORKSTREAM#')) {
      entityType = 'WORKSTREAM_LINK';
    } else {
      entityType = 'OTHER';
    }
    counts[entityType] = (counts[entityType] || 0) + 1;
  });

  Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([entity, count]) => {
      console.log(`  • ${entity}: ${count}`);
    });

  console.log(`\nWriting ${items.length} items to DynamoDB (${Math.ceil(items.length / 25)} batches)...`);
  const startTime = Date.now();
  await batchWriteItems(items);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n✅ Seed complete in ${elapsed}s!`);
  console.log(`   Total items created: ${items.length}`);
  console.log('');
}

// Run seed
seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
