import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveAwsCredentials } from '../utils/aws-credentials';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
  TransactWriteCommand,
  GetCommandInput,
  PutCommandInput,
  UpdateCommandInput,
  DeleteCommandInput,
  QueryCommandInput,
  ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  SSMClient,
  GetParameterCommand,
  GetParametersByPathCommand,
} from '@aws-sdk/client-ssm';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { CloudType } from '../types/cloud-type';

interface TableConfig {
  tableName: string;
  tableArn: string;
  cloudType: CloudType;
  cachedAt: number;
}

interface AssumedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

/**
 * DynamoDB Router Service
 * 
 * Routes database operations to the correct DynamoDB table based on account type:
 * - Public accounts: Uses shared multi-tenant table with PK/SK isolation
 * - Private accounts: Uses dedicated per-account table discovered via SSM Parameter Store
 * 
 * For private accounts, assumes the DATA_PLANE_ROLE_ARN to obtain temporary
 * credentials that can access cross-account DynamoDB tables and SSM parameters.
 */
@Injectable()
export class DynamoDBRouterService implements OnModuleInit {
  private readonly logger = new Logger(DynamoDBRouterService.name);
  
  // Control-plane clients (default credentials)
  private docClient: DynamoDBDocumentClient;
  private ssmClient: SSMClient;
  private stsClient: STSClient;
  
  // Shared table for public accounts
  private sharedTableName: string;
  
  // Cross-account role ARN for data-plane access
  private dataPlaneRoleArn: string | undefined;
  private region: string;

  // Cache for private account table configs (TTL: 5 minutes)
  private tableCache: Map<string, TableConfig> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  // Cache for assumed-role credentials (TTL: refresh 5 min before expiry)
  private assumedCredentialsCache: Map<string, AssumedCredentials> = new Map();
  private readonly CREDENTIALS_REFRESH_BUFFER_MS = 5 * 60 * 1000;

  // Cache for cross-account DynamoDB doc clients
  private crossAccountDocClients: Map<string, { client: DynamoDBDocumentClient; expiresAt: number }> = new Map();

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.region = this.configService.get('AWS_REGION', 'us-east-1');
    const credentials = resolveAwsCredentials(
      this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
    );
    
    const dynamoClient = new DynamoDBClient({ region: this.region, ...(credentials && { credentials }) });

    this.docClient = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true,
        convertClassInstanceToMap: true,
      },
    });

    this.ssmClient = new SSMClient({ region: this.region, ...(credentials && { credentials }) });
    this.stsClient = new STSClient({ region: this.region, ...(credentials && { credentials }) });

    // Cross-account role for accessing customer data-plane resources
    this.dataPlaneRoleArn = this.configService.get<string>('DATA_PLANE_ROLE_ARN');
    if (!this.dataPlaneRoleArn) {
      this.logger.warn('DATA_PLANE_ROLE_ARN not set — cross-account routing to private accounts will fall back to default credentials');
    }

    // Prefer explicit table name from Terraform — no hardcoded fallback
    this.sharedTableName = (this.configService.get<string>('CONTROL_PLANE_TABLE_NAME')
      || this.configService.get<string>('DYNAMODB_TABLE_NAME')) as string;
    if (!this.sharedTableName) {
      throw new Error('CONTROL_PLANE_TABLE_NAME or DYNAMODB_TABLE_NAME must be set');
    }
    
    this.logger.log(`DynamoDB Router initialized. Shared table: ${this.sharedTableName}, Data-plane role: ${this.dataPlaneRoleArn || 'NOT SET'}`);
  }

  // =============================================================================
  // Cross-Account Credential Management
  // =============================================================================

  /**
   * Assume the DATA_PLANE_ROLE_ARN to get temporary credentials for
   * accessing customer-account resources (DynamoDB, SSM).
   */
  private async assumeDataPlaneRole(accountId: string): Promise<AssumedCredentials> {
    // Check cache first
    const cached = this.assumedCredentialsCache.get(accountId);
    if (cached && cached.expiration.getTime() - Date.now() > this.CREDENTIALS_REFRESH_BUFFER_MS) {
      return cached;
    }

    if (!this.dataPlaneRoleArn) {
      throw new Error('DATA_PLANE_ROLE_ARN is not configured — cannot assume cross-account role');
    }

    this.logger.debug(`Assuming data-plane role for account ${accountId}`);

    const result = await this.stsClient.send(new AssumeRoleCommand({
      RoleArn: this.dataPlaneRoleArn,
      RoleSessionName: `router-${accountId}-${Date.now()}`,
      DurationSeconds: 3600, // 1 hour
      Tags: [
        { Key: 'AccountId', Value: accountId },
        { Key: 'Service', Value: 'DynamoDBRouter' },
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
    this.logger.debug(`Assumed data-plane role for account ${accountId}, expires at ${assumed.expiration.toISOString()}`);

    return assumed;
  }

  /**
   * Get a DynamoDB DocumentClient with cross-account credentials
   */
  private async getCrossAccountDocClient(accountId: string): Promise<DynamoDBDocumentClient> {
    const cached = this.crossAccountDocClients.get(accountId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.client;
    }

    const creds = await this.assumeDataPlaneRole(accountId);

    const dynamoClient = new DynamoDBClient({
      region: this.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });

    const docClient = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true,
        convertClassInstanceToMap: true,
      },
    });

    this.crossAccountDocClients.set(accountId, {
      client: docClient,
      expiresAt: creds.expiration.getTime() - this.CREDENTIALS_REFRESH_BUFFER_MS,
    });

    return docClient;
  }

  /**
   * Get an SSM client with cross-account credentials
   */
  private async getCrossAccountSsmClient(accountId: string): Promise<SSMClient> {
    const creds = await this.assumeDataPlaneRole(accountId);
    return new SSMClient({
      region: this.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });
  }

  // =============================================================================
  // Table Resolution
  // =============================================================================

  /**
   * Get the shared table name (for public accounts and admin queries)
   */
  getSharedTableName(): string {
    return this.sharedTableName;
  }

  /**
   * Resolve the correct table name for an account.
   * - Public accounts: returns shared table name
   * - Private accounts: looks up dedicated table from SSM (via cross-account role)
   */
  async resolveTableName(accountId: string): Promise<string> {
    const cached = this.tableCache.get(accountId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.tableName;
    }

    try {
      const tableConfig = await this.getAccountTableConfig(accountId);
      
      if (tableConfig) {
        this.tableCache.set(accountId, tableConfig);
        return tableConfig.tableName;
      }
    } catch (error) {
      this.logger.debug(`No dedicated table found for account ${accountId}, using shared table`);
    }

    return this.sharedTableName;
  }

  /**
   * Get full table configuration for an account from SSM.
   * Uses cross-account credentials when DATA_PLANE_ROLE_ARN is configured.
   */
  private async getAccountTableConfig(accountId: string): Promise<TableConfig | null> {
    try {
      // Use cross-account SSM client if role is configured
      const ssmClient = this.dataPlaneRoleArn
        ? await this.getCrossAccountSsmClient(accountId)
        : this.ssmClient;

      const [tableNameResult, cloudTypeResult] = await Promise.all([
        ssmClient.send(new GetParameterCommand({
          Name: `/accounts/${accountId}/dynamodb/table-name`,
        })),
        ssmClient.send(new GetParameterCommand({
          Name: `/accounts/${accountId}/cloud-type`,
        })),
      ]);

      if (!tableNameResult.Parameter?.Value) {
        return null;
      }

      // Optionally get table ARN
      let tableArn = '';
      try {
        const arnResult = await ssmClient.send(new GetParameterCommand({
          Name: `/accounts/${accountId}/dynamodb/table-arn`,
        }));
        tableArn = arnResult.Parameter?.Value || '';
      } catch {
        // ARN is optional
      }

      return {
        tableName: tableNameResult.Parameter.Value,
        tableArn,
        cloudType: (cloudTypeResult.Parameter?.Value as CloudType) || 'public',
        cachedAt: Date.now(),
      };
    } catch (error: any) {
      if (error.name === 'ParameterNotFound') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if an account is a private cloud account (dedicated table, simplified PKs)
   */
  async isPrivateAccount(accountId: string): Promise<boolean> {
    const cloudType = await this.getCloudType(accountId);
    return cloudType === 'private';
  }

  /**
   * Check if an account has a customer-specific table (private OR public customer table).
   * Returns true for any account with SSM routing parameters — both private (dedicated)
   * and public (shared customer table like account-admin-public-staging).
   */
  async isCustomerAccount(accountId: string): Promise<boolean> {
    const tableName = await this.resolveTableName(accountId);
    return tableName !== this.sharedTableName;
  }

  /**
   * Get the cloud type for an account from SSM cache.
   * Returns 'public' by default if not found.
   */
  async getCloudType(accountId: string): Promise<CloudType> {
    // Check table config cache first
    const cached = this.tableCache.get(accountId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.cloudType;
    }

    try {
      const config = await this.getAccountTableConfig(accountId);
      if (config) {
        this.tableCache.set(accountId, config);
        return config.cloudType;
      }
    } catch {
      // Fall through to default
    }

    return 'public';
  }

  /**
   * List all configured private accounts from SSM
   */
  async listPrivateAccounts(): Promise<{ accountId: string; tableName: string }[]> {
    const accounts: { accountId: string; tableName: string }[] = [];
    let nextToken: string | undefined;

    // Use cross-account SSM if available
    const ssmClient = this.dataPlaneRoleArn
      ? await this.getCrossAccountSsmClient('list-all')
      : this.ssmClient;

    do {
      const result = await ssmClient.send(new GetParametersByPathCommand({
        Path: '/accounts/',
        Recursive: true,
        NextToken: nextToken,
      }));

      if (result.Parameters) {
        for (const param of result.Parameters) {
          if (param.Name?.endsWith('/dynamodb/table-name') && param.Value) {
            const accountId = param.Name.split('/')[2];
            accounts.push({ accountId, tableName: param.Value });
          }
        }
      }

      nextToken = result.NextToken;
    } while (nextToken);

    return accounts;
  }

  /**
   * Invalidate cache for an account (call after provisioning)
   */
  invalidateCache(accountId: string): void {
    this.tableCache.delete(accountId);
    this.assumedCredentialsCache.delete(accountId);
    this.crossAccountDocClients.delete(accountId);
    this.logger.log(`Cache invalidated for account ${accountId}`);
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.tableCache.clear();
    this.assumedCredentialsCache.clear();
    this.crossAccountDocClients.clear();
    this.logger.log('All caches cleared');
  }

  // =============================================================================
  // DynamoDB Operations with Account Context
  // =============================================================================

  /**
   * Resolve the correct DynamoDB doc client for an account.
   * Private accounts get a cross-account client; public accounts use the default.
   */
  private async resolveDocClient(accountId: string): Promise<{ docClient: DynamoDBDocumentClient; tableName: string }> {
    const tableName = await this.resolveTableName(accountId);
    
    // If it resolved to the shared table, use default client
    if (tableName === this.sharedTableName) {
      return { docClient: this.docClient, tableName };
    }

    // Private account — use cross-account client
    const docClient = await this.getCrossAccountDocClient(accountId);
    return { docClient, tableName };
  }

  async get(accountId: string, params: Omit<GetCommandInput, 'TableName'>) {
    const { docClient, tableName } = await this.resolveDocClient(accountId);
    return docClient.send(new GetCommand({ TableName: tableName, ...params }));
  }

  async put(accountId: string, params: Omit<PutCommandInput, 'TableName'>) {
    const { docClient, tableName } = await this.resolveDocClient(accountId);
    return docClient.send(new PutCommand({ TableName: tableName, ...params }));
  }

  async update(accountId: string, params: Omit<UpdateCommandInput, 'TableName'>) {
    const { docClient, tableName } = await this.resolveDocClient(accountId);
    return docClient.send(new UpdateCommand({ TableName: tableName, ...params }));
  }

  async delete(accountId: string, params: Omit<DeleteCommandInput, 'TableName'>) {
    const { docClient, tableName } = await this.resolveDocClient(accountId);
    return docClient.send(new DeleteCommand({ TableName: tableName, ...params }));
  }

  async query(accountId: string, params: Omit<QueryCommandInput, 'TableName'>) {
    const { docClient, tableName } = await this.resolveDocClient(accountId);
    return docClient.send(new QueryCommand({ TableName: tableName, ...params }));
  }

  async scan(accountId: string, params: Omit<ScanCommandInput, 'TableName'> = {}) {
    const { docClient, tableName } = await this.resolveDocClient(accountId);
    return docClient.send(new ScanCommand({ TableName: tableName, ...params }));
  }

  async batchWrite(
    accountId: string,
    items: { PutRequest?: { Item: Record<string, any> }; DeleteRequest?: { Key: Record<string, any> } }[],
  ) {
    const { docClient, tableName } = await this.resolveDocClient(accountId);
    return docClient.send(new BatchWriteCommand({ RequestItems: { [tableName]: items } }));
  }

  async transactWrite(accountId: string, operations: any[]) {
    const { docClient, tableName } = await this.resolveDocClient(accountId);
    return docClient.send(new TransactWriteCommand({
      TransactItems: operations.map((op) => ({
        ...op,
        ...(op.Put && { Put: { ...op.Put, TableName: tableName } }),
        ...(op.Update && { Update: { ...op.Update, TableName: tableName } }),
        ...(op.Delete && { Delete: { ...op.Delete, TableName: tableName } }),
      })),
    }));
  }

  /**
   * Query by GSI with account context
   */
  async queryByIndex(
    accountId: string,
    indexName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
  ) {
    return this.query(accountId, {
      IndexName: indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
    });
  }

  // =============================================================================
  // Admin Operations (always use shared table + default credentials)
  // =============================================================================

  async adminGet(params: Omit<GetCommandInput, 'TableName'>) {
    return this.docClient.send(new GetCommand({ TableName: this.sharedTableName, ...params }));
  }

  async adminPut(params: Omit<PutCommandInput, 'TableName'>) {
    return this.docClient.send(new PutCommand({ TableName: this.sharedTableName, ...params }));
  }

  async adminQuery(params: Omit<QueryCommandInput, 'TableName'>) {
    return this.docClient.send(new QueryCommand({ TableName: this.sharedTableName, ...params }));
  }

  async adminQueryByIndex(
    indexName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
  ) {
    return this.adminQuery({
      IndexName: indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
    });
  }
}
