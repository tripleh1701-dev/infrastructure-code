/**
 * Full Migration Script: Supabase → DynamoDB
 * 
 * This script reads all data from your Supabase database and migrates it
 * to DynamoDB using the single-table design pattern.
 * 
 * Usage: npx ts-node scripts/migrate-from-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.migration' });

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// DynamoDB client
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

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'app_data';

// Batch write helper (DynamoDB limit: 25 items per batch)
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

// Transform functions for each entity type

function transformAccount(account: any): Record<string, any> {
  return {
    PK: `ACCOUNT#${account.id}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#ACCOUNT',
    GSI1SK: `ACCOUNT#${account.id}`,
    id: account.id,
    name: account.name,
    masterAccountName: account.master_account_name,
    cloudType: account.cloud_type,
    status: account.status,
    createdAt: account.created_at,
    updatedAt: account.updated_at,
  };
}

function transformAccountAddress(address: any): Record<string, any> {
  return {
    PK: `ACCOUNT#${address.account_id}`,
    SK: `ADDRESS#${address.id}`,
    id: address.id,
    accountId: address.account_id,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postal_code,
    country: address.country,
    createdAt: address.created_at,
  };
}

function transformTechnicalUser(user: any): Record<string, any> {
  return {
    PK: `USER#${user.id}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#USER',
    GSI1SK: `USER#${user.id}`,
    GSI2PK: `ACCOUNT#${user.account_id}#USERS`,
    GSI2SK: `USER#${user.id}`,
    GSI3PK: `USER#STATUS#${user.status}`,
    GSI3SK: `${user.end_date || '9999-12-31'}#${user.id}`,
    id: user.id,
    accountId: user.account_id,
    enterpriseId: user.enterprise_id,
    firstName: user.first_name,
    lastName: user.last_name,
    middleName: user.middle_name,
    email: user.email,
    assignedRole: user.assigned_role,
    assignedGroup: user.assigned_group,
    startDate: user.start_date,
    endDate: user.end_date,
    status: user.status,
    isTechnicalUser: user.is_technical_user,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function transformLicense(license: any): Record<string, any> {
  return {
    PK: `ACCOUNT#${license.account_id}`,
    SK: `LICENSE#${license.id}`,
    GSI1PK: 'ENTITY#LICENSE',
    GSI1SK: `LICENSE#${license.id}`,
    GSI2PK: `ENTERPRISE#${license.enterprise_id}`,
    GSI2SK: `LICENSE#${license.id}`,
    GSI3PK: 'LICENSE#STATUS#active', // You may want to calculate this based on end_date
    GSI3SK: `${license.end_date}#${license.id}`,
    id: license.id,
    accountId: license.account_id,
    enterpriseId: license.enterprise_id,
    productId: license.product_id,
    serviceId: license.service_id,
    startDate: license.start_date,
    endDate: license.end_date,
    numberOfUsers: license.number_of_users,
    renewalNotify: license.renewal_notify,
    noticeDays: license.notice_days,
    contactFullName: license.contact_full_name,
    contactEmail: license.contact_email,
    contactPhone: license.contact_phone,
    contactDepartment: license.contact_department,
    contactDesignation: license.contact_designation,
    createdAt: license.created_at,
    updatedAt: license.updated_at,
  };
}

function transformEnterprise(enterprise: any): Record<string, any> {
  return {
    PK: `ENTERPRISE#${enterprise.id}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#ENTERPRISE',
    GSI1SK: `ENTERPRISE#${enterprise.id}`,
    id: enterprise.id,
    name: enterprise.name,
    createdAt: enterprise.created_at,
    updatedAt: enterprise.updated_at,
  };
}

function transformEnterpriseProduct(ep: any): Record<string, any> {
  return {
    PK: `ENTERPRISE#${ep.enterprise_id}`,
    SK: `PRODUCT#${ep.product_id}`,
    id: ep.id,
    enterpriseId: ep.enterprise_id,
    productId: ep.product_id,
    createdAt: ep.created_at,
  };
}

function transformEnterpriseService(es: any): Record<string, any> {
  return {
    PK: `ENTERPRISE#${es.enterprise_id}`,
    SK: `SERVICE#${es.service_id}`,
    id: es.id,
    enterpriseId: es.enterprise_id,
    serviceId: es.service_id,
    createdAt: es.created_at,
  };
}

function transformWorkstream(ws: any): Record<string, any> {
  return {
    PK: `ACCOUNT#${ws.account_id}`,
    SK: `WORKSTREAM#${ws.id}`,
    GSI1PK: 'ENTITY#WORKSTREAM',
    GSI1SK: `WORKSTREAM#${ws.id}`,
    GSI2PK: `ENTERPRISE#${ws.enterprise_id}`,
    GSI2SK: `WORKSTREAM#${ws.id}`,
    id: ws.id,
    name: ws.name,
    accountId: ws.account_id,
    enterpriseId: ws.enterprise_id,
    createdAt: ws.created_at,
    updatedAt: ws.updated_at,
  };
}

function transformWorkstreamTool(tool: any): Record<string, any> {
  return {
    PK: `WORKSTREAM#${tool.workstream_id}`,
    SK: `TOOL#${tool.id}`,
    id: tool.id,
    workstreamId: tool.workstream_id,
    toolName: tool.tool_name,
    category: tool.category,
    createdAt: tool.created_at,
  };
}

function transformUserWorkstream(uw: any): Record<string, any> {
  return {
    PK: `USER#${uw.user_id}`,
    SK: `WORKSTREAM#${uw.workstream_id}`,
    id: uw.id,
    userId: uw.user_id,
    workstreamId: uw.workstream_id,
    createdAt: uw.created_at,
  };
}

function transformRole(role: any): Record<string, any> {
  return {
    PK: `ROLE#${role.id}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#ROLE',
    GSI1SK: `ROLE#${role.id}`,
    GSI2PK: role.account_id ? `ACCOUNT#${role.account_id}#ROLES` : undefined,
    GSI2SK: role.account_id ? `ROLE#${role.id}` : undefined,
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    accountId: role.account_id,
    enterpriseId: role.enterprise_id,
    productId: role.product_id,
    serviceId: role.service_id,
    workstreamId: role.workstream_id,
    createdAt: role.created_at,
    updatedAt: role.updated_at,
  };
}

function transformRolePermission(perm: any): Record<string, any> {
  return {
    PK: `ROLE#${perm.role_id}`,
    SK: `PERMISSION#${perm.menu_key}`,
    id: perm.id,
    roleId: perm.role_id,
    menuKey: perm.menu_key,
    menuLabel: perm.menu_label,
    isVisible: perm.is_visible,
    canView: perm.can_view,
    canCreate: perm.can_create,
    canEdit: perm.can_edit,
    canDelete: perm.can_delete,
    tabs: perm.tabs,
    createdAt: perm.created_at,
    updatedAt: perm.updated_at,
  };
}

function transformGroup(group: any): Record<string, any> {
  return {
    PK: `GROUP#${group.id}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#GROUP',
    GSI1SK: `GROUP#${group.id}`,
    id: group.id,
    name: group.name,
    description: group.description,
    createdAt: group.created_at,
    updatedAt: group.updated_at,
  };
}

function transformProduct(product: any): Record<string, any> {
  return {
    PK: `PRODUCT#${product.id}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#PRODUCT',
    GSI1SK: `PRODUCT#${product.id}`,
    id: product.id,
    name: product.name,
    description: product.description,
    createdAt: product.created_at,
  };
}

function transformService(service: any): Record<string, any> {
  return {
    PK: `SERVICE#${service.id}`,
    SK: 'METADATA',
    GSI1PK: 'ENTITY#SERVICE',
    GSI1SK: `SERVICE#${service.id}`,
    id: service.id,
    name: service.name,
    description: service.description,
    createdAt: service.created_at,
  };
}

// Main migration function
async function migrate() {
  console.log('Starting migration from Supabase to DynamoDB...\n');
  const allItems: Record<string, any>[] = [];

  // 1. Migrate Products
  console.log('Fetching products...');
  const { data: products } = await supabase.from('products').select('*');
  if (products) {
    products.forEach((p) => allItems.push(transformProduct(p)));
    console.log(`  ✓ ${products.length} products`);
  }

  // 2. Migrate Services
  console.log('Fetching services...');
  const { data: services } = await supabase.from('services').select('*');
  if (services) {
    services.forEach((s) => allItems.push(transformService(s)));
    console.log(`  ✓ ${services.length} services`);
  }

  // 3. Migrate Groups
  console.log('Fetching groups...');
  const { data: groups } = await supabase.from('groups').select('*');
  if (groups) {
    groups.forEach((g) => allItems.push(transformGroup(g)));
    console.log(`  ✓ ${groups.length} groups`);
  }

  // 4. Migrate Accounts
  console.log('Fetching accounts...');
  const { data: accounts } = await supabase.from('accounts').select('*');
  if (accounts) {
    accounts.forEach((a) => allItems.push(transformAccount(a)));
    console.log(`  ✓ ${accounts.length} accounts`);
  }

  // 5. Migrate Account Addresses
  console.log('Fetching account addresses...');
  const { data: addresses } = await supabase.from('account_addresses').select('*');
  if (addresses) {
    addresses.forEach((a) => allItems.push(transformAccountAddress(a)));
    console.log(`  ✓ ${addresses.length} addresses`);
  }

  // 6. Migrate Enterprises
  console.log('Fetching enterprises...');
  const { data: enterprises } = await supabase.from('enterprises').select('*');
  if (enterprises) {
    enterprises.forEach((e) => allItems.push(transformEnterprise(e)));
    console.log(`  ✓ ${enterprises.length} enterprises`);
  }

  // 7. Migrate Enterprise Products
  console.log('Fetching enterprise products...');
  const { data: enterpriseProducts } = await supabase.from('enterprise_products').select('*');
  if (enterpriseProducts) {
    enterpriseProducts.forEach((ep) => allItems.push(transformEnterpriseProduct(ep)));
    console.log(`  ✓ ${enterpriseProducts.length} enterprise products`);
  }

  // 8. Migrate Enterprise Services
  console.log('Fetching enterprise services...');
  const { data: enterpriseServices } = await supabase.from('enterprise_services').select('*');
  if (enterpriseServices) {
    enterpriseServices.forEach((es) => allItems.push(transformEnterpriseService(es)));
    console.log(`  ✓ ${enterpriseServices.length} enterprise services`);
  }

  // 9. Migrate Technical Users
  console.log('Fetching technical users...');
  const { data: technicalUsers } = await supabase.from('account_technical_users').select('*');
  if (technicalUsers) {
    technicalUsers.forEach((u) => allItems.push(transformTechnicalUser(u)));
    console.log(`  ✓ ${technicalUsers.length} technical users`);
  }

  // 10. Migrate Licenses
  console.log('Fetching licenses...');
  const { data: licenses } = await supabase.from('account_licenses').select('*');
  if (licenses) {
    licenses.forEach((l) => allItems.push(transformLicense(l)));
    console.log(`  ✓ ${licenses.length} licenses`);
  }

  // 11. Migrate Workstreams
  console.log('Fetching workstreams...');
  const { data: workstreams } = await supabase.from('workstreams').select('*');
  if (workstreams) {
    workstreams.forEach((w) => allItems.push(transformWorkstream(w)));
    console.log(`  ✓ ${workstreams.length} workstreams`);
  }

  // 12. Migrate Workstream Tools
  console.log('Fetching workstream tools...');
  const { data: tools } = await supabase.from('workstream_tools').select('*');
  if (tools) {
    tools.forEach((t) => allItems.push(transformWorkstreamTool(t)));
    console.log(`  ✓ ${tools.length} workstream tools`);
  }

  // 13. Migrate User Workstreams
  console.log('Fetching user workstreams...');
  const { data: userWorkstreams } = await supabase.from('user_workstreams').select('*');
  if (userWorkstreams) {
    userWorkstreams.forEach((uw) => allItems.push(transformUserWorkstream(uw)));
    console.log(`  ✓ ${userWorkstreams.length} user workstreams`);
  }

  // 14. Migrate Roles
  console.log('Fetching roles...');
  const { data: roles } = await supabase.from('roles').select('*');
  if (roles) {
    roles.forEach((r) => allItems.push(transformRole(r)));
    console.log(`  ✓ ${roles.length} roles`);
  }

  // 15. Migrate Role Permissions
  console.log('Fetching role permissions...');
  const { data: rolePermissions } = await supabase.from('role_permissions').select('*');
  if (rolePermissions) {
    rolePermissions.forEach((rp) => allItems.push(transformRolePermission(rp)));
    console.log(`  ✓ ${rolePermissions.length} role permissions`);
  }

  // Write all items to DynamoDB
  console.log(`\nWriting ${allItems.length} items to DynamoDB...`);
  await batchWriteItems(allItems);

  console.log('\n✅ Migration complete!');
  console.log(`   Total items migrated: ${allItems.length}`);
}

// Run migration
migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
