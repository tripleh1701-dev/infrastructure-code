#!/usr/bin/env npx ts-node
/**
 * backfill-ssm-params.ts
 *
 * Scans all accounts in the control-plane DynamoDB table and ensures that
 * the SSM parameters required by DynamoDBRouterService exist for each one
 * and contain the correct values.
 *
 * Required SSM parameters per account:
 *   /accounts/{id}/cloud-type          → 'public' | 'private'
 *   /accounts/{id}/dynamodb/table-name → target DynamoDB table name
 *   /accounts/{id}/provisioning-status → 'active'
 *
 * Usage:
 *   npx ts-node scripts/backfill-ssm-params.ts [--dry-run] [--json] [--fix]
 *
 * Flags:
 *   --dry-run   Show what would be changed without making changes
 *   --json      Output results as JSON
 *   --fix       Also correct existing parameters with wrong values
 *               (e.g. table-name pointing to control-plane instead of data-plane)
 *
 * Environment variables:
 *   DYNAMODB_TABLE_NAME / CONTROL_PLANE_TABLE_NAME  — control-plane table
 *   PUBLIC_ACCOUNT_TABLE_NAME / DATA_PLANE_TABLE_NAME — customer table for public accounts (default: account-admin-public-{NODE_ENV})
 *   NODE_ENV                                        — environment name (default: prod)
 *   AWS_REGION                                      — AWS region (default: us-east-1)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';

// ── Configuration ──────────────────────────────────────────────────────────────
const region = process.env.AWS_REGION || 'us-east-1';
const controlPlaneTable =
  process.env.CONTROL_PLANE_TABLE_NAME ||
  process.env.DYNAMODB_TABLE_NAME;

if (!controlPlaneTable) {
  console.error('ERROR: CONTROL_PLANE_TABLE_NAME or DYNAMODB_TABLE_NAME must be set');
  process.exit(1);
}

const environment = process.env.NODE_ENV || 'prod';
const publicAccountTable =
  process.env.PUBLIC_ACCOUNT_TABLE_NAME || process.env.DATA_PLANE_TABLE_NAME || `account-admin-public-${environment}`;

const dryRun = process.argv.includes('--dry-run');
const jsonOutput = process.argv.includes('--json');
const fixWrongValues = process.argv.includes('--fix');

// ── AWS Clients ────────────────────────────────────────────────────────────────
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});
const ssmClient = new SSMClient({ region });

// ── Types ──────────────────────────────────────────────────────────────────────
interface AccountRecord {
  id: string;
  name: string;
  cloudType: string;
}

type ParamStatus = 'ok' | 'created' | 'fixed' | 'wrong-value' | 'dry-run-create' | 'dry-run-fix';

interface ParamResult {
  name: string;
  status: ParamStatus;
  currentValue?: string;
  expectedValue?: string;
}

interface BackfillResult {
  accountId: string;
  accountName: string;
  cloudType: string;
  params: ParamResult[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getParamValue(name: string): Promise<string | null> {
  try {
    const result = await ssmClient.send(new GetParameterCommand({ Name: name }));
    return result.Parameter?.Value ?? null;
  } catch (err: any) {
    if (err.name === 'ParameterNotFound') return null;
    throw err;
  }
}

async function ensureParam(
  name: string,
  expectedValue: string,
  description: string,
): Promise<ParamResult> {
  const currentValue = await getParamValue(name);

  // Parameter doesn't exist — create it
  if (currentValue === null) {
    if (dryRun) return { name, status: 'dry-run-create', expectedValue };

    await ssmClient.send(
      new PutParameterCommand({
        Name: name,
        Value: expectedValue,
        Type: 'String',
        Overwrite: true,
        Description: description,
      }),
    );
    return { name, status: 'created' };
  }

  // Parameter exists with correct value
  if (currentValue === expectedValue) {
    return { name, status: 'ok' };
  }

  // Parameter exists with WRONG value
  if (!fixWrongValues) {
    return { name, status: 'wrong-value', currentValue, expectedValue };
  }

  if (dryRun) {
    return { name, status: 'dry-run-fix', currentValue, expectedValue };
  }

  await ssmClient.send(
    new PutParameterCommand({
      Name: name,
      Value: expectedValue,
      Type: 'String',
      Overwrite: true,
      Description: `${description} (corrected by backfill)`,
    }),
  );
  return { name, status: 'fixed', currentValue, expectedValue };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function getAllAccounts(): Promise<AccountRecord[]> {
  const accounts: AccountRecord[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: controlPlaneTable,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': 'ENTITY#ACCOUNT' },
        ExclusiveStartKey: lastKey,
      }),
    );

    for (const item of result.Items || []) {
      accounts.push({
        id: item.id,
        name: item.name || item.id,
        cloudType: item.cloudType || 'public',
      });
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return accounts;
}

async function backfillAccount(account: AccountRecord): Promise<BackfillResult> {
  const tableName =
    account.cloudType === 'private'
      ? `app-${process.env.NODE_ENV || 'staging'}-account-${account.id}`
      : publicAccountTable;

  const params: ParamResult[] = [];

  // 1. cloud-type
  params.push(await ensureParam(
    `/accounts/${account.id}/cloud-type`,
    account.cloudType,
    `Cloud type for account ${account.id} (${account.name})`,
  ));

  // 2. dynamodb/table-name
  params.push(await ensureParam(
    `/accounts/${account.id}/dynamodb/table-name`,
    tableName,
    `DynamoDB table for account ${account.id} (${account.name})`,
  ));

  // 3. provisioning-status
  params.push(await ensureParam(
    `/accounts/${account.id}/provisioning-status`,
    'active',
    `Provisioning status for account ${account.id}`,
  ));

  return {
    accountId: account.id,
    accountName: account.name,
    cloudType: account.cloudType,
    params,
  };
}

async function main() {
  if (!jsonOutput) {
    console.log('=== SSM Parameter Backfill ===');
    console.log(`Control-plane table : ${controlPlaneTable}`);
    console.log(`Public account table: ${publicAccountTable}`);
    console.log(`Dry run             : ${dryRun}`);
    console.log(`Fix wrong values    : ${fixWrongValues}`);
    console.log('');
  }

  const accounts = await getAllAccounts();
  if (!jsonOutput) console.log(`Found ${accounts.length} account(s)\n`);

  const results: BackfillResult[] = [];
  let created = 0;
  let fixed = 0;
  let wrongValues = 0;
  let ok = 0;

  for (const account of accounts) {
    const result = await backfillAccount(account);
    results.push(result);

    for (const p of result.params) {
      if (p.status === 'ok') ok++;
      else if (p.status === 'created' || p.status === 'dry-run-create') created++;
      else if (p.status === 'fixed' || p.status === 'dry-run-fix') fixed++;
      else if (p.status === 'wrong-value') wrongValues++;
    }

    if (!jsonOutput) {
      const flags = result.params
        .map((p) => {
          if (p.status === 'wrong-value' || p.status === 'fixed' || p.status === 'dry-run-fix') {
            return `${p.name}: ${p.status} ("${p.currentValue}" → "${p.expectedValue}")`;
          }
          return `${p.name}: ${p.status}`;
        })
        .join(', ');
      console.log(`  ${account.id} (${account.name}, ${account.cloudType}) → ${flags}`);
    }
  }

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          summary: {
            totalAccounts: accounts.length,
            paramsOk: ok,
            paramsCreated: created,
            paramsFixed: fixed,
            paramsWrongValue: wrongValues,
            dryRun,
            fixWrongValues,
          },
          results,
        },
        null,
        2,
      ),
    );
  } else {
    console.log('');
    console.log(`✅ Done:`);
    console.log(`   ${ok} param(s) already correct`);
    console.log(`   ${created} param(s) ${dryRun ? 'would be created' : 'created'}`);
    console.log(`   ${fixed} param(s) ${dryRun ? 'would be fixed' : 'fixed'}`);
    if (wrongValues > 0) {
      console.log(`   ⚠️  ${wrongValues} param(s) have WRONG values — re-run with --fix to correct them`);
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
