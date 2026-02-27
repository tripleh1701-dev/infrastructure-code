import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { DynamoDBRouterService } from '../common/dynamodb/dynamodb-router.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

export interface Connector {
  id: string;
  name: string;
  description?: string;
  connectorType: string;
  connectorTool: string;
  category: string;
  url?: string;
  status: string;
  health: string;
  lastSyncAt?: string;
  syncCount: number;
  accountId: string;
  enterpriseId: string;
  productId?: string;
  serviceId?: string;
  credentialId?: string;
  createdAt: string;
  updatedAt: string;
  workstreams?: string[];
}

/**
 * Connectors Service
 *
 * Routes all customer operational data to the correct DynamoDB table:
 * - Public accounts → shared customer table (PK: ACCOUNT#<accountId>)
 * - Private accounts → dedicated customer table (PK: CONNECTOR#LIST)
 * - Admin queries (no accountId) → control plane table
 */
@Injectable()
export class ConnectorsService {
  constructor(
    private readonly dynamoDb: DynamoDBService,
    private readonly dynamoDbRouter: DynamoDBRouterService,
  ) {}

  async findAll(accountId?: string, enterpriseId?: string): Promise<Connector[]> {
    if (accountId) {
      const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);
      const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

      if (isCustomer) {
        const pk = isPrivate ? 'CONNECTOR#LIST' : `ACCOUNT#${accountId}`;
        const result = await this.dynamoDbRouter.query(accountId, {
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': pk,
            ':sk': 'CONNECTOR#',
          },
        });
        let items = (result.Items || []).map(this.mapToConnector);
        if (enterpriseId) {
          items = items.filter((c) => c.enterpriseId === enterpriseId);
        }
        return items;
      }

      // Fallback: control plane
      const result = await this.dynamoDb.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `ACCOUNT#${accountId}`,
          ':sk': 'CONNECTOR#',
        },
      });

      let items = (result.Items || []).map(this.mapToConnector);
      if (enterpriseId) {
        items = items.filter((c) => c.enterpriseId === enterpriseId);
      }
      return items;
    }

    // Admin query — control plane
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#CONNECTOR' },
    );

    let items = (result.Items || []).map(this.mapToConnector);
    if (enterpriseId) {
      items = items.filter((c) => c.enterpriseId === enterpriseId);
    }
    return items;
  }

  async findOne(id: string, accountId?: string): Promise<Connector & { workstreams: string[] }> {
    if (accountId) {
      const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);
      const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

      if (isCustomer) {
        const pk = isPrivate ? 'CONNECTOR#LIST' : `ACCOUNT#${accountId}`;
        const result = await this.dynamoDbRouter.get(accountId, {
          Key: { PK: pk, SK: `CONNECTOR#${id}` },
        });

        if (result.Item) {
          const connector = this.mapToConnector(result.Item);
          const wsResult = await this.dynamoDbRouter.query(accountId, {
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': `CONNECTOR#${id}`,
              ':sk': 'WORKSTREAM#',
            },
          });
          return {
            ...connector,
            workstreams: (wsResult.Items || []).map((item) => item.workstreamId),
          };
        }
      }
    }

    // Fallback: control plane GSI lookup
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk AND GSI1SK = :sk',
      {
        ':pk': 'ENTITY#CONNECTOR',
        ':sk': `CONNECTOR#${id}`,
      },
    );

    if (!result.Items?.length) {
      throw new NotFoundException(`Connector with ID ${id} not found`);
    }

    const connector = this.mapToConnector(result.Items[0]);

    const wsResult = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `CONNECTOR#${id}`,
        ':sk': 'WORKSTREAM#',
      },
    });

    return {
      ...connector,
      workstreams: (wsResult.Items || []).map((item) => item.workstreamId),
    };
  }

  async create(dto: CreateConnectorDto): Promise<Connector> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(dto.accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(dto.accountId);

    const connector: Record<string, any> = {
      PK: isPrivate ? 'CONNECTOR#LIST' : `ACCOUNT#${dto.accountId}`,
      SK: `CONNECTOR#${id}`,
      GSI1PK: 'ENTITY#CONNECTOR',
      GSI1SK: `CONNECTOR#${id}`,
      GSI2PK: `ENTERPRISE#${dto.enterpriseId}`,
      GSI2SK: `CONNECTOR#${id}`,
      id,
      name: dto.name,
      description: dto.description || null,
      connectorType: dto.connectorType,
      connectorTool: dto.connectorTool,
      category: dto.category,
      url: dto.url || null,
      status: 'connected',
      health: 'healthy',
      lastSyncAt: null,
      syncCount: 0,
      accountId: dto.accountId,
      enterpriseId: dto.enterpriseId,
      productId: dto.productId || null,
      serviceId: dto.serviceId || null,
      credentialId: dto.credentialId || null,
      createdAt: now,
      updatedAt: now,
    };

    const wsItems: any[] = [];
    if (dto.workstreamIds?.length) {
      for (const wsId of dto.workstreamIds) {
        wsItems.push({
          PK: `CONNECTOR#${id}`,
          SK: `WORKSTREAM#${wsId}`,
          id: uuidv4(),
          connectorId: id,
          workstreamId: wsId,
          createdAt: now,
        });
      }
    }

    const operations: any[] = [{ Put: { Item: connector } }];
    for (const ws of wsItems) {
      operations.push({ Put: { Item: ws } });
    }

    if (isCustomer) {
      await this.dynamoDbRouter.transactWrite(dto.accountId, operations);
    } else {
      await this.dynamoDb.transactWrite(operations);
    }

    return this.mapToConnector(connector);
  }

  async update(id: string, dto: UpdateConnectorDto, accountId?: string): Promise<Connector> {
    const existing = await this.findOne(id, accountId);
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(existing.accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(existing.accountId);

    const now = new Date().toISOString();
    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, any> = { ':updatedAt': now };

    const fields: [keyof UpdateConnectorDto, string][] = [
      ['name', 'name'],
      ['description', 'description'],
      ['url', 'url'],
      ['status', 'status'],
      ['health', 'health'],
      ['credentialId', 'credentialId'],
    ];

    for (const [dtoKey, dbKey] of fields) {
      if (dto[dtoKey] !== undefined) {
        updateExpressions.push(`#${dbKey} = :${dbKey}`);
        names[`#${dbKey}`] = dbKey;
        values[`:${dbKey}`] = dto[dtoKey];
      }
    }

    const key = {
      PK: isPrivate ? 'CONNECTOR#LIST' : `ACCOUNT#${existing.accountId}`,
      SK: `CONNECTOR#${id}`,
    };

    const updateParams = {
      Key: key,
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW' as const,
    };

    const result = isCustomer
      ? await this.dynamoDbRouter.update(existing.accountId, updateParams)
      : await this.dynamoDb.update(updateParams);

    // Update workstreams if provided
    if (dto.workstreamIds !== undefined) {
      const queryFn = isCustomer
        ? () => this.dynamoDbRouter.query(existing.accountId, {
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { ':pk': `CONNECTOR#${id}`, ':sk': 'WORKSTREAM#' },
          })
        : () => this.dynamoDb.query({
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { ':pk': `CONNECTOR#${id}`, ':sk': 'WORKSTREAM#' },
          });

      const existingWs = await queryFn();

      if (existingWs.Items?.length) {
        const deleteRequests = existingWs.Items.map((item) => ({
          DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
        }));
        if (isCustomer) {
          await this.dynamoDbRouter.batchWrite(existing.accountId, deleteRequests);
        } else {
          await this.dynamoDb.batchWrite(deleteRequests);
        }
      }

      if (dto.workstreamIds.length > 0) {
        const operations = dto.workstreamIds.map((wsId) => ({
          Put: {
            Item: {
              PK: `CONNECTOR#${id}`,
              SK: `WORKSTREAM#${wsId}`,
              id: uuidv4(),
              connectorId: id,
              workstreamId: wsId,
              createdAt: now,
            },
          },
        }));
        if (isCustomer) {
          await this.dynamoDbRouter.transactWrite(existing.accountId, operations);
        } else {
          await this.dynamoDb.transactWrite(operations);
        }
      }
    }

    return this.mapToConnector(result.Attributes!);
  }

  async remove(id: string, accountId?: string): Promise<void> {
    const existing = await this.findOne(id, accountId);
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(existing.accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(existing.accountId);

    // Delete workstream associations
    const wsResult = isCustomer
      ? await this.dynamoDbRouter.query(existing.accountId, {
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': `CONNECTOR#${id}` },
        })
      : await this.dynamoDb.query({
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': `CONNECTOR#${id}` },
        });

    const deleteRequests = [
      {
        DeleteRequest: {
          Key: {
            PK: isPrivate ? 'CONNECTOR#LIST' : `ACCOUNT#${existing.accountId}`,
            SK: `CONNECTOR#${id}`,
          },
        },
      },
      ...(wsResult.Items || []).map((item) => ({
        DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
      })),
    ];

    for (let i = 0; i < deleteRequests.length; i += 25) {
      const batch = deleteRequests.slice(i, i + 25);
      if (isCustomer) {
        await this.dynamoDbRouter.batchWrite(existing.accountId, batch);
      } else {
        await this.dynamoDb.batchWrite(batch);
      }
    }
  }

  private mapToConnector(item: Record<string, any>): Connector {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      connectorType: item.connectorType,
      connectorTool: item.connectorTool,
      category: item.category,
      url: item.url,
      status: item.status || 'connected',
      health: item.health || 'healthy',
      lastSyncAt: item.lastSyncAt,
      syncCount: item.syncCount || 0,
      accountId: item.accountId,
      enterpriseId: item.enterpriseId,
      productId: item.productId,
      serviceId: item.serviceId,
      credentialId: item.credentialId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
