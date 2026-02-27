/**
 * Poll Infrastructure Worker Lambda
 *
 * Checks the provisioning/deletion status of account infrastructure.
 * - For private accounts: polls CloudFormation stack status
 * - For public accounts: checks SSM provisioning-status parameter
 *
 * Returns { status: "READY" | "CREATING" | "DELETING" | "DELETED" | "FAILED" }
 * Step Functions uses this to decide whether to loop (wait+retry) or proceed.
 */

import { Logger } from '@nestjs/common';
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from '@aws-sdk/client-ssm';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { retryWithBackoff, isTransientAwsError } from '../common/utils/retry';

const logger = new Logger('PollInfraWorker');

interface PollInfraEvent {
  accountId: string;
  accountName?: string;
  cloudType?: string;
  stackName?: string;
  executionId: string;
  /** Original status from create/delete step */
  status?: string;
}

interface PollInfraResult {
  accountId: string;
  accountName?: string;
  cloudType?: string;
  stackName?: string;
  executionId: string;
  status: 'READY' | 'CREATING' | 'DELETING' | 'DELETED' | 'FAILED';
  detail?: string;
  tableName?: string;
  tableArn?: string;
}

export async function handler(event: PollInfraEvent): Promise<PollInfraResult> {
  const region = process.env.AWS_REGION || 'us-east-1';
  const environment = process.env.NODE_ENV || 'dev';
  const projectName = process.env.PROJECT_NAME || 'app';
  const cwClient = new CloudWatchClient({ region });
  const startTime = Date.now();

  logger.log(`[${event.executionId}] Polling infra status for account ${event.accountId}`);

  try {
    const cloudType = event.cloudType || 'public';

    let result: PollInfraResult;

    if (cloudType === 'private') {
      result = await pollCloudFormationStack(region, event, environment, projectName);
    } else {
      result = await pollPublicAccount(region, event);
    }

    await emitMetric(cwClient, projectName, 'PollSuccess', Date.now() - startTime);

    // Pass through fields for Step Functions downstream steps
    return {
      ...result,
      accountName: event.accountName,
      cloudType: event.cloudType,
      executionId: event.executionId,
    };
  } catch (error: any) {
    await emitMetric(cwClient, projectName, 'PollFailure', Date.now() - startTime);
    logger.error(`[${event.executionId}] Poll failed: ${error.message}`);
    throw error;
  }
}

async function pollPublicAccount(
  region: string,
  event: PollInfraEvent,
): Promise<PollInfraResult> {
  const ssmClient = new SSMClient({ region });

  try {
    const param = await ssmClient.send(
      new GetParameterCommand({
        Name: `/accounts/${event.accountId}/provisioning-status`,
      }),
    );

    const ssmStatus = param.Parameter?.Value || 'unknown';

    const statusMap: Record<string, PollInfraResult['status']> = {
      active: 'READY',
      creating: 'CREATING',
      deleting: 'DELETING',
      deleted: 'DELETED',
      failed: 'FAILED',
    };

    const status = statusMap[ssmStatus] || 'CREATING';

    logger.log(`[${event.executionId}] Public account SSM status: ${ssmStatus} → ${status}`);

    return {
      accountId: event.accountId,
      executionId: event.executionId,
      status,
      detail: `SSM provisioning-status: ${ssmStatus}`,
    };
  } catch (error: any) {
    if (error.name === 'ParameterNotFound') {
      // If SSM parameter doesn't exist during deletion, it's been cleaned up
      if (event.status === 'DELETING') {
        return {
          accountId: event.accountId,
          executionId: event.executionId,
          status: 'DELETED',
          detail: 'SSM parameters already removed',
        };
      }
      return {
        accountId: event.accountId,
        executionId: event.executionId,
        status: 'CREATING',
        detail: 'SSM parameter not yet created',
      };
    }
    throw error;
  }
}

async function pollCloudFormationStack(
  region: string,
  event: PollInfraEvent,
  environment: string,
  projectName: string,
): Promise<PollInfraResult> {
  const cfnClient = new CloudFormationClient({ region });
  const stackName = event.stackName || `${projectName}-${environment}-account-${event.accountId}`;

  try {
    const describeResult = await retryWithBackoff(
      () => cfnClient.send(new DescribeStacksCommand({ StackName: stackName })),
      { maxAttempts: 2, label: 'DescribeStack-Poll', retryIf: isTransientAwsError },
    );

    const stack = describeResult.Stacks?.[0];
    if (!stack) {
      // Stack doesn't exist — if we're deleting, it's done
      return {
        accountId: event.accountId,
        executionId: event.executionId,
        stackName,
        status: 'DELETED',
        detail: 'Stack not found (already deleted)',
      };
    }

    const cfnStatus = stack.StackStatus || 'UNKNOWN';
    logger.log(`[${event.executionId}] Stack ${stackName} status: ${cfnStatus}`);

    // Map CFN status to our simplified status
    if (cfnStatus === 'CREATE_COMPLETE') {
      // Extract outputs
      const outputs = stack.Outputs || [];
      const tableName = outputs.find((o) => o.OutputKey === 'TableName')?.OutputValue;
      const tableArn = outputs.find((o) => o.OutputKey === 'TableArn')?.OutputValue;

      // Persist table info to SSM
      const ssmClient = new SSMClient({ region });
      if (tableName) {
        await ssmClient.send(
          new PutParameterCommand({
            Name: `/accounts/${event.accountId}/dynamodb/table-name`,
            Value: tableName,
            Type: 'String',
            Overwrite: true,
          }),
        );
        await ssmClient.send(
          new PutParameterCommand({
            Name: `/accounts/${event.accountId}/provisioning-status`,
            Value: 'active',
            Type: 'String',
            Overwrite: true,
          }),
        );
      }

      return {
        accountId: event.accountId,
        executionId: event.executionId,
        stackName,
        status: 'READY',
        detail: `Stack complete: ${cfnStatus}`,
        tableName,
        tableArn,
      };
    }

    if (cfnStatus === 'DELETE_COMPLETE') {
      return {
        accountId: event.accountId,
        executionId: event.executionId,
        stackName,
        status: 'DELETED',
        detail: `Stack deleted: ${cfnStatus}`,
      };
    }

    if (cfnStatus.includes('FAILED') || cfnStatus === 'ROLLBACK_COMPLETE') {
      const reason = stack.StackStatusReason || 'Unknown failure';
      return {
        accountId: event.accountId,
        executionId: event.executionId,
        stackName,
        status: 'FAILED',
        detail: `Stack failed: ${cfnStatus} — ${reason}`,
      };
    }

    // Still in progress (CREATE_IN_PROGRESS, DELETE_IN_PROGRESS, etc.)
    const inProgress = cfnStatus.includes('DELETE') ? 'DELETING' : 'CREATING';
    return {
      accountId: event.accountId,
      executionId: event.executionId,
      stackName,
      status: inProgress as PollInfraResult['status'],
      detail: `Stack in progress: ${cfnStatus}`,
    };
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      return {
        accountId: event.accountId,
        executionId: event.executionId,
        stackName,
        status: 'DELETED',
        detail: 'Stack does not exist',
      };
    }
    throw error;
  }
}

async function emitMetric(
  cwClient: CloudWatchClient,
  projectName: string,
  metricName: string,
  durationMs: number,
): Promise<void> {
  try {
    await cwClient.send(
      new PutMetricDataCommand({
        Namespace: `${projectName}/Workers`,
        MetricData: [
          {
            MetricName: metricName,
            Dimensions: [{ Name: 'Worker', Value: 'poll-infra' }],
            Value: 1,
            Unit: 'Count',
          },
          {
            MetricName: 'WorkerDuration',
            Dimensions: [{ Name: 'Worker', Value: 'poll-infra' }],
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
