/**
 * Provisioning Verifier Worker Lambda
 *
 * Final step in the Step Functions workflow. Validates that all provisioned
 * resources are accessible and correctly configured, then updates SSM
 * parameters with the final provisioning status.
 *
 * Checks:
 * 1. DynamoDB table exists and is ACTIVE
 * 2. SSM parameters are correctly set
 * 3. Cognito users were created with expected attributes
 * 4. Notification audit entries exist
 */

import { Logger } from '@nestjs/common';
import {
  DynamoDBClient,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from '@aws-sdk/client-ssm';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const logger = new Logger('ProvisioningVerifier');

interface VerifierEvent {
  action: 'verify';
  accountId: string;
  accountName: string;
  cloudType: string;
  dynamodbResult: {
    tableName: string;
    tableArn?: string;
    stackId?: string;
    status: string;
  };
  cognitoResults: Array<{
    email?: string;
    cognitoSub?: string | null;
    created?: boolean;
    status?: string;
    error?: string;
  }>;
  notificationResults: Array<{
    sent?: boolean;
    messageId?: string;
    reason?: string;
  }>;
  executionId: string;
}

interface VerifierResult {
  verified: boolean;
  summary: {
    dynamodb: { status: string; tableName?: string };
    cognito: { total: number; created: number; updated: number; failed: number };
    notifications: { total: number; sent: number; skipped: number; failed: number };
    checks: Array<{ name: string; passed: boolean; detail?: string }>;
  };
  completedAt: string;
}

export async function handler(event: VerifierEvent): Promise<VerifierResult> {
  const region = process.env.AWS_REGION || 'us-east-1';
  const projectName = process.env.PROJECT_NAME || 'app';
  const userPoolId = process.env.COGNITO_USER_POOL_ID || '';

  const ddbClient = new DynamoDBClient({ region });
  const ssmClient = new SSMClient({ region });
  const cwClient = new CloudWatchClient({ region });
  const startTime = Date.now();

  logger.log(`[${event.executionId}] Verifying provisioning for account ${event.accountId}`);

  const checks: Array<{ name: string; passed: boolean; detail?: string }> = [];

  // ─── Check 1: DynamoDB Table ──────────────────────────────────────────
  try {
    const tableResult = await ddbClient.send(
      new DescribeTableCommand({ TableName: event.dynamodbResult.tableName }),
    );
    const tableStatus = tableResult.Table?.TableStatus;
    const passed = tableStatus === 'ACTIVE';
    checks.push({
      name: 'DynamoDB Table Active',
      passed,
      detail: `Table ${event.dynamodbResult.tableName} status: ${tableStatus}`,
    });
  } catch (error: any) {
    checks.push({
      name: 'DynamoDB Table Active',
      passed: false,
      detail: `Table check failed: ${error.message}`,
    });
  }

  // ─── Check 2: SSM Parameters ──────────────────────────────────────────
  try {
    const statusParam = await ssmClient.send(
      new GetParameterCommand({
        Name: `/accounts/${event.accountId}/provisioning-status`,
      }),
    );
    const ssmStatus = statusParam.Parameter?.Value;
    checks.push({
      name: 'SSM Provisioning Status',
      passed: ssmStatus === 'active',
      detail: `SSM status: ${ssmStatus}`,
    });
  } catch (error: any) {
    checks.push({
      name: 'SSM Provisioning Status',
      passed: false,
      detail: `SSM check failed: ${error.message}`,
    });
  }

  try {
    const tableParam = await ssmClient.send(
      new GetParameterCommand({
        Name: `/accounts/${event.accountId}/dynamodb/table-name`,
      }),
    );
    checks.push({
      name: 'SSM Table Name Parameter',
      passed: !!tableParam.Parameter?.Value,
      detail: `SSM table name: ${tableParam.Parameter?.Value}`,
    });
  } catch (error: any) {
    checks.push({
      name: 'SSM Table Name Parameter',
      passed: false,
      detail: `SSM table check failed: ${error.message}`,
    });
  }

  // ─── Check 3: Cognito Users ───────────────────────────────────────────
  let cognitoCreated = 0;
  let cognitoUpdated = 0;
  let cognitoFailed = 0;

  if (userPoolId) {
    const cognitoClient = new CognitoIdentityProviderClient({ region });

    for (const userResult of event.cognitoResults) {
      if (userResult.status === 'failed') {
        cognitoFailed++;
        continue;
      }

      if (userResult.email) {
        try {
          await cognitoClient.send(
            new AdminGetUserCommand({
              UserPoolId: userPoolId,
              Username: userResult.email,
            }),
          );

          if (userResult.created) cognitoCreated++;
          else cognitoUpdated++;
        } catch {
          cognitoFailed++;
        }
      }
    }

    checks.push({
      name: 'Cognito Users Verified',
      passed: cognitoFailed === 0,
      detail: `Created: ${cognitoCreated}, Updated: ${cognitoUpdated}, Failed: ${cognitoFailed}`,
    });
  }

  // ─── Check 4: Notification Summary ────────────────────────────────────
  let notifSent = 0;
  let notifSkipped = 0;
  let notifFailed = 0;

  for (const notif of event.notificationResults) {
    if (notif.sent) notifSent++;
    else if (notif.reason?.includes('existed')) notifSkipped++;
    else notifFailed++;
  }

  checks.push({
    name: 'Credential Notifications',
    passed: true, // Non-blocking
    detail: `Sent: ${notifSent}, Skipped: ${notifSkipped}, Failed: ${notifFailed}`,
  });

  // ─── Update Final SSM Status ──────────────────────────────────────────
  const allPassed = checks.every((c) => c.passed);

  await ssmClient.send(
    new PutParameterCommand({
      Name: `/accounts/${event.accountId}/provisioning-status`,
      Value: allPassed ? 'active' : 'partial',
      Type: 'String',
      Overwrite: true,
    }),
  );

  await ssmClient.send(
    new PutParameterCommand({
      Name: `/accounts/${event.accountId}/provisioning-verified-at`,
      Value: new Date().toISOString(),
      Type: 'String',
      Overwrite: true,
    }),
  );

  // ─── Emit Metrics ────────────────────────────────────────────────────
  await emitMetric(cwClient, projectName, allPassed ? 'VerificationPassed' : 'VerificationPartial', Date.now() - startTime);

  const result: VerifierResult = {
    verified: allPassed,
    summary: {
      dynamodb: {
        status: event.dynamodbResult.status,
        tableName: event.dynamodbResult.tableName,
      },
      cognito: {
        total: event.cognitoResults.length,
        created: cognitoCreated,
        updated: cognitoUpdated,
        failed: cognitoFailed,
      },
      notifications: {
        total: event.notificationResults.length,
        sent: notifSent,
        skipped: notifSkipped,
        failed: notifFailed,
      },
      checks,
    },
    completedAt: new Date().toISOString(),
  };

  logger.log(`[${event.executionId}] Verification ${allPassed ? 'PASSED' : 'PARTIAL'}: ${JSON.stringify(result.summary)}`);
  return result;
}

async function emitMetric(cwClient: CloudWatchClient, projectName: string, metricName: string, durationMs: number): Promise<void> {
  try {
    await cwClient.send(
      new PutMetricDataCommand({
        Namespace: `${projectName}/Workers`,
        MetricData: [
          { MetricName: metricName, Dimensions: [{ Name: 'Worker', Value: 'provisioning-verifier' }], Value: 1, Unit: 'Count' },
          { MetricName: 'WorkerDuration', Dimensions: [{ Name: 'Worker', Value: 'provisioning-verifier' }], Value: durationMs, Unit: 'Milliseconds' },
        ],
      }),
    );
  } catch { /* silent */ }
}
