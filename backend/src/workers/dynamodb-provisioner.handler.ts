/**
 * DynamoDB Provisioner Worker Lambda
 *
 * Handles two actions:
 * 1. register_public  — Registers a public cloud account in the shared DynamoDB table via SSM
 * 2. provision_private — Creates a dedicated DynamoDB table via CloudFormation for private accounts
 *
 * Invoked by Step Functions as part of the account provisioning workflow.
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStacksCommand,
  waitUntilStackCreateComplete,
} from '@aws-sdk/client-cloudformation';
import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
} from '@aws-sdk/client-ssm';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { PRIVATE_ACCOUNT_DYNAMODB_TEMPLATE } from '../common/cloudformation/private-account-template';
import { retryWithBackoff, isTransientAwsError } from '../common/utils/retry';

const logger = new Logger('DynamoDBProvisioner');

interface ProvisionerEvent {
  action: 'register_public' | 'provision_private';
  accountId: string;
  accountName: string;
  billingMode?: string;
  executionId: string;
}

interface ProvisionerResult {
  tableName: string;
  tableArn?: string;
  stackId?: string;
  status: string;
}

export async function handler(event: ProvisionerEvent): Promise<ProvisionerResult> {
  const region = process.env.AWS_REGION || 'us-east-1';
  const environment = process.env.NODE_ENV || 'dev';
  const projectName = process.env.PROJECT_NAME || 'app';
  const tableName = process.env.CONTROL_PLANE_TABLE_NAME || process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) throw new Error('CONTROL_PLANE_TABLE_NAME or DYNAMODB_TABLE_NAME must be set');
  // For public accounts, use the data-plane table (shared customer table), NOT the control-plane table
  const publicTableName = process.env.PUBLIC_ACCOUNT_TABLE_NAME
    || process.env.DATA_PLANE_TABLE_NAME
    || `account-admin-public-${environment}`;
  const templateBucket = process.env.CFN_TEMPLATE_BUCKET || `${projectName}-cfn-templates`;
  const cfnExecutionRoleArn = process.env.CFN_EXECUTION_ROLE_ARN;

  const ssmClient = new SSMClient({ region });
  const cfnClient = new CloudFormationClient({ region });
  const cwClient = new CloudWatchClient({ region });
  const startTime = Date.now();

  logger.log(`[${event.executionId}] Action: ${event.action} for account ${event.accountId}`);

  try {
    let result: ProvisionerResult;

    if (event.action === 'register_public') {
      result = await registerPublicAccount(ssmClient, event, publicTableName);
    } else {
      result = await provisionPrivateAccount(cfnClient, ssmClient, event, {
        environment,
        projectName,
        templateBucket,
        region,
        cfnExecutionRoleArn,
      });
    }

    // Emit success metric
    await emitMetric(cwClient, projectName, 'WorkerSuccess', event.action, Date.now() - startTime);
    return result;
  } catch (error: any) {
    await emitMetric(cwClient, projectName, 'WorkerFailure', event.action, Date.now() - startTime);
    logger.error(`[${event.executionId}] Failed: ${error.message}`);
    throw error;
  }
}

async function registerPublicAccount(
  ssmClient: SSMClient,
  event: ProvisionerEvent,
  sharedTableName: string,
): Promise<ProvisionerResult> {
  const params = [
    { Name: `/accounts/${event.accountId}/cloud-type`, Value: 'public' },
    { Name: `/accounts/${event.accountId}/dynamodb/table-name`, Value: sharedTableName },
    { Name: `/accounts/${event.accountId}/provisioning-status`, Value: 'active' },
  ];

  for (const p of params) {
    await ssmClient.send(
      new PutParameterCommand({
        ...p,
        Type: 'String',
        Overwrite: true,
        Description: `Account ${event.accountId} — ${p.Name.split('/').pop()}`,
      }),
    );
  }

  logger.log(`Public account ${event.accountId} registered in shared table ${sharedTableName}`);

  return {
    tableName: sharedTableName,
    status: 'active',
  };
}

async function provisionPrivateAccount(
  cfnClient: CloudFormationClient,
  ssmClient: SSMClient,
  event: ProvisionerEvent,
  config: { environment: string; projectName: string; templateBucket: string; region: string; cfnExecutionRoleArn?: string },
): Promise<ProvisionerResult> {
  const stackName = `${config.projectName}-${config.environment}-account-${event.accountId}`;

  // Use inline TemplateBody to avoid cross-account S3 access issues
  const templateBody = PRIVATE_ACCOUNT_DYNAMODB_TEMPLATE;

  // Update status to creating
  await ssmClient.send(
    new PutParameterCommand({
      Name: `/accounts/${event.accountId}/provisioning-status`,
      Value: 'creating',
      Type: 'String',
      Overwrite: true,
    }),
  );

  // Build CreateStack params
  const createStackParams: any = {
    StackName: stackName,
    TemplateBody: templateBody,
    Parameters: [
      { ParameterKey: 'AccountId', ParameterValue: event.accountId },
      { ParameterKey: 'AccountName', ParameterValue: event.accountName },
      { ParameterKey: 'Environment', ParameterValue: config.environment },
      { ParameterKey: 'ProjectName', ParameterValue: config.projectName },
      { ParameterKey: 'BillingMode', ParameterValue: event.billingMode || 'PAY_PER_REQUEST' },
    ],
    Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
    Tags: [
      { Key: 'AccountId', Value: event.accountId },
      { Key: 'AccountName', Value: event.accountName },
      { Key: 'Environment', Value: config.environment },
      { Key: 'CloudType', Value: 'private' },
      { Key: 'ManagedBy', Value: 'StepFunctions-Worker' },
    ],
    OnFailure: 'ROLLBACK',
  };

  // Pass CFN execution role so CloudFormation has permissions to create resources
  if (config.cfnExecutionRoleArn) {
    createStackParams.RoleARN = config.cfnExecutionRoleArn;
    logger.log(`Using CFN execution role: ${config.cfnExecutionRoleArn}`);
  } else {
    // Fallback: try SSM lookup
    try {
      const ssmPrefix = `/${config.projectName}/${config.environment}`;
      const roleResult = await ssmClient.send(new GetParameterCommand({
        Name: `${ssmPrefix}/cloudformation/execution-role-arn`,
      }));
      if (roleResult.Parameter?.Value) {
        createStackParams.RoleARN = roleResult.Parameter.Value;
        logger.log(`Resolved CFN execution role from SSM: ${roleResult.Parameter.Value}`);
      }
    } catch {
      logger.warn('No CFN_EXECUTION_ROLE_ARN configured and SSM lookup failed');
    }
  }

  // Create CloudFormation stack (with retry for transient errors)
  const createResult = await retryWithBackoff(
    () => cfnClient.send(new CreateStackCommand(createStackParams)),
    { maxAttempts: 3, label: 'CreateStack-Worker', retryIf: isTransientAwsError },
  );

  const stackId = createResult.StackId;
  logger.log(`CloudFormation stack created: ${stackId}`);

  // Wait for completion
  await waitUntilStackCreateComplete(
    { client: cfnClient, maxWaitTime: 540 },
    { StackName: stackName },
  );

  // Get outputs (with retry)
  const describeResult = await retryWithBackoff(
    () => cfnClient.send(new DescribeStacksCommand({ StackName: stackName })),
    { maxAttempts: 3, label: 'DescribeStack-Worker', retryIf: isTransientAwsError },
  );

  const outputs = describeResult.Stacks?.[0]?.Outputs || [];
  const resultTableName = outputs.find((o: any) => o.OutputKey === 'TableName')?.OutputValue;
  const tableArn = outputs.find((o: any) => o.OutputKey === 'TableArn')?.OutputValue;

  if (!resultTableName) {
    throw new Error('Stack created but TableName output not found');
  }

  // Update SSM with success
  await ssmClient.send(
    new PutParameterCommand({
      Name: `/accounts/${event.accountId}/provisioning-status`,
      Value: 'active',
      Type: 'String',
      Overwrite: true,
    }),
  );

  await ssmClient.send(
    new PutParameterCommand({
      Name: `/accounts/${event.accountId}/dynamodb/table-name`,
      Value: resultTableName,
      Type: 'String',
      Overwrite: true,
    }),
  );

  logger.log(`Private account ${event.accountId} provisioned: ${resultTableName}`);

  return {
    tableName: resultTableName,
    tableArn,
    stackId,
    status: 'active',
  };
}

async function emitMetric(
  cwClient: CloudWatchClient,
  projectName: string,
  metricName: string,
  action: string,
  durationMs: number,
): Promise<void> {
  try {
    await cwClient.send(
      new PutMetricDataCommand({
        Namespace: `${projectName}/Workers`,
        MetricData: [
          {
            MetricName: metricName,
            Dimensions: [
              { Name: 'Worker', Value: 'dynamodb-provisioner' },
              { Name: 'Action', Value: action },
            ],
            Value: 1,
            Unit: 'Count',
          },
          {
            MetricName: 'WorkerDuration',
            Dimensions: [
              { Name: 'Worker', Value: 'dynamodb-provisioner' },
              { Name: 'Action', Value: action },
            ],
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
