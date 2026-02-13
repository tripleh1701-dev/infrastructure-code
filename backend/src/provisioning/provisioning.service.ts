import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountProvisionerService, ProvisioningStatus } from '../common/dynamodb/account-provisioner.service';
import { CloudWatchMetricsService } from '../common/metrics/cloudwatch-metrics.service';
import { CreateProvisioningDto } from './dto/create-provisioning.dto';
import { ProvisioningJobDto, ProvisioningResourceDto, ProvisioningStatusDto } from './dto/provisioning-status.dto';
import {
  CloudFormationClient,
  DescribeStacksCommand,
  DescribeStackResourcesCommand,
} from '@aws-sdk/client-cloudformation';
import { v4 as uuidv4 } from 'uuid';

// In-memory store for active provisioning jobs (in production, use Redis/DynamoDB)
const provisioningJobs = new Map<string, ProvisioningJobDto>();

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);
  private cfnClient: CloudFormationClient;
  private readonly environment: string;
  private readonly projectName: string;

  constructor(
    private configService: ConfigService,
    private accountProvisioner: AccountProvisionerService,
    private metricsService: CloudWatchMetricsService,
  ) {
    const awsRegion = this.configService.get('AWS_REGION', 'us-east-1');
    this.environment = this.configService.get('NODE_ENV', 'dev');
    this.projectName = this.configService.get('PROJECT_NAME', 'app');

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const credentials = accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;

    this.cfnClient = new CloudFormationClient({
      region: awsRegion,
      ...(credentials && { credentials }),
    });
  }

  /**
   * Start provisioning infrastructure for an account
   */
  async startProvisioning(dto: CreateProvisioningDto): Promise<ProvisioningJobDto> {
    this.logger.log(`Starting provisioning for account: ${dto.accountId}`);

    // Check if there's already an active provisioning job
    const existingJob = provisioningJobs.get(dto.accountId);
    if (existingJob && ['pending', 'in_progress'].includes(existingJob.status)) {
      throw new BadRequestException(`Provisioning already in progress for account ${dto.accountId}`);
    }

    // Create a new provisioning job
    const job: ProvisioningJobDto = {
      id: uuidv4(),
      accountId: dto.accountId,
      accountName: dto.accountName,
      cloudType: dto.cloudType === 'hybrid' ? 'private' : dto.cloudType,
      status: 'pending',
      message: 'Initializing provisioning...',
      progress: 0,
      startedAt: new Date().toISOString(),
      resources: this.getInitialResources(dto.cloudType),
    };

    provisioningJobs.set(dto.accountId, job);

    // Start async provisioning (don't await - let it run in background)
    this.executeProvisioning(dto, job).catch((error) => {
      this.logger.error(`Provisioning failed for ${dto.accountId}: ${error.message}`);
    });

    return job;
  }

  /**
   * Get provisioning status for an account
   */
  async getProvisioningStatus(accountId: string): Promise<ProvisioningStatusDto> {
    // First check in-memory jobs
    const job = provisioningJobs.get(accountId);
    
    if (job) {
      // If job is in progress, poll CloudFormation for updates
      if (job.status === 'in_progress' && job.stackId) {
        await this.updateJobFromCloudFormation(job);
      }

      return this.jobToStatusDto(job);
    }

    // Check SSM for historical status
    const ssmStatus = await this.accountProvisioner.getProvisioningStatus(accountId);
    
    if (!ssmStatus) {
      throw new NotFoundException(`No provisioning status found for account ${accountId}`);
    }

    return this.ssmStatusToDto(ssmStatus);
  }

  /**
   * Get all active provisioning jobs
   */
  async getActiveJobs(): Promise<ProvisioningJobDto[]> {
    return Array.from(provisioningJobs.values()).filter(
      (job) => ['pending', 'in_progress'].includes(job.status),
    );
  }

  /**
   * Cancel/deprovision an account
   */
  async deprovision(accountId: string): Promise<{ message: string }> {
    this.logger.log(`Starting deprovisioning for account: ${accountId}`);
    const startTime = Date.now();

    const job = provisioningJobs.get(accountId);
    if (job && job.status === 'in_progress') {
      throw new BadRequestException('Cannot deprovision while provisioning is in progress');
    }

    const cloudType = (job?.cloudType === 'public' ? 'public' : 'private') as 'public' | 'private';

    try {
      await this.accountProvisioner.deprovisionAccount(accountId);

      // Remove from in-memory store
      provisioningJobs.delete(accountId);

      const durationMs = Date.now() - startTime;

      // ── Emit success metrics ──────────────────────────────────────────
      await this.metricsService.emitDeprovisioningMetrics({
        accountId,
        cloudType,
        success: true,
        durationMs,
      });

      return { message: `Account ${accountId} deprovisioned successfully` };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      // ── Emit failure metrics ──────────────────────────────────────────
      await this.metricsService.emitDeprovisioningMetrics({
        accountId,
        cloudType,
        success: false,
        durationMs,
        errorCode: error.code || error.name || 'UnknownError',
      });

      throw error;
    }
  }

  /**
   * Execute the actual provisioning (runs async)
   */
  private async executeProvisioning(dto: CreateProvisioningDto, job: ProvisioningJobDto): Promise<void> {
    const startTime = Date.now();
    const resolvedCloudType = dto.cloudType === 'hybrid' ? 'private' : dto.cloudType;

    try {
      // Update status to in_progress
      job.status = 'in_progress';
      job.message = 'Creating infrastructure...';
      job.progress = 10;

      const result = await this.accountProvisioner.provisionAccount({
        accountId: dto.accountId,
        accountName: dto.accountName,
        cloudType: resolvedCloudType,
        billingMode: dto.billingMode,
        readCapacity: dto.readCapacity,
        writeCapacity: dto.writeCapacity,
        enableAutoScaling: dto.enableAutoScaling,
        enablePointInTimeRecovery: dto.enablePointInTimeRecovery,
        enableDeletionProtection: dto.enableDeletionProtection,
      });

      const durationMs = Date.now() - startTime;

      // Update job with success
      job.status = 'completed';
      job.message = result.message;
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      job.stackId = result.stackId;
      
      // Update resource statuses
      job.resources = job.resources.map((r) => ({
        ...r,
        status: 'active' as const,
        arn: r.type === 'dynamodb' ? result.tableArn : undefined,
      }));

      this.logger.log(
        `Provisioning completed for account: ${dto.accountId} (${durationMs}ms)`,
      );

      // ── Emit success metrics ────────────────────────────────────────────
      await this.metricsService.emitProvisioningMetrics({
        accountId: dto.accountId,
        cloudType: resolvedCloudType as 'public' | 'private',
        success: true,
        durationMs,
        resourceCount: job.resources.length,
      });
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      job.status = 'failed';
      job.message = error.message;
      job.completedAt = new Date().toISOString();
      
      // Mark resources as failed
      job.resources = job.resources.map((r) => ({
        ...r,
        status: r.status === 'active' ? 'active' : 'failed' as const,
      }));

      this.logger.error(
        `Provisioning failed for account ${dto.accountId} after ${durationMs}ms: ${error.message}`,
      );

      // ── Emit failure metrics ────────────────────────────────────────────
      await this.metricsService.emitProvisioningMetrics({
        accountId: dto.accountId,
        cloudType: resolvedCloudType as 'public' | 'private',
        success: false,
        durationMs,
        errorCode: error.code || error.name || 'UnknownError',
      });
    }
  }

  /**
   * Update job status from CloudFormation stack
   */
  private async updateJobFromCloudFormation(job: ProvisioningJobDto): Promise<void> {
    if (!job.stackId) return;

    const stackName = `${this.projectName}-${this.environment}-account-${job.accountId}`;

    try {
      const [stackResult, resourcesResult] = await Promise.all([
        this.cfnClient.send(new DescribeStacksCommand({ StackName: stackName })),
        this.cfnClient.send(new DescribeStackResourcesCommand({ StackName: stackName })),
      ]);

      const stack = stackResult.Stacks?.[0];
      const resources = resourcesResult.StackResources || [];

      if (stack) {
        const status = stack.StackStatus;
        
        // Map CloudFormation status to job status
        if (status?.includes('COMPLETE') && !status.includes('ROLLBACK')) {
          job.status = 'completed';
          job.progress = 100;
          job.message = 'Infrastructure ready';
          job.completedAt = new Date().toISOString();
        } else if (status?.includes('FAILED') || status?.includes('ROLLBACK')) {
          job.status = 'failed';
          job.message = stack.StackStatusReason || 'Provisioning failed';
          job.completedAt = new Date().toISOString();
        } else if (status?.includes('IN_PROGRESS')) {
          job.status = 'in_progress';
          job.progress = this.calculateProgress(resources);
          job.message = this.getProgressMessage(resources);
        }

        // Update resource statuses
        job.resources = this.mapResourcesToDto(resources, job.cloudType);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to get CloudFormation status: ${error.message}`);
    }
  }

  /**
   * Calculate progress percentage from resources
   */
  private calculateProgress(resources: any[]): number {
    if (resources.length === 0) return 10;
    
    const completed = resources.filter(
      (r) => r.ResourceStatus?.includes('COMPLETE') && !r.ResourceStatus.includes('ROLLBACK'),
    ).length;
    
    return Math.min(95, 10 + Math.floor((completed / resources.length) * 85));
  }

  /**
   * Get progress message from resources
   */
  private getProgressMessage(resources: any[]): string {
    const inProgress = resources.find((r) => r.ResourceStatus?.includes('IN_PROGRESS'));
    if (inProgress) {
      const type = inProgress.ResourceType?.replace('AWS::', '').replace('::', ' ');
      return `Creating ${type}...`;
    }
    return 'Provisioning in progress...';
  }

  /**
   * Map CloudFormation resources to DTOs
   */
  private mapResourcesToDto(resources: any[], cloudType: string): ProvisioningResourceDto[] {
    return resources.map((r) => ({
      type: this.getResourceType(r.ResourceType),
      name: r.LogicalResourceId || r.PhysicalResourceId || 'Unknown',
      status: this.mapResourceStatus(r.ResourceStatus),
      arn: r.PhysicalResourceId,
    }));
  }

  /**
   * Get resource type from CloudFormation type
   */
  private getResourceType(cfnType: string): ProvisioningResourceDto['type'] {
    if (cfnType?.includes('DynamoDB')) return 'dynamodb';
    if (cfnType?.includes('IAM')) return 'iam';
    if (cfnType?.includes('SSM')) return 'ssm';
    return 'cloudformation';
  }

  /**
   * Map CloudFormation status to our status
   */
  private mapResourceStatus(cfnStatus: string): ProvisioningResourceDto['status'] {
    if (cfnStatus?.includes('COMPLETE') && !cfnStatus.includes('ROLLBACK')) return 'active';
    if (cfnStatus?.includes('FAILED') || cfnStatus?.includes('ROLLBACK')) return 'failed';
    if (cfnStatus?.includes('DELETE')) return 'deleting';
    if (cfnStatus?.includes('IN_PROGRESS')) return 'creating';
    return 'pending';
  }

  /**
   * Get initial resources based on cloud type
   */
  private getInitialResources(cloudType: string): ProvisioningResourceDto[] {
    if (cloudType === 'public') {
      return [
        { type: 'ssm', name: 'Account Parameters', status: 'pending' },
      ];
    }

    return [
      { type: 'cloudformation', name: 'Infrastructure Stack', status: 'pending' },
      { type: 'dynamodb', name: 'Data Table', status: 'pending' },
      { type: 'iam', name: 'Access Roles', status: 'pending' },
      { type: 'ssm', name: 'Configuration Parameters', status: 'pending' },
    ];
  }

  /**
   * Convert job to status DTO
   */
  private jobToStatusDto(job: ProvisioningJobDto): ProvisioningStatusDto {
    return {
      accountId: job.accountId,
      accountName: job.accountName,
      cloudType: job.cloudType,
      status: job.status,
      message: job.message,
      progress: job.progress,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      stackId: job.stackId,
      resources: job.resources,
    };
  }

  /**
   * Convert SSM status to DTO
   */
  private ssmStatusToDto(status: ProvisioningStatus): ProvisioningStatusDto {
    return {
      accountId: status.accountId,
      accountName: status.accountId, // SSM doesn't store name
      cloudType: 'private', // Default, SSM would need to store this
      status: this.mapSsmStatus(status.status),
      message: status.error || `Status: ${status.status}`,
      progress: status.status === 'active' ? 100 : 0,
      startedAt: status.createdAt,
      completedAt: status.status === 'active' ? status.updatedAt : undefined,
      tableName: status.tableName,
      stackId: status.stackId,
      resources: [],
      error: status.error,
    };
  }

  /**
   * Map SSM status to our status
   */
  private mapSsmStatus(ssmStatus: string): ProvisioningStatusDto['status'] {
    switch (ssmStatus) {
      case 'active': return 'completed';
      case 'creating': return 'in_progress';
      case 'deleting': return 'in_progress';
      case 'failed': return 'failed';
      default: return 'pending';
    }
  }
}
