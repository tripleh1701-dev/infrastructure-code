import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

@Injectable()
export class DynamoDBService implements OnModuleInit {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const client = new DynamoDBClient({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY', ''),
      },
    });

    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true,
      },
    });

    const prefix = this.configService.get('DYNAMODB_TABLE_PREFIX', 'app_');
    this.tableName = `${prefix}data`;
  }

  getTableName(): string {
    return this.tableName;
  }

  async get(params: Omit<GetCommandInput, 'TableName'>) {
    const command = new GetCommand({
      TableName: this.tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async put(params: Omit<PutCommandInput, 'TableName'>) {
    const command = new PutCommand({
      TableName: this.tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async update(params: Omit<UpdateCommandInput, 'TableName'>) {
    const command = new UpdateCommand({
      TableName: this.tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async delete(params: Omit<DeleteCommandInput, 'TableName'>) {
    const command = new DeleteCommand({
      TableName: this.tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async query(params: Omit<QueryCommandInput, 'TableName'>) {
    const command = new QueryCommand({
      TableName: this.tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async scan(params: Omit<ScanCommandInput, 'TableName'> = {}) {
    const command = new ScanCommand({
      TableName: this.tableName,
      ...params,
    });
    return this.docClient.send(command);
  }

  async batchWrite(items: { PutRequest?: { Item: Record<string, any> }; DeleteRequest?: { Key: Record<string, any> } }[]) {
    const command = new BatchWriteCommand({
      RequestItems: {
        [this.tableName]: items,
      },
    });
    return this.docClient.send(command);
  }

  async transactWrite(operations: any[]) {
    const command = new TransactWriteCommand({
      TransactItems: operations.map((op) => ({
        ...op,
        ...(op.Put && { Put: { ...op.Put, TableName: this.tableName } }),
        ...(op.Update && { Update: { ...op.Update, TableName: this.tableName } }),
        ...(op.Delete && { Delete: { ...op.Delete, TableName: this.tableName } }),
      })),
    });
    return this.docClient.send(command);
  }

  // Helper to query by GSI
  async queryByIndex(
    indexName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
  ) {
    return this.query({
      IndexName: indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
    });
  }
}
