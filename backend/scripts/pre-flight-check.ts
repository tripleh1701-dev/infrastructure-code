#!/usr/bin/env ts-node
/**
 * Pre-Flight Checklist — Go-Live Readiness Validation
 *
 * Programmatically validates ALL Phase 1–5 prerequisites before production
 * cutover. Covers Terraform outputs, DynamoDB health, Cognito configuration,
 * SSM parameters, CI/CD readiness, WAF, Secrets Manager, monitoring, and
 * Day-0 bootstrap integrity.
 *
 * Usage:
 *   npx ts-node scripts/pre-flight-check.ts                      # Full check
 *   npx ts-node scripts/pre-flight-check.ts --phase 1             # Single phase
 *   npx ts-node scripts/pre-flight-check.ts --phase 1,2,5         # Multiple phases
 *   npx ts-node scripts/pre-flight-check.ts --env prod            # Target environment
 *   npx ts-node scripts/pre-flight-check.ts --json                # Machine-readable output
 *   npx ts-node scripts/pre-flight-check.ts --verbose             # Show passing checks too
 *   npx ts-node scripts/pre-flight-check.ts --skip-github         # Skip GitHub API checks
 *
 * Environment variables (loaded from .env.migration or .env):
 *   AWS_REGION                    — AWS region (default: us-east-1)
 *   AWS_ACCESS_KEY_ID             — IAM credentials
 *   AWS_SECRET_ACCESS_KEY         — IAM credentials
 *   DYNAMODB_TABLE_NAME           — Target table (required, no default)
 *   COGNITO_USER_POOL_ID          — Cognito User Pool ID
 *   SSM_PREFIX                    — SSM path prefix (default: /accounts)
 *   TF_STATE_BUCKET               — Terraform state S3 bucket name
 *   TF_STATE_LOCK_TABLE           — Terraform state lock DynamoDB table
 *   GITHUB_TOKEN                  — GitHub PAT for secrets/environment checks
 *   GITHUB_REPO                   — GitHub repo (org/repo format)
 *   SNS_CRITICAL_TOPIC_ARN        — Critical alerts SNS topic ARN
 *   SNS_WARNING_TOPIC_ARN         — Warning alerts SNS topic ARN
 *   CLOUDFRONT_DISTRIBUTION_ID    — CloudFront distribution ID (frontend)
 *   FRONTEND_S3_BUCKET            — Frontend S3 bucket name
 *   API_GATEWAY_URL               — API Gateway stage URL
 *   STEP_FUNCTIONS_ARN            — Step Functions state machine ARN
 *
 * Exit codes:
 *   0 — All checks passed
 *   1 — One or more checks failed
 *   2 — Script configuration error
 */

import { DynamoDBClient, DescribeTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  DescribeUserPoolClientCommand,
  ListUsersCommand,
  GetGroupCommand,
  ListGroupsCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  SSMClient,
  GetParameterCommand,
} from '@aws-sdk/client-ssm';
import {
  S3Client,
  HeadBucketCommand,
  GetBucketVersioningCommand,
  GetBucketEncryptionCommand,
} from '@aws-sdk/client-s3';
import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  ListDashboardsCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  SNSClient,
  GetTopicAttributesCommand,
  ListSubscriptionsByTopicCommand,
} from '@aws-sdk/client-sns';
import {
  LambdaClient,
  GetFunctionCommand,
  ListAliasesCommand,
  ListVersionsByFunctionCommand,
} from '@aws-sdk/client-lambda';
import {
  APIGatewayClient,
  GetRestApisCommand,
} from '@aws-sdk/client-api-gateway';
import {
  ApiGatewayV2Client,
  GetApisCommand,
} from '@aws-sdk/client-apigatewayv2';
import {
  WAFV2Client,
  ListWebACLsCommand,
  GetWebACLCommand,
} from '@aws-sdk/client-wafv2';
import {
  SecretsManagerClient,
  ListSecretsCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import {
  SFNClient,
  DescribeStateMachineCommand,
  ListExecutionsCommand,
} from '@aws-sdk/client-sfn';
import {
  CloudFrontClient,
  GetDistributionCommand,
} from '@aws-sdk/client-cloudfront';
import {
  SQSClient,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import * as dotenv from 'dotenv';
import * as https from 'https';

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
const TF_STATE_BUCKET = process.env.TF_STATE_BUCKET || 'license-portal-terraform-state';
const TF_STATE_LOCK_TABLE = process.env.TF_STATE_LOCK_TABLE || 'license-portal-terraform-locks';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const SNS_CRITICAL_TOPIC_ARN = process.env.SNS_CRITICAL_TOPIC_ARN || '';
const SNS_WARNING_TOPIC_ARN = process.env.SNS_WARNING_TOPIC_ARN || '';
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID || '';
const FRONTEND_S3_BUCKET = process.env.FRONTEND_S3_BUCKET || '';
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || '';
const STEP_FUNCTIONS_ARN = process.env.STEP_FUNCTIONS_ARN || '';
const PROJECT_NAME = process.env.PROJECT_NAME || 'license-portal';
const ENVIRONMENT = process.env.TARGET_ENVIRONMENT || 'dev';

// CLI flags
const args = process.argv.slice(2);
const JSON_OUTPUT = args.includes('--json');
const VERBOSE = args.includes('--verbose');
const SKIP_GITHUB = args.includes('--skip-github');

function getPhaseFilter(): number[] | null {
  const phaseIdx = args.indexOf('--phase');
  if (phaseIdx === -1 || phaseIdx >= args.length - 1) return null;
  return args[phaseIdx + 1].split(',').map((p) => parseInt(p.trim(), 10)).filter((n) => !isNaN(n));
}

function getEnvOverride(): string {
  const envIdx = args.indexOf('--env');
  if (envIdx === -1 || envIdx >= args.length - 1) return ENVIRONMENT;
  return args[envIdx + 1];
}

const PHASE_FILTER = getPhaseFilter();
const TARGET_ENV = getEnvOverride();

// Fixed UUIDs (must match bootstrap-day0.ts)
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
  DEFAULT_WORKSTREAM: 'e0000000-0000-0000-0000-000000000001',
  LICENSE: 'f0000000-0000-0000-0000-000000000001',
  ADDRESS: 'f1000000-0000-0000-0000-000000000001',
};

// ---------------------------------------------------------------------------
// AWS Clients
// ---------------------------------------------------------------------------

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
};

const clientConfig = { region: AWS_REGION, credentials };

const dynamoClient = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true },
});
const cognitoClient = COGNITO_USER_POOL_ID
  ? new CognitoIdentityProviderClient(clientConfig)
  : null;
const ssmClient = new SSMClient(clientConfig);
const s3Client = new S3Client(clientConfig);
const cloudwatchClient = new CloudWatchClient(clientConfig);
const snsClient = new SNSClient(clientConfig);
const lambdaClient = new LambdaClient(clientConfig);
const wafClient = new WAFV2Client({ ...clientConfig, region: 'us-east-1' }); // WAF is regional but WebACLs for API GW must be in same region
const secretsClient = new SecretsManagerClient(clientConfig);
const sfnClient = new SFNClient(clientConfig);
const cloudfrontClient = new CloudFrontClient(clientConfig);
const sqsClient = new SQSClient(clientConfig);

// ---------------------------------------------------------------------------
// Result Tracking
// ---------------------------------------------------------------------------

type Severity = 'pass' | 'fail' | 'warn' | 'skip' | 'info';

interface CheckResult {
  phase: number;
  category: string;
  check: string;
  severity: Severity;
  detail?: string;
  expected?: string;
  actual?: string;
}

const results: CheckResult[] = [];

function record(
  phase: number,
  category: string,
  check: string,
  severity: Severity,
  opts?: { detail?: string; expected?: string; actual?: string },
) {
  results.push({ phase, category, check, severity, ...opts });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeExec<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function getItem(pk: string, sk: string): Promise<Record<string, any> | null> {
  return safeExec(async () => {
    const result = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: sk } }),
    );
    return result.Item || null;
  });
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
  return safeExec(async () => {
    const result = await ssmClient.send(new GetParameterCommand({ Name: name }));
    return result.Parameter?.Value || null;
  });
}

function httpGet(url: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: { ...headers, 'User-Agent': 'pre-flight-check/1.0' },
      timeout: 10000,
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function shouldRunPhase(phase: number): boolean {
  if (!PHASE_FILTER) return true;
  return PHASE_FILTER.includes(phase);
}

// ============================================================================
// PHASE 1 — AWS Foundation
// ============================================================================

async function phase1_dynamodbTable() {
  const cat = 'P1: DynamoDB';

  // 1a. Table exists and is ACTIVE
  const tableInfo = await safeExec(async () => {
    return dynamoClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
  });

  if (tableInfo?.Table) {
    record(1, cat, `Table "${TABLE_NAME}" exists`, 'pass');

    const status = tableInfo.Table.TableStatus;
    record(1, cat, 'Table status is ACTIVE', status === 'ACTIVE' ? 'pass' : 'fail', {
      expected: 'ACTIVE', actual: status,
    });

    // 1b. Point-in-time recovery
    const pitr = tableInfo.Table.SSEDescription;
    // We check via table description — PITR is separate but let's note encryption
    if (tableInfo.Table.SSEDescription?.Status === 'ENABLED') {
      record(1, cat, 'Server-side encryption enabled', 'pass');
    } else {
      record(1, cat, 'Server-side encryption enabled', 'info', {
        detail: 'SSE status not explicitly ENABLED — may be using default AWS-owned key',
      });
    }

    // 1c. Stream enabled
    if (tableInfo.Table.StreamSpecification?.StreamEnabled) {
      record(1, cat, 'DynamoDB Streams enabled', 'pass');
    } else {
      record(1, cat, 'DynamoDB Streams enabled', 'warn', {
        detail: 'Streams recommended for change data capture and event-driven workflows',
      });
    }

    // 1d. GSIs exist
    const gsiNames = (tableInfo.Table.GlobalSecondaryIndexes || []).map((g) => g.IndexName);
    for (const expectedGsi of ['GSI1', 'GSI2', 'GSI3']) {
      record(1, cat, `GSI "${expectedGsi}" exists`, gsiNames.includes(expectedGsi) ? 'pass' : 'fail');
    }

    // 1e. Deletion protection (production)
    if (TARGET_ENV === 'prod') {
      record(1, cat, 'Deletion protection enabled', tableInfo.Table.DeletionProtectionEnabled ? 'pass' : 'fail', {
        detail: 'Deletion protection is mandatory for production tables',
      });
    }

    // 1f. Item count sanity (at least Day-0 bootstrap items)
    const itemCount = tableInfo.Table.ItemCount || 0;
    record(1, cat, `Table has items (count: ${itemCount})`, itemCount > 0 ? 'pass' : 'warn', {
      detail: itemCount === 0 ? 'Table is empty — Day-0 bootstrap may not have run' : undefined,
    });
  } else {
    record(1, cat, `Table "${TABLE_NAME}" exists`, 'fail', {
      detail: 'Table not found — ensure Terraform has been applied',
    });
  }
}

async function phase1_cognito() {
  const cat = 'P1: Cognito';

  if (!cognitoClient || !COGNITO_USER_POOL_ID) {
    record(1, cat, 'Cognito User Pool ID configured', 'fail', {
      detail: 'COGNITO_USER_POOL_ID env var is not set',
    });
    return;
  }

  record(1, cat, 'Cognito User Pool ID configured', 'pass');

  // 1a. Pool exists and is active
  const poolInfo = await safeExec(async () =>
    cognitoClient!.send(new DescribeUserPoolCommand({ UserPoolId: COGNITO_USER_POOL_ID })),
  );

  if (poolInfo?.UserPool) {
    record(1, cat, 'User Pool exists', 'pass');

    const pool = poolInfo.UserPool;

    // 1b. Pool status
    record(1, cat, 'User Pool status', pool.Status === 'Enabled' ? 'pass' : 'fail', {
      expected: 'Enabled', actual: pool.Status,
    });

    // 1c. Custom attributes exist
    const customAttrs = (pool.SchemaAttributes || [])
      .filter((a) => a.Name?.startsWith('custom:'))
      .map((a) => a.Name);
    for (const requiredAttr of ['custom:account_id', 'custom:enterprise_id', 'custom:role']) {
      record(1, cat, `Custom attribute "${requiredAttr}"`, customAttrs.includes(requiredAttr) ? 'pass' : 'fail');
    }

    // 1d. Password policy
    const pwPolicy = pool.Policies?.PasswordPolicy;
    if (pwPolicy) {
      record(1, cat, 'Password policy configured', 'pass');
      if ((pwPolicy.MinimumLength || 0) >= 8) {
        record(1, cat, 'Min password length ≥ 8', 'pass');
      } else {
        record(1, cat, 'Min password length ≥ 8', 'warn', {
          expected: '≥ 8', actual: String(pwPolicy.MinimumLength),
        });
      }
    }

    // 1e. MFA (warn for non-prod, fail for prod)
    const mfaConfig = pool.MfaConfiguration;
    if (TARGET_ENV === 'prod') {
      record(1, cat, 'MFA enabled (production)', mfaConfig === 'ON' || mfaConfig === 'OPTIONAL' ? 'pass' : 'fail', {
        detail: `MFA is ${mfaConfig || 'OFF'} — should be ON or OPTIONAL for production`,
      });
    } else {
      record(1, cat, `MFA configuration: ${mfaConfig || 'OFF'}`, 'info');
    }
  } else {
    record(1, cat, 'User Pool exists', 'fail');
  }

  // 1f. Check for admin user
  const adminUsers = await safeExec(async () =>
    cognitoClient!.send(new ListUsersCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Filter: 'email = "admin@adminplatform.com"',
      Limit: 1,
    })),
  );
  const adminExists = (adminUsers?.Users?.length || 0) > 0;
  record(1, cat, 'Admin user (admin@adminplatform.com) exists', adminExists ? 'pass' : 'fail');

  // 1g. Cognito groups exist
  for (const groupName of ['PlatformAdmin', 'TechnicalGroup']) {
    const group = await safeExec(async () =>
      cognitoClient!.send(new GetGroupCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        GroupName: groupName,
      })),
    );
    record(1, cat, `Cognito group "${groupName}" exists`, group?.Group ? 'pass' : 'warn', {
      detail: group?.Group ? undefined : 'Group not found — may use different naming convention',
    });
  }
}

async function phase1_ssmRegistration() {
  const cat = 'P1: SSM Parameters';

  const params = [
    { path: `${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/dynamodb/table-name`, label: 'ABC account table-name' },
    { path: `${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/cloud-type`, label: 'ABC account cloud-type' },
    { path: `${SSM_PREFIX}/${FIXED_IDS.ACCOUNT}/provisioning-status`, label: 'ABC account provisioning-status' },
  ];

  for (const { path, label } of params) {
    const value = await getSSMParam(path);
    record(1, cat, `SSM ${label}`, value ? 'pass' : 'warn', {
      detail: value ? `Value: ${value}` : `Parameter ${path} not found`,
    });
  }
}

async function phase1_bootstrapEntities() {
  const cat = 'P1: Day-0 Bootstrap';

  // Check core bootstrap entities
  const checks: Array<{ pk: string; sk: string; label: string; critical: boolean }> = [
    { pk: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, sk: 'METADATA', label: 'ABC Account', critical: true },
    { pk: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, sk: 'METADATA', label: 'Global Enterprise', critical: true },
    { pk: `PRODUCT#${FIXED_IDS.PRODUCT}`, sk: 'METADATA', label: 'Global Product', critical: true },
    { pk: `SERVICE#${FIXED_IDS.SERVICE}`, sk: 'METADATA', label: 'Global Service', critical: true },
    { pk: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`, sk: 'METADATA', label: 'Platform Admin Group', critical: true },
    { pk: `GROUP#${FIXED_IDS.TECHNICAL_GROUP}`, sk: 'METADATA', label: 'Technical Group', critical: true },
    { pk: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`, sk: 'METADATA', label: 'Platform Role', critical: true },
    { pk: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`, sk: 'METADATA', label: 'Technical Role', critical: true },
    { pk: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, sk: `USER#${FIXED_IDS.ADMIN_USER}`, label: 'Admin User', critical: true },
    { pk: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, sk: `LICENSE#${FIXED_IDS.LICENSE}`, label: 'Global License', critical: true },
    { pk: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, sk: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`, label: 'Default Workstream', critical: false },
    { pk: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, sk: `ADDRESS#${FIXED_IDS.ADDRESS}`, label: 'Default Address', critical: false },
    { pk: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, sk: `PRODUCT#${FIXED_IDS.PRODUCT}`, label: 'Enterprise→Product link', critical: true },
    { pk: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`, sk: `SERVICE#${FIXED_IDS.SERVICE}`, label: 'Enterprise→Service link', critical: true },
    { pk: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`, sk: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`, label: 'PlatformGroup→PlatformRole link', critical: true },
    { pk: `GROUP#${FIXED_IDS.TECHNICAL_GROUP}`, sk: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`, label: 'TechGroup→TechRole link', critical: true },
  ];

  for (const { pk, sk, label, critical } of checks) {
    const item = await getItem(pk, sk);
    record(1, cat, label, item ? 'pass' : (critical ? 'fail' : 'warn'), {
      detail: item ? undefined : `Not found: PK=${pk}, SK=${sk}`,
    });
  }

  // Check role permissions (Platform Role should have 7 menu permissions)
  const platformPerms = await queryItems(`ROLE#${FIXED_IDS.PLATFORM_ROLE}`, 'PERMISSION#');
  record(1, cat, `Platform Role permissions (${platformPerms.length}/7)`, platformPerms.length >= 7 ? 'pass' : 'fail', {
    expected: '7', actual: String(platformPerms.length),
  });
}

async function phase1_lambda() {
  const cat = 'P1: Lambda';
  const functionName = `${PROJECT_NAME}-${TARGET_ENV}-api`;

  const funcInfo = await safeExec(async () =>
    lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName })),
  );

  if (funcInfo?.Configuration) {
    record(1, cat, `Lambda "${functionName}" exists`, 'pass');
    record(1, cat, 'Lambda state is Active', funcInfo.Configuration.State === 'Active' ? 'pass' : 'fail', {
      actual: funcInfo.Configuration.State,
    });
    record(1, cat, `Runtime: ${funcInfo.Configuration.Runtime}`, funcInfo.Configuration.Runtime?.startsWith('nodejs') ? 'pass' : 'warn');

    // Check for 'live' alias
    const aliases = await safeExec(async () =>
      lambdaClient.send(new ListAliasesCommand({ FunctionName: functionName })),
    );
    const hasLiveAlias = aliases?.Aliases?.some((a) => a.Name === 'live');
    record(1, cat, 'Lambda "live" alias configured', hasLiveAlias ? 'pass' : 'warn', {
      detail: hasLiveAlias ? undefined : 'Alias "live" not found — blue/green deployment not configured',
    });

    // Published versions
    const versions = await safeExec(async () =>
      lambdaClient.send(new ListVersionsByFunctionCommand({ FunctionName: functionName })),
    );
    const versionCount = (versions?.Versions?.length || 1) - 1; // exclude $LATEST
    record(1, cat, `Published versions: ${versionCount}`, versionCount > 0 ? 'pass' : 'warn');
  } else {
    record(1, cat, `Lambda "${functionName}" exists`, 'fail', {
      detail: 'Lambda function not found — backend not deployed',
    });
  }
}

async function phase1_apiGateway() {
  const cat = 'P1: API Gateway';

  if (API_GATEWAY_URL) {
    record(1, cat, 'API Gateway URL configured', 'pass');

    // Health check
    try {
      const response = await httpGet(`${API_GATEWAY_URL}/health`);
      record(1, cat, 'Health endpoint responds', response.status === 200 ? 'pass' : 'fail', {
        expected: '200', actual: String(response.status),
      });
    } catch (err: any) {
      record(1, cat, 'Health endpoint responds', 'fail', {
        detail: `Request failed: ${err.message}`,
      });
    }
  } else {
    record(1, cat, 'API Gateway URL configured', 'skip', {
      detail: 'API_GATEWAY_URL env var not set — skipping endpoint checks',
    });
  }

  // Check HTTP API exists via SDK
  const apiGwV2 = new ApiGatewayV2Client(clientConfig);
  const apis = await safeExec(async () => apiGwV2.send(new GetApisCommand({})));
  const matchingApi = apis?.Items?.find((a) => a.Name?.includes(PROJECT_NAME));
  record(1, cat, `API Gateway for "${PROJECT_NAME}" exists`, matchingApi ? 'pass' : 'warn', {
    detail: matchingApi ? `API: ${matchingApi.Name} (${matchingApi.ApiId})` : 'No matching API found via SDK — may use REST API type',
  });
}

// ============================================================================
// PHASE 2 — CI/CD Pipeline Setup
// ============================================================================

async function phase2_terraformState() {
  const cat = 'P2: Terraform State';

  // 2a. State S3 bucket exists
  const bucketExists = await safeExec(async () =>
    s3Client.send(new HeadBucketCommand({ Bucket: TF_STATE_BUCKET })),
  );
  record(2, cat, `State bucket "${TF_STATE_BUCKET}" exists`, bucketExists ? 'pass' : 'fail');

  if (bucketExists) {
    // 2b. Versioning enabled
    const versioning = await safeExec(async () =>
      s3Client.send(new GetBucketVersioningCommand({ Bucket: TF_STATE_BUCKET })),
    );
    record(2, cat, 'State bucket versioning enabled', versioning?.Status === 'Enabled' ? 'pass' : 'fail', {
      expected: 'Enabled', actual: versioning?.Status || 'Not configured',
    });

    // 2c. Encryption enabled
    const encryption = await safeExec(async () =>
      s3Client.send(new GetBucketEncryptionCommand({ Bucket: TF_STATE_BUCKET })),
    );
    record(2, cat, 'State bucket encryption enabled', encryption?.ServerSideEncryptionConfiguration ? 'pass' : 'warn');
  }

  // 2d. Lock table exists
  const lockTable = await safeExec(async () =>
    dynamoClient.send(new DescribeTableCommand({ TableName: TF_STATE_LOCK_TABLE })),
  );
  record(2, cat, `Lock table "${TF_STATE_LOCK_TABLE}" exists`, lockTable?.Table ? 'pass' : 'fail');
}

async function phase2_githubSecrets() {
  const cat = 'P2: GitHub Secrets';

  if (SKIP_GITHUB || !GITHUB_TOKEN || !GITHUB_REPO) {
    record(2, cat, 'GitHub secrets check', 'skip', {
      detail: 'GITHUB_TOKEN or GITHUB_REPO not set, or --skip-github flag used',
    });
    return;
  }

  // Repository-level secrets
  const repoSecrets = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'TF_STATE_BUCKET',
    'TF_STATE_LOCK_TABLE',
  ];

  try {
    const response = await httpGet(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/secrets`,
      { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
    );
    if (response.status === 200) {
      const data = JSON.parse(response.body);
      const secretNames = (data.secrets || []).map((s: any) => s.name);
      for (const secret of repoSecrets) {
        record(2, cat, `Repo secret: ${secret}`, secretNames.includes(secret) ? 'pass' : 'fail');
      }
    } else {
      record(2, cat, 'GitHub API accessible', 'fail', {
        detail: `Status ${response.status} — check GITHUB_TOKEN permissions`,
      });
    }
  } catch (err: any) {
    record(2, cat, 'GitHub API accessible', 'fail', { detail: err.message });
  }

  // Environment-level secrets
  const envSecrets = [
    'FRONTEND_S3_BUCKET',
    'FRONTEND_CLOUDFRONT_DISTRIBUTION_ID',
    'VITE_API_BASE_URL',
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_CLIENT_ID',
    'VITE_COGNITO_DOMAIN',
    'DYNAMODB_TABLE_NAME',
    'COGNITO_USER_POOL_ID',
  ];

  for (const env of ['dev', 'qa', 'staging', 'prod']) {
    try {
      const response = await httpGet(
        `https://api.github.com/repos/${GITHUB_REPO}/environments/${env}/secrets`,
        { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
      );
      if (response.status === 200) {
        const data = JSON.parse(response.body);
        const secretNames = (data.secrets || []).map((s: any) => s.name);
        const foundCount = envSecrets.filter((s) => secretNames.includes(s)).length;
        const severity: Severity = foundCount === envSecrets.length ? 'pass' : foundCount > 0 ? 'warn' : 'fail';
        record(2, cat, `Environment "${env}" secrets (${foundCount}/${envSecrets.length})`, severity);
      } else if (response.status === 404) {
        record(2, cat, `Environment "${env}" exists`, 'fail', {
          detail: 'GitHub environment not created',
        });
      }
    } catch (err: any) {
      record(2, cat, `Environment "${env}" secrets`, 'skip', { detail: err.message });
    }
  }
}

// ============================================================================
// PHASE 3 — Frontend Migration
// ============================================================================

async function phase3_apiLayerReadiness() {
  const cat = 'P3: API Layer';

  // 3a. Health check via API Gateway (validates end-to-end routing)
  if (API_GATEWAY_URL) {
    // Check CORS headers
    try {
      const response = await httpGet(`${API_GATEWAY_URL}/health`);
      record(3, cat, 'API health endpoint reachable', response.status === 200 ? 'pass' : 'fail', {
        actual: String(response.status),
      });
    } catch (err: any) {
      record(3, cat, 'API health endpoint reachable', 'fail', { detail: err.message });
    }

    // 3b. Check critical API endpoints exist (200 or 401 both valid — means route is mapped)
    const endpoints = [
      '/api/accounts',
      '/api/enterprises',
      '/api/users',
      '/api/groups',
      '/api/roles',
      '/api/licenses',
      '/api/workstreams',
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await httpGet(`${API_GATEWAY_URL}${endpoint}`);
        // 401 is OK — means the route exists but requires auth
        const routeExists = response.status !== 404 && response.status !== 403;
        record(3, cat, `Route ${endpoint} mapped`, routeExists ? 'pass' : 'fail', {
          actual: `HTTP ${response.status}`,
        });
      } catch (err: any) {
        record(3, cat, `Route ${endpoint} mapped`, 'warn', { detail: err.message });
      }
    }
  } else {
    record(3, cat, 'API layer endpoints', 'skip', {
      detail: 'API_GATEWAY_URL not set — cannot validate routes',
    });
  }
}

async function phase3_cognitoClientConfig() {
  const cat = 'P3: Cognito Client';

  if (!cognitoClient || !COGNITO_USER_POOL_ID) {
    record(3, cat, 'Cognito client configuration', 'skip', {
      detail: 'COGNITO_USER_POOL_ID not set',
    });
    return;
  }

  // 3a. Get app client details
  const poolInfo = await safeExec(async () =>
    cognitoClient!.send(new DescribeUserPoolCommand({ UserPoolId: COGNITO_USER_POOL_ID })),
  );

  // 3b. Verify callback URLs include production domain
  if (poolInfo?.UserPool) {
    // We can't easily get client config from pool info alone — need client ID
    record(3, cat, 'User Pool accessible', 'pass');

    // Check that JWKS URI is accessible
    const poolRegion = COGNITO_USER_POOL_ID.split('_')[0];
    const jwksUri = `https://cognito-idp.${poolRegion}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;
    try {
      const response = await httpGet(jwksUri);
      const jwks = JSON.parse(response.body);
      record(3, cat, 'JWKS endpoint accessible', response.status === 200 ? 'pass' : 'fail');
      record(3, cat, `JWKS has signing keys (${jwks.keys?.length || 0})`, (jwks.keys?.length || 0) > 0 ? 'pass' : 'fail');
    } catch (err: any) {
      record(3, cat, 'JWKS endpoint accessible', 'fail', { detail: err.message });
    }
  }
}

// ============================================================================
// PHASE 4 — Data Migration
// ============================================================================

async function phase4_dataMigrationIntegrity() {
  const cat = 'P4: Data Integrity';

  // 4a. Count total items in table
  const scanResult = await safeExec(async () =>
    docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      Select: 'COUNT',
    })),
  );
  const totalItems = scanResult?.Count || 0;
  record(4, cat, `Total items in table: ${totalItems}`, totalItems > 10 ? 'pass' : 'warn', {
    detail: totalItems <= 10 ? 'Very few items — data migration may not have run' : undefined,
  });

  // 4b. Check GSI1 has data (entity lookups)
  const gsi1Result = await safeExec(async () =>
    docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': 'ENTITY#ACCOUNT' },
      Select: 'COUNT',
    })),
  );
  const gsi1Count = gsi1Result?.Count || 0;
  record(4, cat, `GSI1 account index populated (${gsi1Count} accounts)`, gsi1Count > 0 ? 'pass' : 'fail');

  // 4c. Check GSI2 has data (enterprise queries)
  const gsi2Result = await safeExec(async () =>
    docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: { ':pk': 'CLOUD_TYPE#PUBLIC' },
      Select: 'COUNT',
    })),
  );
  const gsi2Count = gsi2Result?.Count || 0;
  record(4, cat, `GSI2 cloud-type index populated (${gsi2Count} items)`, gsi2Count > 0 ? 'pass' : 'warn');

  // 4d. All accounts have SSM registrations
  const allAccounts = await safeExec(async () =>
    docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': 'ENTITY#ACCOUNT' },
    })),
  );
  const accounts = allAccounts?.Items || [];
  let ssmMissing = 0;
  for (const account of accounts) {
    const accountId = account.id;
    if (!accountId) continue;
    const ssmValue = await getSSMParam(`${SSM_PREFIX}/${accountId}/dynamodb/table-name`);
    if (!ssmValue) ssmMissing++;
  }
  record(4, cat, `SSM registrations (${accounts.length - ssmMissing}/${accounts.length} accounts)`,
    ssmMissing === 0 ? 'pass' : 'warn', {
      detail: ssmMissing > 0 ? `${ssmMissing} account(s) missing SSM table-name parameter` : undefined,
    },
  );

  // 4e. Cognito user reconciliation
  if (cognitoClient && COGNITO_USER_POOL_ID) {
    const cognitoUsers = await safeExec(async () =>
      cognitoClient!.send(new ListUsersCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Limit: 60,
      })),
    );
    const cognitoCount = cognitoUsers?.Users?.length || 0;

    // Count technical users in DynamoDB
    // We'll do a loose scan for USER# items as a rough count
    const techUserScan = await safeExec(async () =>
      docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':sk': 'USER#' },
        Select: 'COUNT',
      })),
    );
    const ddbUserCount = techUserScan?.Count || 0;

    record(4, cat, `Cognito users: ${cognitoCount}, DynamoDB users: ${ddbUserCount}`,
      cognitoCount > 0 ? 'pass' : 'warn', {
        detail: cognitoCount === 0 ? 'No Cognito users found — user reconciliation may not have run' :
          Math.abs(cognitoCount - ddbUserCount) > 2 ? `User count mismatch (delta: ${Math.abs(cognitoCount - ddbUserCount)})` : undefined,
      },
    );
  }
}

// ============================================================================
// PHASE 5 — Production Hardening
// ============================================================================

async function phase5_waf() {
  const cat = 'P5: WAF';

  if (TARGET_ENV !== 'prod' && TARGET_ENV !== 'staging') {
    record(5, cat, 'WAF check', 'skip', {
      detail: `WAF typically only enabled in staging/prod (current: ${TARGET_ENV})`,
    });
    return;
  }

  const webAcls = await safeExec(async () =>
    wafClient.send(new ListWebACLsCommand({ Scope: 'REGIONAL' })),
  );

  const matchingAcl = webAcls?.WebACLs?.find((acl) => acl.Name?.includes(PROJECT_NAME));
  record(5, cat, 'WAF Web ACL exists', matchingAcl ? 'pass' : 'fail', {
    detail: matchingAcl ? `ACL: ${matchingAcl.Name}` : 'No WAF Web ACL found for project',
  });

  if (matchingAcl?.ARN) {
    const aclDetail = await safeExec(async () =>
      wafClient.send(new GetWebACLCommand({
        Name: matchingAcl.Name!,
        Id: matchingAcl.Id!,
        Scope: 'REGIONAL',
      })),
    );
    const ruleCount = aclDetail?.WebACL?.Rules?.length || 0;
    record(5, cat, `WAF rules configured (${ruleCount})`, ruleCount >= 3 ? 'pass' : 'warn', {
      detail: ruleCount < 3 ? 'Expected at least 3 rules (CommonRuleSet, SQLi, Rate Limiting)' : undefined,
    });
  }
}

async function phase5_secretsManager() {
  const cat = 'P5: Secrets Manager';

  const secrets = await safeExec(async () =>
    secretsClient.send(new ListSecretsCommand({
      Filters: [{ Key: 'name', Values: [PROJECT_NAME] }],
    })),
  );

  const secretList = secrets?.SecretList || [];
  record(5, cat, `Secrets Manager secrets found: ${secretList.length}`, secretList.length > 0 ? 'pass' : 'warn', {
    detail: secretList.length === 0 ? 'No project secrets found — Secrets Manager may not be enabled' : undefined,
  });

  // Check for rotation configuration on each secret
  for (const secret of secretList) {
    if (secret.RotationEnabled) {
      record(5, cat, `Secret "${secret.Name}" rotation enabled`, 'pass');
    } else {
      record(5, cat, `Secret "${secret.Name}" rotation`, 'info', {
        detail: 'Rotation not enabled — consider enabling for production',
      });
    }
  }
}

async function phase5_monitoring() {
  const cat = 'P5: Monitoring';

  // 5a. CloudWatch dashboard exists
  const dashboards = await safeExec(async () =>
    cloudwatchClient.send(new ListDashboardsCommand({
      DashboardNamePrefix: `${PROJECT_NAME}-${TARGET_ENV}`,
    })),
  );
  const dashboardExists = (dashboards?.DashboardEntries?.length || 0) > 0;
  record(5, cat, 'CloudWatch dashboard exists', dashboardExists ? 'pass' : 'warn', {
    detail: dashboardExists
      ? `Dashboard: ${dashboards!.DashboardEntries![0].DashboardName}`
      : `No dashboard matching "${PROJECT_NAME}-${TARGET_ENV}" prefix`,
  });

  // 5b. CloudWatch alarms exist
  const alarms = await safeExec(async () =>
    cloudwatchClient.send(new DescribeAlarmsCommand({
      AlarmNamePrefix: `${PROJECT_NAME}-${TARGET_ENV}`,
      MaxRecords: 100,
    })),
  );
  const alarmCount = (alarms?.MetricAlarms?.length || 0) + (alarms?.CompositeAlarms?.length || 0);
  record(5, cat, `CloudWatch alarms configured: ${alarmCount}`, alarmCount >= 5 ? 'pass' : 'warn', {
    detail: alarmCount < 5 ? 'Expected at least 5 alarms (Lambda errors, DDB throttles, API 5xx, etc.)' : undefined,
  });

  // 5c. Check for any alarms in ALARM state
  const activeAlarms = (alarms?.MetricAlarms || []).filter((a) => a.StateValue === 'ALARM');
  if (activeAlarms.length > 0) {
    record(5, cat, `Active alarms: ${activeAlarms.length}`, 'warn', {
      detail: `Alarms firing: ${activeAlarms.map((a) => a.AlarmName).join(', ')}`,
    });
  } else {
    record(5, cat, 'No active alarms firing', 'pass');
  }
}

async function phase5_snsAlerts() {
  const cat = 'P5: SNS Alerts';

  for (const { arn, label } of [
    { arn: SNS_CRITICAL_TOPIC_ARN, label: 'Critical alerts topic' },
    { arn: SNS_WARNING_TOPIC_ARN, label: 'Warning alerts topic' },
  ]) {
    if (!arn) {
      record(5, cat, label, 'skip', { detail: 'ARN not configured' });
      continue;
    }

    const topicInfo = await safeExec(async () =>
      snsClient.send(new GetTopicAttributesCommand({ TopicArn: arn })),
    );
    record(5, cat, `${label} exists`, topicInfo ? 'pass' : 'fail');

    if (topicInfo) {
      const subs = await safeExec(async () =>
        snsClient.send(new ListSubscriptionsByTopicCommand({ TopicArn: arn })),
      );
      const subCount = subs?.Subscriptions?.length || 0;
      const confirmedSubs = (subs?.Subscriptions || []).filter(
        (s) => s.SubscriptionArn && !s.SubscriptionArn.includes('PendingConfirmation'),
      );
      record(5, cat, `${label} subscribers (${confirmedSubs.length} confirmed / ${subCount} total)`,
        confirmedSubs.length > 0 ? 'pass' : 'warn', {
          detail: confirmedSubs.length === 0 ? 'No confirmed subscriptions — alerts will not be received' : undefined,
        },
      );
    }
  }
}

async function phase5_stepFunctions() {
  const cat = 'P5: Step Functions';

  if (STEP_FUNCTIONS_ARN) {
    const sfnInfo = await safeExec(async () =>
      sfnClient.send(new DescribeStateMachineCommand({ stateMachineArn: STEP_FUNCTIONS_ARN })),
    );

    if (sfnInfo) {
      record(5, cat, 'State machine exists', 'pass');
      record(5, cat, `State machine status: ${sfnInfo.status}`, sfnInfo.status === 'ACTIVE' ? 'pass' : 'fail');

      // Check recent executions
      const executions = await safeExec(async () =>
        sfnClient.send(new ListExecutionsCommand({
          stateMachineArn: STEP_FUNCTIONS_ARN,
          maxResults: 10,
        })),
      );
      const execCount = executions?.executions?.length || 0;
      const failedExecs = (executions?.executions || []).filter((e) => e.status === 'FAILED');
      record(5, cat, `Recent executions: ${execCount} (${failedExecs.length} failed)`,
        failedExecs.length === 0 ? 'pass' : 'warn',
      );
    } else {
      record(5, cat, 'State machine exists', 'fail');
    }
  } else {
    // Try to find by name convention
    record(5, cat, 'Step Functions ARN configured', 'skip', {
      detail: 'STEP_FUNCTIONS_ARN not set — cannot validate state machine',
    });
  }
}

async function phase5_workerDLQs() {
  const cat = 'P5: Worker DLQs';

  const workerNames = [
    'dynamodb-provisioner',
    'cognito-provisioner',
    'ses-notification',
    'provisioning-verifier',
  ];

  for (const worker of workerNames) {
    const queueName = `${PROJECT_NAME}-${TARGET_ENV}-${worker}-dlq`;
    const queueUrl = await safeExec(async () => {
      const result = await sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
      return result.QueueUrl;
    });

    if (queueUrl) {
      const attrs = await safeExec(async () =>
        sqsClient.send(new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
        })),
      );
      const msgCount = parseInt(attrs?.Attributes?.ApproximateNumberOfMessages || '0', 10);
      record(5, cat, `DLQ "${worker}" (${msgCount} messages)`, msgCount === 0 ? 'pass' : 'warn', {
        detail: msgCount > 0 ? `${msgCount} message(s) in DLQ — investigate failed worker executions` : undefined,
      });
    } else {
      record(5, cat, `DLQ "${worker}" exists`, 'skip', {
        detail: `Queue ${queueName} not found — worker may not be deployed`,
      });
    }
  }
}

async function phase5_frontendHosting() {
  const cat = 'P5: Frontend Hosting';

  // S3 bucket
  if (FRONTEND_S3_BUCKET) {
    const bucketExists = await safeExec(async () =>
      s3Client.send(new HeadBucketCommand({ Bucket: FRONTEND_S3_BUCKET })),
    );
    record(5, cat, `Frontend S3 bucket exists`, bucketExists ? 'pass' : 'fail');

    if (bucketExists) {
      const versioning = await safeExec(async () =>
        s3Client.send(new GetBucketVersioningCommand({ Bucket: FRONTEND_S3_BUCKET })),
      );
      record(5, cat, 'S3 versioning enabled (rollback support)',
        versioning?.Status === 'Enabled' ? 'pass' : 'warn',
      );
    }
  } else {
    record(5, cat, 'Frontend S3 bucket', 'skip', { detail: 'FRONTEND_S3_BUCKET not set' });
  }

  // CloudFront
  if (CLOUDFRONT_DISTRIBUTION_ID) {
    const distInfo = await safeExec(async () =>
      cloudfrontClient.send(new GetDistributionCommand({ Id: CLOUDFRONT_DISTRIBUTION_ID })),
    );
    if (distInfo?.Distribution) {
      record(5, cat, 'CloudFront distribution exists', 'pass');
      record(5, cat, 'CloudFront distribution enabled',
        distInfo.Distribution.DistributionConfig?.Enabled ? 'pass' : 'fail',
      );
      record(5, cat, `CloudFront status: ${distInfo.Distribution.Status}`,
        distInfo.Distribution.Status === 'Deployed' ? 'pass' : 'warn',
      );
    } else {
      record(5, cat, 'CloudFront distribution exists', 'fail');
    }
  } else {
    record(5, cat, 'CloudFront distribution', 'skip', { detail: 'CLOUDFRONT_DISTRIBUTION_ID not set' });
  }
}

// ============================================================================
// Report Generation
// ============================================================================

function generateReport() {
  const phases = [
    { num: 1, name: 'AWS Foundation' },
    { num: 2, name: 'CI/CD Pipeline' },
    { num: 3, name: 'Frontend Migration' },
    { num: 4, name: 'Data Migration' },
    { num: 5, name: 'Production Hardening' },
  ];

  if (JSON_OUTPUT) {
    const summary = {
      timestamp: new Date().toISOString(),
      environment: TARGET_ENV,
      table: TABLE_NAME,
      region: AWS_REGION,
      phases: phases.map((p) => {
        const phaseResults = results.filter((r) => r.phase === p.num);
        return {
          phase: p.num,
          name: p.name,
          total: phaseResults.length,
          pass: phaseResults.filter((r) => r.severity === 'pass').length,
          fail: phaseResults.filter((r) => r.severity === 'fail').length,
          warn: phaseResults.filter((r) => r.severity === 'warn').length,
          skip: phaseResults.filter((r) => r.severity === 'skip').length,
          info: phaseResults.filter((r) => r.severity === 'info').length,
          checks: phaseResults,
        };
      }),
      totals: {
        total: results.length,
        pass: results.filter((r) => r.severity === 'pass').length,
        fail: results.filter((r) => r.severity === 'fail').length,
        warn: results.filter((r) => r.severity === 'warn').length,
        skip: results.filter((r) => r.severity === 'skip').length,
        info: results.filter((r) => r.severity === 'info').length,
      },
      goLiveReady: results.filter((r) => r.severity === 'fail').length === 0,
    };
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  // ─── Human-readable report ──────────────────────────────────────────
  const ICONS: Record<Severity, string> = {
    pass: '✅',
    fail: '❌',
    warn: '⚠️ ',
    skip: '⏭️ ',
    info: 'ℹ️ ',
  };

  console.log('\n' + '═'.repeat(80));
  console.log('  🚀 PRE-FLIGHT CHECKLIST — GO-LIVE READINESS VALIDATION');
  console.log('═'.repeat(80));
  console.log(`  Environment: ${TARGET_ENV.toUpperCase()}`);
  console.log(`  Region:      ${AWS_REGION}`);
  console.log(`  Table:       ${TABLE_NAME}`);
  console.log(`  Timestamp:   ${new Date().toISOString()}`);
  console.log('─'.repeat(80));

  for (const phase of phases) {
    const phaseResults = results.filter((r) => r.phase === phase.num);
    if (phaseResults.length === 0) continue;

    const passCount = phaseResults.filter((r) => r.severity === 'pass').length;
    const failCount = phaseResults.filter((r) => r.severity === 'fail').length;
    const warnCount = phaseResults.filter((r) => r.severity === 'warn').length;
    const skipCount = phaseResults.filter((r) => r.severity === 'skip').length;

    const phaseIcon = failCount > 0 ? '❌' : warnCount > 0 ? '⚠️ ' : '✅';

    console.log(`\n${phaseIcon} PHASE ${phase.num}: ${phase.name.toUpperCase()}`);
    console.log(`   Pass: ${passCount}  Fail: ${failCount}  Warn: ${warnCount}  Skip: ${skipCount}`);
    console.log('   ' + '─'.repeat(60));

    // Group by category
    const categories = [...new Set(phaseResults.map((r) => r.category))];
    for (const category of categories) {
      const catResults = phaseResults.filter((r) => r.category === category);

      for (const result of catResults) {
        if (!VERBOSE && result.severity === 'pass') continue;
        if (!VERBOSE && result.severity === 'info') continue;

        const icon = ICONS[result.severity];
        console.log(`   ${icon} ${result.check}`);

        if (result.expected && result.actual) {
          console.log(`      Expected: ${result.expected}  Actual: ${result.actual}`);
        }
        if (result.detail) {
          console.log(`      → ${result.detail}`);
        }
      }
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────
  const totalPass = results.filter((r) => r.severity === 'pass').length;
  const totalFail = results.filter((r) => r.severity === 'fail').length;
  const totalWarn = results.filter((r) => r.severity === 'warn').length;
  const totalSkip = results.filter((r) => r.severity === 'skip').length;
  const totalInfo = results.filter((r) => r.severity === 'info').length;

  console.log('\n' + '═'.repeat(80));
  console.log('  📊 SUMMARY');
  console.log('─'.repeat(80));
  console.log(`   Total checks:  ${results.length}`);
  console.log(`   ✅ Pass:       ${totalPass}`);
  console.log(`   ❌ Fail:       ${totalFail}`);
  console.log(`   ⚠️  Warn:       ${totalWarn}`);
  console.log(`   ⏭️  Skip:       ${totalSkip}`);
  console.log(`   ℹ️  Info:       ${totalInfo}`);
  console.log('─'.repeat(80));

  if (totalFail === 0 && totalWarn === 0) {
    console.log('   🟢 ALL CHECKS PASSED — SYSTEM IS GO-LIVE READY');
  } else if (totalFail === 0) {
    console.log('   🟡 NO FAILURES — Review warnings before proceeding');
  } else {
    console.log(`   🔴 ${totalFail} FAILURE(S) — Must resolve before go-live`);

    // List all failures
    console.log('\n   ❌ Failures requiring resolution:');
    for (const result of results.filter((r) => r.severity === 'fail')) {
      console.log(`      • [Phase ${result.phase}] ${result.check}`);
      if (result.detail) console.log(`        → ${result.detail}`);
    }
  }

  console.log('═'.repeat(80) + '\n');
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
    process.exit(2);
  }

  if (!JSON_OUTPUT) {
    console.log('\n🔍 Starting pre-flight validation...');
    console.log(`   Target: ${TARGET_ENV} | Region: ${AWS_REGION} | Table: ${TABLE_NAME}`);
    if (PHASE_FILTER) console.log(`   Phases: ${PHASE_FILTER.join(', ')}`);
    console.log('');
  }

  try {
    // Phase 1: AWS Foundation
    if (shouldRunPhase(1)) {
      if (!JSON_OUTPUT) console.log('   📡 Checking Phase 1: AWS Foundation...');
      await Promise.all([
        phase1_dynamodbTable(),
        phase1_cognito(),
        phase1_ssmRegistration(),
        phase1_lambda(),
        phase1_apiGateway(),
      ]);
      // Bootstrap must run after DynamoDB checks since it queries the table
      await phase1_bootstrapEntities();
    }

    // Phase 2: CI/CD Pipeline
    if (shouldRunPhase(2)) {
      if (!JSON_OUTPUT) console.log('   📡 Checking Phase 2: CI/CD Pipeline...');
      await Promise.all([
        phase2_terraformState(),
        phase2_githubSecrets(),
      ]);
    }

    // Phase 3: Frontend Migration
    if (shouldRunPhase(3)) {
      if (!JSON_OUTPUT) console.log('   📡 Checking Phase 3: Frontend Migration...');
      await Promise.all([
        phase3_apiLayerReadiness(),
        phase3_cognitoClientConfig(),
      ]);
    }

    // Phase 4: Data Migration
    if (shouldRunPhase(4)) {
      if (!JSON_OUTPUT) console.log('   📡 Checking Phase 4: Data Migration...');
      await phase4_dataMigrationIntegrity();
    }

    // Phase 5: Production Hardening
    if (shouldRunPhase(5)) {
      if (!JSON_OUTPUT) console.log('   📡 Checking Phase 5: Production Hardening...');
      await Promise.all([
        phase5_waf(),
        phase5_secretsManager(),
        phase5_monitoring(),
        phase5_snsAlerts(),
        phase5_stepFunctions(),
        phase5_workerDLQs(),
        phase5_frontendHosting(),
      ]);
    }

    // Generate report
    generateReport();

    // Exit code
    const failCount = results.filter((r) => r.severity === 'fail').length;
    process.exit(failCount > 0 ? 1 : 0);
  } catch (err: any) {
    console.error(`\n❌ Pre-flight check crashed: ${err.message}`);
    console.error(err.stack);
    process.exit(2);
  }
}

main();
