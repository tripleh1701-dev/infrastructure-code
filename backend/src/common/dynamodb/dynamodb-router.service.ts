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

interface TableConfig {
  tableName: string;
  tableArn: string;
  cloudType: 'public' | 'private';
  cachedAt: number;
}

/**
 * DynamoDB Router Service
 * 
 * Routes database operations to the correct DynamoDB table based on account type:
 * - Public accounts: Uses shared multi-tenant table with PK/SK isolation
 * - Private accounts: Uses dedicated per-account table discovered via SSM Parameter Store
 */
@Injectable()
export class DynamoDBRouterService implements OnModuleInit {
  private readonly logger = new Logger(DynamoDBRouterService.name);
  private docClient: DynamoDBDocumentClient;
  private ssmClient: SSMClient;
  
  // Shared table for public accounts
  private sharedTableName: string;
  
  // Cache for private account table configs (TTL: 5 minutes)
  private tableCache: Map<string, TableConfig> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const region = this.configService.get('AWS_REGION', 'us-east-1');
    const credentials = resolveAwsCredentials(
      this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
    );
    
    const dynamoClient = new DynamoDBClient({ region, ...(credentials && { credentials }) });

    this.docClient = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true,
      },
    });

    this.ssmClient = new SSMClient({ region, ...(credentials && { credentials }) });  

    // Prefer explicit table name from Terraform, fall back to prefix-based convention
    this.sharedTableName = this.configService.get('CONTROL_PLANE_TABLE_NAME')
      || this.configService.get('DYNAMODB_TABLE_NAME')
      || `${this.configService.get('DYNAMODB_TABLE_PREFIX', 'app_')}data`;
    
    this.logger.log(`DynamoDB Router initialized. Shared table: ${this.sharedTableName}`);
  }

  /**
   * Get the shared table name (for public accounts and admin queries)
   */
  getSharedTableName(): string {
    return this.sharedTableName;
  }

  /**
   * Resolve the correct table name for an account
   * - Public accounts: returns shared table name
   * - Private accounts: looks up dedicated table from SSM Parameter Store
   */
  async resolveTableName(accountId: string): Promise<string> {
    // Check cache first
    const cached = this.tableCache.get(accountId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.tableName;
    }

    try {
      // Try to get table config from SSM
      const tableConfig = await this.getAccountTableConfig(accountId);
      
      if (tableConfig) {
        this.tableCache.set(accountId, tableConfig);
        return tableConfig.tableName;
      }
    } catch (error) {
      this.logger.debug(`No dedicated table found for account ${accountId}, using shared table`);
    }

    // Default to shared table (public accounts or fallback)
    return this.sharedTableName;
  }

  /**
   * Get full table configuration for an account from SSM
   */
  private async getAccountTableConfig(accountId: string): Promise<TableConfig | null> {
    try {
      const [tableNameResult, cloudTypeResult] = await Promise.all([
        this.ssmClient.send(new GetParameterCommand({
          Name: `/accounts/${accountId}/dynamodb/table-name`,
        })),
        this.ssmClient.send(new GetParameterCommand({
          Name: `/accounts/${accountId}/cloud-type`,
        })),
      ]);

      if (!tableNameResult.Parameter?.Value) {
        return null;
      }

      // Optionally get table ARN
      let tableArn = '';
      try {
        const arnResult = await this.ssmClient.send(new GetParameterCommand({
          Name: `/accounts/${accountId}/dynamodb/table-arn`,
        }));
        tableArn = arnResult.Parameter?.Value || '';
      } catch {
        // ARN is optional
      }

      return {
        tableName: tableNameResult.Parameter.Value,
        tableArn,
        cloudType: (cloudTypeResult.Parameter?.Value as 'public' | 'private') || 'public',
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
   * Check if an account is a private cloud account
   */
  async isPrivateAccount(accountId: string): Promise<boolean> {
    const tableName = await this.resolveTableName(accountId);
    return tableName !== this.sharedTableName;
  }

  /**
   * List all configured private accounts from SSM
   */
  async listPrivateAccounts(): Promise<{ accountId: string; tableName: string }[]> {
    const accounts: { accountId: string; tableName: string }[] = [];
    let nextToken: string | undefined;

    do {
      const result = await this.ssmClient.send(new GetParametersByPathCommand({
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
    this.logger.log(`Cache invalidated for account ${accountId}`);
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.tableCache.clear();
    this.logger.log('Table cache cleared');
  }

  // =============================================================================
  // DynamoDB Operations with Account Context
  // =============================================================================

  async get(accountId: string, params: Omit<GetCommandInput, 'TableName'>) {
    const tableName = await this.resolveTableName(accountId);
    const command = new GetCommand({
      TableName: tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async put(accountId: string, params: Omit<PutCommandInput, 'TableName'>) {
    const tableName = await this.resolveTableName(accountId);
    const command = new PutCommand({
      TableName: tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async update(accountId: string, params: Omit<UpdateCommandInput, 'TableName'>) {
    const tableName = await this.resolveTableName(accountId);
    const command = new UpdateCommand({
      TableName: tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async delete(accountId: string, params: Omit<DeleteCommandInput, 'TableName'>) {
    const tableName = await this.resolveTableName(accountId);
    const command = new DeleteCommand({
      TableName: tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async query(accountId: string, params: Omit<QueryCommandInput, 'TableName'>) {
    const tableName = await this.resolveTableName(accountId);
    const command = new QueryCommand({
      TableName: tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async scan(accountId: string, params: Omit<ScanCommandInput, 'TableName'> = {}) {
    const tableName = await this.resolveTableName(accountId);
    const command = new ScanCommand({
      TableName: tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async batchWrite(
    accountId: string,
    items: { PutRequest?: { Item: Record<string, any> }; DeleteRequest?: { Key: Record<string, any> } }[],
  ) {
    const tableName = await this.resolveTableName(accountId);
    const command = new BatchWriteCommand({
      RequestItems: {
        [tableName]: items,
      },
    });
    return this.docClient.send(command);
  }

  async transactWrite(accountId: string, operations: any[]) {
    const tableName = await this.resolveTableName(accountId);
    const command = new TransactWriteCommand({
      TransactItems: operations.map((op) => ({
        ...op,
        ...(op.Put && { Put: { ...op.Put, TableName: tableName } }),
        ...(op.Update && { Update: { ...op.Update, TableName: tableName } }),
        ...(op.Delete && { Delete: { ...op.Delete, TableName: tableName } }),
      })),
    });
    return this.docClient.send(command);
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
  // Admin Operations (always use shared table)
  // =============================================================================

  async adminGet(params: Omit<GetCommandInput, 'TableName'>) {
    const command = new GetCommand({
      TableName: this.sharedTableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async adminPut(params: Omit<PutCommandInput, 'TableName'>) {
    const command = new PutCommand({
      TableName: this.sharedTableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async adminQuery(params: Omit<QueryCommandInput, 'TableName'>) {
    const command = new QueryCommand({
      TableName: this.sharedTableName,
      ...params,
    });
    return this.docClient.send(command);
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
