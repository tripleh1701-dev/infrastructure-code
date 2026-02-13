import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStacksCommand,
  DeleteStackCommand,
  waitUntilStackCreateComplete,
  waitUntilStackDeleteComplete,
  StackStatus,
} from '@aws-sdk/client-cloudformation';
import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
  DeleteParametersCommand,
} from '@aws-sdk/client-ssm';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { ProvisioningEventsService } from '../events/provisioning-events.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ProvisioningConfig {
  accountId: string;
  accountName: string;
  cloudType: 'public' | 'private';
  billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';
  readCapacity?: number;
  writeCapacity?: number;
  enableAutoScaling?: boolean;
  enablePointInTimeRecovery?: boolean;
  enableDeletionProtection?: boolean;
}

export interface ProvisioningResult {
  success: boolean;
  tableName?: string;
  tableArn?: string;
  stackId?: string;
  cloudType: 'public' | 'private';
  message: string;
}

export interface ProvisioningStatus {
  accountId: string;
  status: 'pending' | 'creating' | 'active' | 'failed' | 'deleting' | 'deleted';
  tableName?: string;
  stackId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Account Provisioner Service
 * 
 * Handles the provisioning of DynamoDB tables for private cloud accounts
 * using AWS CloudFormation. For public cloud accounts, it registers them
 * in the shared table with appropriate SSM parameters.
 * 
 * Publishes events to EventBridge/SNS for external system notifications.
 */
@Injectable()
export class AccountProvisionerService {
  private readonly logger = new Logger(AccountProvisionerService.name);
  private cfnClient: CloudFormationClient;
  private ssmClient: SSMClient;
  private s3Client: S3Client;
  
  private readonly environment: string;
  private readonly projectName: string;
  private readonly templateBucket: string;
  private readonly awsRegion: string;

  constructor(
    private configService: ConfigService,
    private eventsService: ProvisioningEventsService,
  ) {
    this.awsRegion = this.configService.get('AWS_REGION', 'us-east-1');
    this.environment = this.configService.get('NODE_ENV', 'dev');
    this.projectName = this.configService.get('PROJECT_NAME', 'app');
    this.templateBucket = this.configService.get('CFN_TEMPLATE_BUCKET', `${this.projectName}-cfn-templates`);

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const credentials = accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;

    this.cfnClient = new CloudFormationClient({
      region: this.awsRegion,
      credentials,
    });

    this.ssmClient = new SSMClient({
      region: this.awsRegion,
      credentials,
    });

    this.s3Client = new S3Client({
      region: this.awsRegion,
      credentials,
    });
  }

  /**
   * Provision infrastructure for a new account based on cloud type
   */
  async provisionAccount(config: ProvisioningConfig): Promise<ProvisioningResult> {
    this.logger.log(`Provisioning account ${config.accountId} with cloud type: ${config.cloudType}`);
    
    const requestId = uuidv4();
    const startTime = Date.now();

    // Publish started event
    await this.eventsService.publishProvisioningStarted(
      this.eventsService.createStartedPayload(
        config.accountId,
        config.accountName,
        config.cloudType,
        requestId,
      ),
    );

    try {
      const result = config.cloudType === 'public'
        ? await this.provisionPublicAccount(config)
        : await this.provisionPrivateAccount(config);

      // Publish success event
      await this.eventsService.publishProvisioningSuccess(
        this.eventsService.createSuccessPayload(
          config.accountId,
          config.accountName,
          config.cloudType,
          result.tableName || '',
          startTime,
          {
            tableArn: result.tableArn,
            stackId: result.stackId,
            metadata: { requestId },
          },
        ),
      );

      return result;
    } catch (error: any) {
      // Publish failure event
      await this.eventsService.publishProvisioningFailure(
        this.eventsService.createFailurePayload(
          config.accountId,
          config.accountName,
          config.cloudType,
          error,
          startTime,
          { metadata: { requestId } },
        ),
      );

      throw error;
    }
  }

  /**
   * Provision a public cloud account (uses shared table)
   */
  private async provisionPublicAccount(config: ProvisioningConfig): Promise<ProvisioningResult> {
    const sharedTablePrefix = this.configService.get('DYNAMODB_TABLE_PREFIX', 'app_');
    const sharedTableName = `${sharedTablePrefix}data`;

    try {
      // Store account configuration in SSM for consistency
      await this.ssmClient.send(new PutParameterCommand({
        Name: `/accounts/${config.accountId}/cloud-type`,
        Value: 'public',
        Type: 'String',
        Overwrite: true,
        Description: `Cloud type for account ${config.accountId}`,
      }));

      await this.ssmClient.send(new PutParameterCommand({
        Name: `/accounts/${config.accountId}/dynamodb/table-name`,
        Value: sharedTableName,
        Type: 'String',
        Overwrite: true,
        Description: `DynamoDB table for public account ${config.accountId} (shared)`,
      }));

      await this.ssmClient.send(new PutParameterCommand({
        Name: `/accounts/${config.accountId}/provisioning-status`,
        Value: 'active',
        Type: 'String',
        Overwrite: true,
        Description: `Provisioning status for account ${config.accountId}`,
      }));

      this.logger.log(`Public account ${config.accountId} registered in shared table`);

      return {
        success: true,
        tableName: sharedTableName,
        cloudType: 'public',
        message: `Account registered in shared table: ${sharedTableName}`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to register public account: ${error.message}`);
      throw new BadRequestException(`Failed to register account: ${error.message}`);
    }
  }

  /**
   * Provision a private cloud account (creates dedicated table)
   */
  private async provisionPrivateAccount(config: ProvisioningConfig): Promise<ProvisioningResult> {
    const stackName = `${this.projectName}-${this.environment}-account-${config.accountId}`;

    try {
      // Set provisioning status to pending
      await this.updateProvisioningStatus(config.accountId, 'creating');

      // Upload CloudFormation template to S3 if needed
      const templateUrl = await this.ensureTemplateUploaded();

      // Create CloudFormation stack
      const createStackResult = await this.cfnClient.send(new CreateStackCommand({
        StackName: stackName,
        TemplateURL: templateUrl,
        Parameters: [
          { ParameterKey: 'AccountId', ParameterValue: config.accountId },
          { ParameterKey: 'AccountName', ParameterValue: config.accountName },
          { ParameterKey: 'Environment', ParameterValue: this.environment },
          { ParameterKey: 'ProjectName', ParameterValue: this.projectName },
          { ParameterKey: 'BillingMode', ParameterValue: config.billingMode || 'PAY_PER_REQUEST' },
          { ParameterKey: 'ReadCapacity', ParameterValue: String(config.readCapacity || 5) },
          { ParameterKey: 'WriteCapacity', ParameterValue: String(config.writeCapacity || 5) },
          { ParameterKey: 'EnablePointInTimeRecovery', ParameterValue: config.enablePointInTimeRecovery !== false ? 'true' : 'false' },
          { ParameterKey: 'EnableDeletionProtection', ParameterValue: config.enableDeletionProtection !== false ? 'true' : 'false' },
          { ParameterKey: 'EnableAutoScaling', ParameterValue: config.enableAutoScaling ? 'true' : 'false' },
        ],
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
        Tags: [
          { Key: 'AccountId', Value: config.accountId },
          { Key: 'AccountName', Value: config.accountName },
          { Key: 'Environment', Value: this.environment },
          { Key: 'CloudType', Value: 'private' },
          { Key: 'ManagedBy', Value: 'AccountProvisioner' },
        ],
        OnFailure: 'ROLLBACK',
      }));

      const stackId = createStackResult.StackId;
      this.logger.log(`CloudFormation stack created: ${stackId}`);

      // Wait for stack creation to complete
      await waitUntilStackCreateComplete(
        { client: this.cfnClient, maxWaitTime: 600 },
        { StackName: stackName },
      );

      // Get the outputs from the stack
      const describeResult = await this.cfnClient.send(new DescribeStacksCommand({
        StackName: stackName,
      }));

      const stack = describeResult.Stacks?.[0];
      const outputs = stack?.Outputs || [];

      const tableName = outputs.find((o: any) => o.OutputKey === 'TableName')?.OutputValue;
      const tableArn = outputs.find((o: any) => o.OutputKey === 'TableArn')?.OutputValue;

      if (!tableName) {
        throw new Error('Stack created but table name output not found');
      }

      await this.updateProvisioningStatus(config.accountId, 'active');

      this.logger.log(`Private account ${config.accountId} provisioned with table: ${tableName}`);

      return {
        success: true,
        tableName,
        tableArn,
        stackId,
        cloudType: 'private',
        message: `Dedicated table provisioned: ${tableName}`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to provision private account: ${error.message}`);
      await this.updateProvisioningStatus(config.accountId, 'failed', error.message);
      throw new BadRequestException(`Failed to provision private account: ${error.message}`);
    }
  }

  /**
   * Deprovision an account (delete dedicated resources for private accounts)
   */
  async deprovisionAccount(accountId: string, accountName?: string): Promise<void> {
    this.logger.log(`Deprovisioning account ${accountId}`);
    
    const requestId = uuidv4();
    const startTime = Date.now();
    const cloudType = await this.getAccountCloudType(accountId);
    const name = accountName || accountId;

    // Publish started event
    await this.eventsService.publishDeprovisioningStarted(
      this.eventsService.createStartedPayload(accountId, name, cloudType, requestId),
    );

    try {
      // Check if this is a private account with a dedicated stack
      const stackName = `${this.projectName}-${this.environment}-account-${accountId}`;

      try {
        const describeResult = await this.cfnClient.send(new DescribeStacksCommand({
          StackName: stackName,
        }));

        if (describeResult.Stacks?.length) {
          // Delete the CloudFormation stack
          await this.updateProvisioningStatus(accountId, 'deleting');

          await this.cfnClient.send(new DeleteStackCommand({
            StackName: stackName,
          }));

          await waitUntilStackDeleteComplete(
            { client: this.cfnClient, maxWaitTime: 600 },
            { StackName: stackName },
          );

          this.logger.log(`Stack ${stackName} deleted successfully`);
        }
      } catch (error: any) {
        if (error.name !== 'ValidationError') {
          throw error;
        }
        // Stack doesn't exist, might be a public account
      }

      // Clean up SSM parameters
      await this.cleanupSSMParameters(accountId);

      // Publish success event
      await this.eventsService.publishDeprovisioningSuccess(
        this.eventsService.createSuccessPayload(
          accountId,
          name,
          cloudType,
          '', // No table name after deletion
          startTime,
          { metadata: { requestId } },
        ),
      );

      this.logger.log(`Account ${accountId} deprovisioned successfully`);
    } catch (error: any) {
      // Publish failure event
      await this.eventsService.publishDeprovisioningFailure(
        this.eventsService.createFailurePayload(
          accountId,
          name,
          cloudType,
          error,
          startTime,
          { metadata: { requestId } },
        ),
      );

      this.logger.error(`Failed to deprovision account: ${error.message}`);
      throw new BadRequestException(`Failed to deprovision account: ${error.message}`);
    }
  }

  /**
   * Get the cloud type for an account from SSM
   */
  private async getAccountCloudType(accountId: string): Promise<'public' | 'private'> {
    try {
      const result = await this.ssmClient.send(new GetParameterCommand({
        Name: `/accounts/${accountId}/cloud-type`,
      }));
      return (result.Parameter?.Value as 'public' | 'private') || 'public';
    } catch {
      return 'public'; // Default to public if not found
    }
  }

  /**
   * Get provisioning status for an account
   */
  async getProvisioningStatus(accountId: string): Promise<ProvisioningStatus | null> {
    try {
      const [statusResult, tableResult] = await Promise.all([
        this.ssmClient.send(new GetParameterCommand({
          Name: `/accounts/${accountId}/provisioning-status`,
        })).catch(() => null),
        this.ssmClient.send(new GetParameterCommand({
          Name: `/accounts/${accountId}/dynamodb/table-name`,
        })).catch(() => null),
      ]);

      if (!statusResult?.Parameter?.Value) {
        return null;
      }

      return {
        accountId,
        status: statusResult.Parameter.Value as ProvisioningStatus['status'],
        tableName: tableResult?.Parameter?.Value,
        createdAt: statusResult.Parameter.LastModifiedDate?.toISOString() || '',
        updatedAt: statusResult.Parameter.LastModifiedDate?.toISOString() || '',
      };
    } catch {
      return null;
    }
  }


  /**
   * Update provisioning status in SSM
   */
  private async updateProvisioningStatus(
    accountId: string,
    status: ProvisioningStatus['status'],
    error?: string,
  ): Promise<void> {
    await this.ssmClient.send(new PutParameterCommand({
      Name: `/accounts/${accountId}/provisioning-status`,
      Value: status,
      Type: 'String',
      Overwrite: true,
    }));

    if (error) {
      await this.ssmClient.send(new PutParameterCommand({
        Name: `/accounts/${accountId}/provisioning-error`,
        Value: error,
        Type: 'String',
        Overwrite: true,
      }));
    }
  }

  /**
   * Clean up SSM parameters for an account
   */
  private async cleanupSSMParameters(accountId: string): Promise<void> {
    const parameterNames = [
      `/accounts/${accountId}/cloud-type`,
      `/accounts/${accountId}/dynamodb/table-name`,
      `/accounts/${accountId}/dynamodb/table-arn`,
      `/accounts/${accountId}/dynamodb/stream-arn`,
      `/accounts/${accountId}/provisioning-status`,
      `/accounts/${accountId}/provisioning-error`,
    ];

    try {
      await this.ssmClient.send(new DeleteParametersCommand({
        Names: parameterNames,
      }));
    } catch (error: any) {
      this.logger.warn(`Error cleaning up SSM parameters: ${error.message}`);
    }
  }

  /**
   * Ensure CloudFormation template is uploaded to S3
   */
  private async ensureTemplateUploaded(): Promise<string> {
    const templateKey = `${this.environment}/private-account-dynamodb.yaml`;
    const templateUrl = `https://${this.templateBucket}.s3.${this.awsRegion}.amazonaws.com/${templateKey}`;

    try {
      // Check if template exists
      await this.s3Client.send(new GetObjectCommand({
        Bucket: this.templateBucket,
        Key: templateKey,
      }));
      return templateUrl;
    } catch {
      // Template doesn't exist, upload it
      const templatePath = path.join(__dirname, '../../../../cloudformation/private-account-dynamodb.yaml');
      const templateBody = fs.readFileSync(templatePath, 'utf-8');

      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.templateBucket,
        Key: templateKey,
        Body: templateBody,
        ContentType: 'text/yaml',
      }));

      this.logger.log(`CloudFormation template uploaded to ${templateUrl}`);
      return templateUrl;
    }
  }

  /**
   * Check if CloudFormation stack exists for an account
   */
  async stackExists(accountId: string): Promise<boolean> {
    const stackName = `${this.projectName}-${this.environment}-account-${accountId}`;

    try {
      const result = await this.cfnClient.send(new DescribeStacksCommand({
        StackName: stackName,
      }));

      const stack = result.Stacks?.[0];
      if (!stack) return false;

      // Check if stack is in a valid state
      const activeStates: StackStatus[] = [
        'CREATE_COMPLETE',
        'UPDATE_COMPLETE',
        'UPDATE_ROLLBACK_COMPLETE',
      ];

      return activeStates.includes(stack.StackStatus as StackStatus);
    } catch {
      return false;
    }
  }
}
