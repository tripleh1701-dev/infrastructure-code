/**
 * Provisioning Service
 * 
 * Handles account infrastructure provisioning via the NestJS backend.
 * This service communicates with the AccountProvisionerService which manages:
 * - CloudFormation stack creation for private accounts
 * - Shared table access configuration for public accounts
 * - SSM Parameter Store registration for table routing
 * - EventBridge/SNS notifications for provisioning events
 */

import { httpClient } from '../http-client';
import { API_CONFIG, isExternalApi } from '../config';
import type { 
  ApiResponse, 
  ProvisioningJob, 
  StartProvisioningInput,
  ProvisioningEvent,
  BackendProvisioningJob,
  BackendProvisioningStatus,
  ProvisioningResource,
} from '../types';

// Endpoints
const ENDPOINTS = {
  provisioning: '/provisioning',
  provisioningStatus: (accountId: string) => `/provisioning/${accountId}/status`,
  provisioningEvents: (accountId: string) => `/provisioning/${accountId}/events`,
  deprovision: (accountId: string) => `/provisioning/${accountId}`,
};

/**
 * Map backend resource DTO to frontend ProvisioningResource
 */
function mapBackendResource(r: BackendProvisioningJob['resources'][number]): ProvisioningResource {
  return {
    logicalId: r.name,
    type: r.type,
    status: r.status === 'active' ? 'CREATE_COMPLETE' 
         : r.status === 'creating' ? 'CREATE_IN_PROGRESS'
         : r.status === 'failed' ? 'CREATE_FAILED'
         : r.status === 'deleting' ? 'DELETE_IN_PROGRESS'
         : 'NOT_STARTED',
    physicalId: r.arn,
  };
}

/**
 * Map backend ProvisioningJobDto to frontend ProvisioningJob
 */
function mapBackendJob(job: BackendProvisioningJob): ProvisioningJob {
  return {
    id: job.id,
    accountId: job.accountId,
    accountName: job.accountName,
    cloudType: job.cloudType === 'hybrid' ? 'private' : job.cloudType,
    status: job.status,
    message: job.message,
    progress: job.progress,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    stackId: job.stackId,
    resources: job.resources?.map(mapBackendResource) || [],
  };
}

/**
 * Map backend ProvisioningStatusDto to frontend ProvisioningJob
 */
function mapBackendStatus(status: BackendProvisioningStatus): ProvisioningJob {
  return {
    id: status.accountId, // Status DTO doesn't have a separate id
    accountId: status.accountId,
    accountName: status.accountName,
    cloudType: status.cloudType === 'hybrid' ? 'private' : status.cloudType,
    status: status.status,
    message: status.message,
    progress: status.progress,
    startedAt: status.startedAt,
    completedAt: status.completedAt,
    stackId: status.stackId,
    error: status.error,
    resources: status.resources?.map(mapBackendResource) || [],
  };
}

/**
 * Start infrastructure provisioning for a new account
 */
export async function startProvisioning(
  input: StartProvisioningInput
): Promise<ApiResponse<ProvisioningJob>> {
  if (!isExternalApi()) {
    return simulateStartProvisioning(input);
  }

  const response = await httpClient.post<BackendProvisioningJob>(ENDPOINTS.provisioning, input);
  if (response.error || !response.data) return { data: null as any, error: response.error };
  return { data: mapBackendJob(response.data), error: null };
}

/**
 * Get current provisioning status for an account
 */
export async function getProvisioningStatus(
  accountId: string
): Promise<ApiResponse<ProvisioningJob>> {
  if (!isExternalApi()) {
    return simulateGetStatus(accountId);
  }

  const response = await httpClient.get<BackendProvisioningStatus>(ENDPOINTS.provisioningStatus(accountId));
  if (response.error || !response.data) return { data: null as any, error: response.error };
  return { data: mapBackendStatus(response.data), error: null };
}

/**
 * Get provisioning events/history for an account
 */
export async function getProvisioningEvents(
  accountId: string
): Promise<ApiResponse<ProvisioningEvent[]>> {
  if (!isExternalApi()) {
    return { data: [], error: null };
  }

  return httpClient.get<ProvisioningEvent[]>(ENDPOINTS.provisioningEvents(accountId));
}

/**
 * Cancel/cleanup provisioning for an account (deprovision)
 */
export async function deprovision(
  accountId: string
): Promise<ApiResponse<{ success: boolean }>> {
  if (!isExternalApi()) {
    return { data: { success: true }, error: null };
  }

  return httpClient.delete<{ success: boolean }>(ENDPOINTS.deprovision(accountId));
}

// ============= Simulation for development/fallback =============

const simulatedJobs = new Map<string, ProvisioningJob & { startTime: number }>();

function simulateStartProvisioning(input: StartProvisioningInput): ApiResponse<ProvisioningJob> {
  const job: ProvisioningJob & { startTime: number } = {
    id: crypto.randomUUID(),
    accountId: input.accountId,
    accountName: input.accountName,
    cloudType: input.cloudType,
    status: 'pending',
    message: 'Queued for provisioning...',
    stackId: `arn:aws:cloudformation:us-east-1:123456789:stack/${input.accountId}-stack/${crypto.randomUUID()}`,
    stackName: `${input.accountId}-infrastructure`,
    region: 'us-east-1',
    startedAt: new Date().toISOString(),
    progress: 0,
    startTime: Date.now(),
    resources: [],
  };

  simulatedJobs.set(input.accountId, job);

  if (API_CONFIG.debug) {
    console.log(`[Provisioning] Started job for ${input.accountName} (${input.cloudType})`);
  }

  return { data: job, error: null };
}

function simulateGetStatus(accountId: string): ApiResponse<ProvisioningJob> {
  const job = simulatedJobs.get(accountId);
  
  if (!job) {
    return { 
      data: null, 
      error: { message: 'Provisioning job not found', code: 'NOT_FOUND', status: 404 } 
    };
  }

  // Calculate progress based on elapsed time
  const elapsedMs = Date.now() - job.startTime;
  const totalDuration = job.cloudType === 'private' ? 15000 : 8000;
  const progress = Math.min(100, Math.floor((elapsedMs / totalDuration) * 100));

  // Deterministic failure simulation (for demo)
  const shouldFail = job.id.charCodeAt(0) % 20 === 7;

  // Update job status based on progress
  const updatedJob = updateJobPhase(job, progress, shouldFail);
  simulatedJobs.set(accountId, updatedJob);

  return { data: updatedJob, error: null };
}

function updateJobPhase(
  job: ProvisioningJob & { startTime: number }, 
  progress: number, 
  shouldFail: boolean
): ProvisioningJob & { startTime: number } {
  const isPrivate = job.cloudType === 'private';
  
  let status: ProvisioningJob['status'] = 'in_progress';
  let message = job.message;
  let error: string | undefined;
  let completedAt: string | undefined;
  let resources: ProvisioningJob['resources'] = [];

  if (progress < 10) {
    message = 'Initializing CloudFormation stack...';
    resources = [
      { logicalId: 'Stack', type: 'AWS::CloudFormation::Stack', status: 'CREATE_IN_PROGRESS' }
    ];
  } else if (progress < 25) {
    message = isPrivate 
      ? 'Creating dedicated DynamoDB table...' 
      : 'Configuring shared table access...';
    resources = [
      { logicalId: 'Stack', type: 'AWS::CloudFormation::Stack', status: 'CREATE_IN_PROGRESS' },
      { logicalId: 'DynamoDBTable', type: 'AWS::DynamoDB::Table', status: 'CREATE_IN_PROGRESS' }
    ];
  } else if (progress < 50) {
    message = 'Setting up IAM roles and policies...';
    resources = [
      { logicalId: 'Stack', type: 'AWS::CloudFormation::Stack', status: 'CREATE_IN_PROGRESS' },
      { logicalId: 'DynamoDBTable', type: 'AWS::DynamoDB::Table', status: 'CREATE_COMPLETE' },
      { logicalId: 'IAMRole', type: 'AWS::IAM::Role', status: 'CREATE_IN_PROGRESS' }
    ];
  } else if (progress < 70) {
    message = isPrivate
      ? 'Provisioning Global Secondary Indexes...'
      : 'Configuring tenant isolation...';
    resources = [
      { logicalId: 'Stack', type: 'AWS::CloudFormation::Stack', status: 'CREATE_IN_PROGRESS' },
      { logicalId: 'DynamoDBTable', type: 'AWS::DynamoDB::Table', status: 'CREATE_COMPLETE' },
      { logicalId: 'IAMRole', type: 'AWS::IAM::Role', status: 'CREATE_COMPLETE' },
      { logicalId: 'GSIEntity', type: 'AWS::DynamoDB::GlobalSecondaryIndex', status: 'CREATE_IN_PROGRESS' }
    ];
  } else if (progress < 85) {
    if (shouldFail) {
      status = 'failed';
      message = 'Stack creation failed';
      error = 'CREATE_FAILED: Resource limit exceeded for DynamoDB tables in region us-east-1';
      completedAt = new Date().toISOString();
    } else {
      message = 'Registering table in SSM Parameter Store...';
      resources = [
        { logicalId: 'Stack', type: 'AWS::CloudFormation::Stack', status: 'CREATE_IN_PROGRESS' },
        { logicalId: 'DynamoDBTable', type: 'AWS::DynamoDB::Table', status: 'CREATE_COMPLETE' },
        { logicalId: 'IAMRole', type: 'AWS::IAM::Role', status: 'CREATE_COMPLETE' },
        { logicalId: 'GSIEntity', type: 'AWS::DynamoDB::GlobalSecondaryIndex', status: 'CREATE_COMPLETE' },
        { logicalId: 'SSMParameter', type: 'AWS::SSM::Parameter', status: 'CREATE_IN_PROGRESS' }
      ];
    }
  } else if (progress < 100) {
    message = 'Finalizing configuration...';
    resources = [
      { logicalId: 'Stack', type: 'AWS::CloudFormation::Stack', status: 'CREATE_IN_PROGRESS' },
      { logicalId: 'DynamoDBTable', type: 'AWS::DynamoDB::Table', status: 'CREATE_COMPLETE' },
      { logicalId: 'IAMRole', type: 'AWS::IAM::Role', status: 'CREATE_COMPLETE' },
      { logicalId: 'GSIEntity', type: 'AWS::DynamoDB::GlobalSecondaryIndex', status: 'CREATE_COMPLETE' },
      { logicalId: 'SSMParameter', type: 'AWS::SSM::Parameter', status: 'CREATE_COMPLETE' }
    ];
  } else {
    status = 'completed';
    message = `${isPrivate ? 'Dedicated' : 'Shared'} infrastructure ready`;
    completedAt = new Date().toISOString();
    resources = [
      { logicalId: 'Stack', type: 'AWS::CloudFormation::Stack', status: 'CREATE_COMPLETE' },
      { logicalId: 'DynamoDBTable', type: 'AWS::DynamoDB::Table', status: 'CREATE_COMPLETE', physicalId: `${job.accountId}-table` },
      { logicalId: 'IAMRole', type: 'AWS::IAM::Role', status: 'CREATE_COMPLETE' },
      { logicalId: 'GSIEntity', type: 'AWS::DynamoDB::GlobalSecondaryIndex', status: 'CREATE_COMPLETE' },
      { logicalId: 'SSMParameter', type: 'AWS::SSM::Parameter', status: 'CREATE_COMPLETE', physicalId: `/platform/accounts/${job.accountId}/table` }
    ];
  }

  return {
    ...job,
    status,
    message,
    progress,
    error,
    completedAt,
    resources,
  };
}

// Cleanup completed jobs periodically
setInterval(() => {
  const now = Date.now();
  simulatedJobs.forEach((job, accountId) => {
    if (job.completedAt) {
      const completedTime = new Date(job.completedAt).getTime();
      if (now - completedTime > 120000) { // 2 minutes
        simulatedJobs.delete(accountId);
      }
    }
  });
}, 60000);
