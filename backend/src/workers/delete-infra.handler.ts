/**
 * Delete Infrastructure Worker Lambda
 *
 * Handles account teardown:
 * 1. delete_public  — Removes SSM parameters for public cloud accounts
 * 2. delete_private — Deletes the CloudFormation stack for private cloud accounts
 *
 * Invoked by Step Functions as part of the account deletion workflow.
 * Returns immediately after initiating deletion; poll-infra checks completion.
 */

import { Logger } from '@nestjs/common';
import {
  CloudFormationClient,
  DeleteStackCommand,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import {
  SSMClient,
  DeleteParameterCommand,
  GetParameterCommand,
  PutParameterCommand,
} from '@aws-sdk/client-ssm';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { retryWithBackoff, isTransientAwsError } from '../common/utils/retry';

const logger = new Logger('DeleteInfraWorker');

interface DeleteInfraEvent {
  action: 'delete_public' | 'delete_private';
  accountId: string;
  accountName: string;
  cloudType?: string;
  executionId: string;
}

interface DeleteInfraResult {
  accountId: string;
  status: string;
  stackName?: string;
}

export async function handler(event: DeleteInfraEvent): Promise<DeleteInfraResult> {
  const region = process.env.AWS_REGION || 'us-east-1';
  const environment = process.env.NODE_ENV || 'dev';
  const projectName = process.env.PROJECT_NAME || 'app';
  const cwClient = new CloudWatchClient({ region });
  const startTime = Date.now();

  // Determine action from event or cloudType
  const action = event.action || (event.cloudType === 'private' ? 'delete_private' : 'delete_public');

  logger.log(`[${event.executionId}] Action: ${action} for account ${event.accountId}`);

  try {
    let result: DeleteInfraResult;

    if (action === 'delete_public') {
      result = await deletePublicAccount(region, event);
    } else {
      result = await deletePrivateAccount(region, event, environment, projectName);
    }

    await emitMetric(cwClient, projectName, 'WorkerSuccess', action, Date.now() - startTime);
    return result;
  } catch (error: any) {
    await emitMetric(cwClient, projectName, 'WorkerFailure', action, Date.now() - startTime);
    logger.error(`[${event.executionId}] Failed: ${error.message}`);
    throw error;
  }
}

async function deletePublicAccount(
  region: string,
  event: DeleteInfraEvent,
): Promise<DeleteInfraResult> {
  const ssmClient = new SSMClient({ region });

  // Remove SSM parameters for the account
  const paramNames = [
    `/accounts/${event.accountId}/cloud-type`,
    `/accounts/${event.accountId}/dynamodb/table-name`,
    `/accounts/${event.accountId}/provisioning-status`,
    `/accounts/${event.accountId}/provisioning-verified-at`,
  ];

  for (const name of paramNames) {
    try {
      await ssmClient.send(new DeleteParameterCommand({ Name: name }));
      logger.log(`Deleted SSM parameter: ${name}`);
    } catch (error: any) {
      if (error.name === 'ParameterNotFound') {
        logger.debug(`SSM parameter already absent: ${name}`);
      } else {
        logger.warn(`Failed to delete SSM parameter ${name}: ${error.message}`);
      }
    }
  }

  logger.log(`[${event.executionId}] Public account ${event.accountId} SSM params removed`);

  return {
    accountId: event.accountId,
    status: 'DELETED',
  };
}

async function deletePrivateAccount(
  region: string,
  event: DeleteInfraEvent,
  environment: string,
  projectName: string,
): Promise<DeleteInfraResult> {
  const cfnClient = new CloudFormationClient({ region });
  const ssmClient = new SSMClient({ region });
  const stackName = `${projectName}-${environment}-account-${event.accountId}`;

  // Update provisioning status
  await ssmClient.send(
    new PutParameterCommand({
      Name: `/accounts/${event.accountId}/provisioning-status`,
      Value: 'deleting',
      Type: 'String',
      Overwrite: true,
    }),
  );

  // Check if stack exists
  try {
    await retryWithBackoff(
      () => cfnClient.send(new DescribeStacksCommand({ StackName: stackName })),
      { maxAttempts: 2, label: 'DescribeStack-Delete', retryIf: isTransientAwsError },
    );
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      logger.log(`[${event.executionId}] Stack ${stackName} does not exist — nothing to delete`);
      return { accountId: event.accountId, status: 'DELETED', stackName };
    }
    throw error;
  }

  // Initiate stack deletion
  await retryWithBackoff(
    () => cfnClient.send(new DeleteStackCommand({ StackName: stackName })),
    { maxAttempts: 3, label: 'DeleteStack', retryIf: isTransientAwsError },
  );

  logger.log(`[${event.executionId}] Stack deletion initiated: ${stackName}`);

  // Return DELETING — poll-infra will check completion
  return {
    accountId: event.accountId,
    status: 'DELETING',
    stackName,
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
              { Name: 'Worker', Value: 'delete-infra' },
              { Name: 'Action', Value: action },
            ],
            Value: 1,
            Unit: 'Count',
          },
          {
            MetricName: 'WorkerDuration',
            Dimensions: [
              { Name: 'Worker', Value: 'delete-infra' },
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
