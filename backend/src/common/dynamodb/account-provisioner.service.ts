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
import {
  STSClient,
  AssumeRoleCommand,
  GetCallerIdentityCommand,
} from '@aws-sdk/client-sts';
import { ProvisioningEventsService } from '../events/provisioning-events.service';
import { resolveAwsCredentials } from '../utils/aws-credentials';
import { retryWithBackoff, isTransientAwsError } from '../utils/retry';
import { PRIVATE_ACCOUNT_DYNAMODB_TEMPLATE } from '../cloudformation/private-account-template';
import { v4 as uuidv4 } from 'uuid';
import { CloudType } from '../types/cloud-type';

interface AssumedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

export interface ProvisioningConfig {
  accountId: string;
  accountName: string;
  cloudType: CloudType;
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
  cloudType: CloudType;
  message: string;
  inProgress?: boolean; // true when stack creation is still ongoing (async)
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
  private stsClient: STSClient;
  
  private readonly environment: string;
  private readonly projectName: string;
  private readonly templateBucket: string;
  private readonly awsRegion: string;
  private readonly dataPlaneRoleArn: string | undefined;
  private readonly cfnExecutionRoleArn: string | undefined;

  // Cache for assumed credentials (keyed by accountId)
  private assumedCredentialsCache = new Map<string, AssumedCredentials>();
  private readonly CREDENTIALS_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 min buffer

  constructor(
    private configService: ConfigService,
    private eventsService: ProvisioningEventsService,
  ) {
    this.awsRegion = this.configService.get('AWS_REGION', 'us-east-1');
    this.environment = this.configService.get('NODE_ENV', 'dev');
    this.projectName = this.configService.get('PROJECT_NAME', 'app');
    this.templateBucket = this.configService.get('CFN_TEMPLATE_BUCKET', `${this.projectName}-cfn-templates`);
    this.dataPlaneRoleArn = this.configService.get<string>('DATA_PLANE_ROLE_ARN');
    this.cfnExecutionRoleArn = this.configService.get<string>('CFN_EXECUTION_ROLE_ARN');

    const credentials = resolveAwsCredentials(
      this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
    );

    // Platform Admin account clients (for S3 template uploads, etc.)
    this.cfnClient = new CloudFormationClient({
      region: this.awsRegion,
      ...(credentials && { credentials }),
    });

    this.ssmClient = new SSMClient({
      region: this.awsRegion,
      ...(credentials && { credentials }),
    });

    this.s3Client = new S3Client({
      region: this.awsRegion,
      ...(credentials && { credentials }),
    });

    this.stsClient = new STSClient({
      region: this.awsRegion,
      ...(credentials && { credentials }),
    });

    if (!this.dataPlaneRoleArn) {
      this.logger.warn('DATA_PLANE_ROLE_ARN not set — private account provisioning is blocked to prevent provisioning in Platform Admin account');
    } else {
      this.logger.log(`AccountProvisioner initialized. Data-plane role: ${this.dataPlaneRoleArn}`);
    }
  }

  // =============================================================================
  // Cross-Account Credential Management
  // =============================================================================

  /**
   * Assume the DATA_PLANE_ROLE_ARN to get temporary credentials for
   * accessing the customer AWS account (CloudFormation, DynamoDB, SSM).
   */
  private async assumeDataPlaneRole(accountId: string): Promise<AssumedCredentials> {
    const cached = this.assumedCredentialsCache.get(accountId);
    if (cached && cached.expiration.getTime() - Date.now() > this.CREDENTIALS_REFRESH_BUFFER_MS) {
      return cached;
    }

    if (!this.dataPlaneRoleArn) {
      throw new Error('DATA_PLANE_ROLE_ARN is not configured — cannot assume cross-account role for provisioning');
    }

    this.logger.debug(`Assuming data-plane role for account ${accountId}`);

    const result = await this.stsClient.send(new AssumeRoleCommand({
      RoleArn: this.dataPlaneRoleArn,
      RoleSessionName: `provisioner-${accountId}-${Date.now()}`,
      DurationSeconds: 3600,
      Tags: [
        { Key: 'AccountId', Value: accountId },
        { Key: 'Service', Value: 'AccountProvisioner' },
      ],
    }));

    if (!result.Credentials) {
      throw new Error(`Failed to assume role ${this.dataPlaneRoleArn} for account ${accountId}`);
    }

    const assumed: AssumedCredentials = {
      accessKeyId: result.Credentials.AccessKeyId!,
      secretAccessKey: result.Credentials.SecretAccessKey!,
      sessionToken: result.Credentials.SessionToken!,
      expiration: result.Credentials.Expiration!,
    };

    this.assumedCredentialsCache.set(accountId, assumed);

    // Verify which AWS account we landed in
    const identityClient = new STSClient({
      region: this.awsRegion,
      credentials: {
        accessKeyId: assumed.accessKeyId,
        secretAccessKey: assumed.secretAccessKey,
        sessionToken: assumed.sessionToken,
      },
    });
    const identity = await identityClient.send(new GetCallerIdentityCommand({}));
    this.logger.log(
      `[CrossAccount] Assumed role for tenant ${accountId} → ` +
      `AWS Account: ${identity.Account}, ` +
      `ARN: ${identity.Arn}, ` +
      `expires: ${assumed.expiration.toISOString()}`,
    );

    return assumed;
  }

  /**
   * Get a CloudFormation client with cross-account credentials (customer account).
   * Throws if DATA_PLANE_ROLE_ARN is not configured to prevent provisioning in Platform Admin account.
   */
  private async getCrossAccountCfnClient(accountId: string): Promise<CloudFormationClient> {
    if (!this.dataPlaneRoleArn) {
      throw new BadRequestException(
        'DATA_PLANE_ROLE_ARN is required for private account provisioning. Refusing to create CloudFormation stack in Platform Admin account.',
      );
    }

    const assumed = await this.assumeDataPlaneRole(accountId);
    return new CloudFormationClient({
      region: this.awsRegion,
      credentials: {
        accessKeyId: assumed.accessKeyId,
        secretAccessKey: assumed.secretAccessKey,
        sessionToken: assumed.sessionToken,
      },
    });
  }

  /**
   * Get an SSM client with cross-account credentials (customer account).
   * Throws if DATA_PLANE_ROLE_ARN is not configured to prevent writes in Platform Admin account.
   */
  private async getCrossAccountSsmClient(accountId: string): Promise<SSMClient> {
    if (!this.dataPlaneRoleArn) {
      throw new BadRequestException(
        'DATA_PLANE_ROLE_ARN is required for private account provisioning. Refusing to write customer-account parameters from Platform Admin account.',
      );
    }

    const assumed = await this.assumeDataPlaneRole(accountId);
    return new SSMClient({
      region: this.awsRegion,
      credentials: {
        accessKeyId: assumed.accessKeyId,
        secretAccessKey: assumed.secretAccessKey,
        sessionToken: assumed.sessionToken,
      },
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
    // Use explicit public customer table name — NOT the control plane table.
    // This is the shared DynamoDB table in the customer AWS account for all public accounts.
    // Falls back to DATA_PLANE_TABLE_NAME (set by Terraform), then to a convention-based default.
    const publicTableName = this.configService.get('PUBLIC_ACCOUNT_TABLE_NAME')
      || this.configService.get('DATA_PLANE_TABLE_NAME')
      || `account-admin-public-${this.environment}`;

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
        Value: publicTableName,
        Type: 'String',
        Overwrite: true,
        Description: `DynamoDB table for public account ${config.accountId} (shared customer table)`,
      }));

      await this.ssmClient.send(new PutParameterCommand({
        Name: `/accounts/${config.accountId}/provisioning-status`,
        Value: 'active',
        Type: 'String',
        Overwrite: true,
        Description: `Provisioning status for account ${config.accountId}`,
      }));

      this.logger.log(`Public account ${config.accountId} registered in customer table: ${publicTableName}`);

      return {
        success: true,
        tableName: publicTableName,
        cloudType: 'public',
        message: `Account registered in customer table: ${publicTableName}`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to register public account: ${error.message}`);
      throw new BadRequestException(`Failed to register account: ${error.message}`);
    }
  }

  /**
   * Provision a private cloud account (creates dedicated table in CUSTOMER account)
   * Uses cross-account role assumption to create resources in the customer's AWS account.
   */
  private async provisionPrivateAccount(config: ProvisioningConfig): Promise<ProvisioningResult> {
    const stackName = `${this.projectName}-${this.environment}-account-${config.accountId}`;
    const expectedTableName = `${this.projectName}-${this.environment}-${config.accountId}`;

    // Get cross-account clients for the CUSTOMER account
    const customerCfnClient = await this.getCrossAccountCfnClient(config.accountId);
    const customerSsmClient = await this.getCrossAccountSsmClient(config.accountId);

    try {
      // Set provisioning status to creating (in Platform Admin SSM)
      await this.updateProvisioningStatus(config.accountId, 'creating');

      // Check if stack already exists in CUSTOMER account
      let stackId: string | undefined;
      let stackAlreadyComplete = false;

      try {
        const describeResult = await customerCfnClient.send(new DescribeStacksCommand({
          StackName: stackName,
        }));
        const existingStack = describeResult.Stacks?.[0];

        if (existingStack) {
          const status = existingStack.StackStatus;
          stackId = existingStack.StackId;
          this.logger.log(`Stack ${stackName} already exists in customer account with status: ${status}`);

          if (status === 'CREATE_COMPLETE' || status === 'UPDATE_COMPLETE') {
            stackAlreadyComplete = true;
            this.logger.log(`Stack ${stackName} already complete — reusing existing infrastructure`);
          } else if (status === 'ROLLBACK_COMPLETE' || status === 'DELETE_COMPLETE') {
            this.logger.log(`Stack ${stackName} in ${status} — deleting before recreation`);
            await customerCfnClient.send(new DeleteStackCommand({ StackName: stackName }));
            await new Promise(resolve => setTimeout(resolve, 5000));
            stackId = undefined;
          } else if (
            status === 'CREATE_IN_PROGRESS' ||
            status === 'UPDATE_IN_PROGRESS'
          ) {
            this.logger.log(`Stack ${stackName} creation already in progress — attaching watcher`);
          } else {
            throw new BadRequestException(
              `Stack ${stackName} is in state ${status} and cannot be re-provisioned. Please wait or contact support.`,
            );
          }
        }
      } catch (error: any) {
        if (error.name !== 'ValidationError' && !(error instanceof BadRequestException)) {
          throw error;
        }
      }

      // Only create the stack if it doesn't already exist
      if (!stackId) {
        // Use inline TemplateBody to avoid cross-account S3 access issues.
        // The template is embedded in the build so no S3 read is required.
        const templateBody = PRIVATE_ACCOUNT_DYNAMODB_TEMPLATE;

        // Resolve the CloudFormation execution role for the customer account.
        // This role grants CloudFormation permission to create DynamoDB, SSM, etc.
        const cfnRoleArn = await this.resolveCfnExecutionRoleArn();

        const createStackParams: any = {
          StackName: stackName,
          TemplateBody: templateBody,
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
        };

        // Pass the CFN execution role so CloudFormation has permissions to create resources
        if (cfnRoleArn) {
          createStackParams.RoleARN = cfnRoleArn;
          this.logger.log(`[CrossAccount] Using CFN execution role: ${cfnRoleArn}`);
        } else {
          this.logger.warn(
            `[CrossAccount] No CFN_EXECUTION_ROLE_ARN configured — CloudFormation will use caller credentials. ` +
            `This may fail if the assumed role lacks direct resource creation permissions.`,
          );
        }

        // Create CloudFormation stack in CUSTOMER account
        const createStackResult = await retryWithBackoff(
          () => customerCfnClient.send(new CreateStackCommand(createStackParams)),
          { maxAttempts: 3, label: 'CreateStack', retryIf: isTransientAwsError },
        );

        stackId = createStackResult.StackId;
      }

      // Log the target AWS account from the stack ARN for audit trail
      const stackAccountId = stackId?.split(':')[4] || 'unknown';
      this.logger.log(
        `[CrossAccount] CloudFormation stack created → ` +
        `Stack: ${stackName}, ` +
        `Target AWS Account: ${stackAccountId}, ` +
        `StackId: ${stackId}`,
      );

      // Pre-register SSM params in PLATFORM ADMIN account for routing
      await this.ssmClient.send(new PutParameterCommand({
        Name: `/accounts/${config.accountId}/cloud-type`,
        Value: 'private',
        Type: 'String',
        Overwrite: true,
        Description: `Cloud type for account ${config.accountId}`,
      }));

      await this.ssmClient.send(new PutParameterCommand({
        Name: `/accounts/${config.accountId}/dynamodb/table-name`,
        Value: expectedTableName,
        Type: 'String',
        Overwrite: true,
        Description: `DynamoDB table for private account ${config.accountId}`,
      }));

      if (stackAlreadyComplete) {
        await this.updateProvisioningStatus(config.accountId, 'active');
        this.logger.log(
          `Private account ${config.accountId} reused existing stack. Table: ${expectedTableName}`,
        );

        return {
          success: true,
          tableName: expectedTableName,
          stackId,
          cloudType: 'private',
          message: `Infrastructure already exists. Table ready: ${expectedTableName}`,
        };
      }

      // Fire-and-forget: wait for stack completion in background using CUSTOMER account client
      this.waitAndFinalizeStack(stackName, config.accountId, expectedTableName, customerCfnClient)
        .catch((err) => {
          this.logger.error(
            `Background stack finalization failed for ${config.accountId}: ${err.message}`,
            err.stack,
          );
        });

      this.logger.log(
        `Private account ${config.accountId} provisioning started (async) in CUSTOMER account. Expected table: ${expectedTableName}`,
      );

      // Return with in_progress status — NOT completed. The background watcher will finalize.
      return {
        success: true,
        tableName: expectedTableName,
        stackId,
        cloudType: 'private',
        inProgress: true, // Signal that provisioning is still ongoing
        message: `Provisioning started in customer account. Table will be ready shortly: ${expectedTableName}`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to initiate private account provisioning: ${error.message}`);
      await this.updateProvisioningStatus(config.accountId, 'failed', error.message);
      throw new BadRequestException(`Failed to provision private account: ${error.message}`);
    }
  }

  /**
   * Background task: wait for CFN stack completion in CUSTOMER account and finalize SSM status.
   */
  private async waitAndFinalizeStack(
    stackName: string,
    accountId: string,
    expectedTableName: string,
    cfnClient?: CloudFormationClient,
  ): Promise<void> {
    // Use the provided cross-account client, or get a fresh one
    const customerCfnClient = cfnClient || await this.getCrossAccountCfnClient(accountId);

    try {
      await waitUntilStackCreateComplete(
        { client: customerCfnClient, maxWaitTime: 600 },
        { StackName: stackName },
      );

      // Get the outputs from the completed stack in CUSTOMER account
      const describeResult = await customerCfnClient.send(new DescribeStacksCommand({
        StackName: stackName,
      }));

      const outputs = describeResult.Stacks?.[0]?.Outputs || [];
      const tableName = outputs.find((o: any) => o.OutputKey === 'TableName')?.OutputValue;
      const tableArn = outputs.find((o: any) => o.OutputKey === 'TableArn')?.OutputValue;

      if (!tableName) {
        throw new Error('Stack created but table name output not found');
      }

      // Update SSM in PLATFORM ADMIN account with actual table name
      if (tableName !== expectedTableName) {
        await this.ssmClient.send(new PutParameterCommand({
          Name: `/accounts/${accountId}/dynamodb/table-name`,
          Value: tableName,
          Type: 'String',
          Overwrite: true,
        }));
      }

      if (tableArn) {
        await this.ssmClient.send(new PutParameterCommand({
          Name: `/accounts/${accountId}/dynamodb/table-arn`,
          Value: tableArn,
          Type: 'String',
          Overwrite: true,
        }));
      }

      await this.updateProvisioningStatus(accountId, 'active');
      this.logger.log(`Private account ${accountId} stack completed in customer account. Table: ${tableName}`);
    } catch (error: any) {
      this.logger.error(`Stack creation failed for ${accountId}: ${error.message}`);
      await this.updateProvisioningStatus(accountId, 'failed', error.message);
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
      // Check if this is a private account with a dedicated stack in CUSTOMER account
      const stackName = `${this.projectName}-${this.environment}-account-${accountId}`;
      const customerCfnClient = await this.getCrossAccountCfnClient(accountId);

      try {
        const describeResult = await customerCfnClient.send(new DescribeStacksCommand({
          StackName: stackName,
        }));

        if (describeResult.Stacks?.length) {
          // Delete the CloudFormation stack in CUSTOMER account
          await this.updateProvisioningStatus(accountId, 'deleting');

          await customerCfnClient.send(new DeleteStackCommand({
            StackName: stackName,
          }));

          await waitUntilStackDeleteComplete(
            { client: customerCfnClient, maxWaitTime: 600 },
            { StackName: stackName },
          );

          this.logger.log(`Stack ${stackName} deleted from customer account successfully`);
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
  private async getAccountCloudType(accountId: string): Promise<CloudType> {
    try {
      const result = await this.ssmClient.send(new GetParameterCommand({
        Name: `/accounts/${accountId}/cloud-type`,
      }));
      return (result.Parameter?.Value as CloudType) || 'public';
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
   * Resolve the CloudFormation execution role ARN.
   * Checks env var first, then falls back to SSM lookup.
   */
  private async resolveCfnExecutionRoleArn(): Promise<string | undefined> {
    if (this.cfnExecutionRoleArn) {
      return this.cfnExecutionRoleArn;
    }

    // Fallback: try to read from SSM (set by Terraform in data-plane bootstrap)
    try {
      const ssmPrefix = `/${this.projectName}/${this.environment}`;
      const result = await this.ssmClient.send(new GetParameterCommand({
        Name: `${ssmPrefix}/cloudformation/execution-role-arn`,
      }));
      const roleArn = result.Parameter?.Value;
      if (roleArn) {
        this.logger.log(`Resolved CFN execution role from SSM: ${roleArn}`);
        return roleArn;
      }
    } catch {
      this.logger.warn('Could not resolve CFN execution role from SSM');
    }

    return undefined;
  }

  /**
   * Ensure CloudFormation template is uploaded to S3 (kept for backward compatibility / worker Lambda)
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
      // Template doesn't exist in S3, upload the inline template
      const templateBody = PRIVATE_ACCOUNT_DYNAMODB_TEMPLATE;

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
