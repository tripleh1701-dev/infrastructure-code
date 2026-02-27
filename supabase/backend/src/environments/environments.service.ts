import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { DynamoDBRouterService } from '../common/dynamodb/dynamodb-router.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

export interface EnvironmentConnector {
  id?: string;
  category?: string;
  connector?: string;
  connectorIconName?: string;
  environmentType?: string;
  apiUrl?: string;
  apiCredentialName?: string;
  iflowUrl?: string;
  iflowCredentialName?: string;
  hostUrl?: string;
  authenticationType?: string;
  credentialName?: string;
  oauth2ClientId?: string;
  oauth2ClientSecret?: string;
  oauth2TokenUrl?: string;
  username?: string;
  apiKey?: string;
  url?: string;
  personalAccessToken?: string;
  githubInstallationId?: string;
  githubApplicationId?: string;
  githubPrivateKey?: string;
  status?: boolean;
  description?: string;
}

export interface Environment {
  id: string;
  name: string;
  description?: string;
  accountId: string;
  enterpriseId: string;
  workstreamId?: string;
  productId?: string;
  serviceId?: string;
  connectorName?: string;
  connectivityStatus: string;
  scope?: string;
  entity?: string;
  connectorIconName?: string;
  connectors: EnvironmentConnector[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Environments Service
 *
 * Routes all customer operational data to the correct DynamoDB table:
 * - Public accounts → shared customer table (PK: ACCOUNT#<accountId>)
 * - Private accounts → dedicated customer table (PK: ENVIRONMENT#LIST)
 * - Admin queries (no accountId) → control plane table
 */
@Injectable()
export class EnvironmentsService {
  constructor(
    private readonly dynamoDb: DynamoDBService,
    private readonly dynamoDbRouter: DynamoDBRouterService,
  ) {}

  async findAll(accountId?: string, enterpriseId?: string): Promise<Environment[]> {
    if (accountId) {
      const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);
      const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

      if (isCustomer) {
        const pk = isPrivate ? 'ENVIRONMENT#LIST' : `ACCOUNT#${accountId}`;
        const result = await this.dynamoDbRouter.query(accountId, {
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': pk,
            ':sk': 'ENVIRONMENT#',
          },
        });
        let items = (result.Items || []).map(this.mapToEnvironment);
        if (enterpriseId) {
          items = items.filter((e) => e.enterpriseId === enterpriseId);
        }
        return items;
      }

      // Fallback: control plane
      const result = await this.dynamoDb.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `ACCOUNT#${accountId}`,
          ':sk': 'ENVIRONMENT#',
        },
      });

      let items = (result.Items || []).map(this.mapToEnvironment);
      if (enterpriseId) {
        items = items.filter((e) => e.enterpriseId === enterpriseId);
      }
      return items;
    }

    // Admin query — control plane
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#ENVIRONMENT' },
    );

    let items = (result.Items || []).map(this.mapToEnvironment);
    if (enterpriseId) {
      items = items.filter((e) => e.enterpriseId === enterpriseId);
    }
    return items;
  }

  async findOne(id: string, accountId?: string): Promise<Environment> {
    if (accountId) {
      const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);
      const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

      if (isCustomer) {
        const pk = isPrivate ? 'ENVIRONMENT#LIST' : `ACCOUNT#${accountId}`;
        const result = await this.dynamoDbRouter.get(accountId, {
          Key: { PK: pk, SK: `ENVIRONMENT#${id}` },
        });

        if (result.Item) {
          return this.mapToEnvironment(result.Item);
        }
      }
    }

    // Fallback: control plane GSI lookup
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk AND GSI1SK = :sk',
      {
        ':pk': 'ENTITY#ENVIRONMENT',
        ':sk': `ENVIRONMENT#${id}`,
      },
    );

    if (!result.Items?.length) {
      throw new NotFoundException(`Environment with ID ${id} not found`);
    }

    return this.mapToEnvironment(result.Items[0]);
  }

  async create(dto: CreateEnvironmentDto): Promise<Environment> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(dto.accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(dto.accountId);

    const item: Record<string, any> = {
      PK: isPrivate ? 'ENVIRONMENT#LIST' : `ACCOUNT#${dto.accountId}`,
      SK: `ENVIRONMENT#${id}`,
      GSI1PK: 'ENTITY#ENVIRONMENT',
      GSI1SK: `ENVIRONMENT#${id}`,
      GSI2PK: `ENTERPRISE#${dto.enterpriseId}`,
      GSI2SK: `ENVIRONMENT#${id}`,
      id,
      name: dto.name,
      description: dto.description || null,
      accountId: dto.accountId,
      enterpriseId: dto.enterpriseId,
      workstreamId: dto.workstreamId || null,
      productId: dto.productId || null,
      serviceId: dto.serviceId || null,
      connectorName: dto.connectorName || null,
      connectivityStatus: dto.connectivityStatus || 'unknown',
      scope: dto.scope || null,
      entity: dto.entity || null,
      connectorIconName: dto.connectorIconName || null,
      connectors: dto.connectors || [],
      createdAt: now,
      updatedAt: now,
    };

    if (isCustomer) {
      await this.dynamoDbRouter.put(dto.accountId, { Item: item });
    } else {
      await this.dynamoDb.put({ Item: item });
    }

    return this.mapToEnvironment(item);
  }

  async update(id: string, dto: UpdateEnvironmentDto, accountId?: string): Promise<Environment> {
    const existing = await this.findOne(id, accountId);
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(existing.accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(existing.accountId);

    const now = new Date().toISOString();
    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, any> = { ':updatedAt': now };

    const fields: [keyof UpdateEnvironmentDto, string][] = [
      ['name', 'name'],
      ['description', 'description'],
      ['workstreamId', 'workstreamId'],
      ['productId', 'productId'],
      ['serviceId', 'serviceId'],
      ['connectorName', 'connectorName'],
      ['connectivityStatus', 'connectivityStatus'],
      ['scope', 'scope'],
      ['entity', 'entity'],
      ['connectorIconName', 'connectorIconName'],
      ['connectors', 'connectors'],
    ];

    for (const [dtoKey, dbKey] of fields) {
      if (dto[dtoKey] !== undefined) {
        updateExpressions.push(`#${dbKey} = :${dbKey}`);
        names[`#${dbKey}`] = dbKey;
        values[`:${dbKey}`] = dto[dtoKey];
      }
    }

    const key = {
      PK: isPrivate ? 'ENVIRONMENT#LIST' : `ACCOUNT#${existing.accountId}`,
      SK: `ENVIRONMENT#${id}`,
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

    return this.mapToEnvironment(result.Attributes!);
  }

  async remove(id: string, accountId?: string): Promise<void> {
    const existing = await this.findOne(id, accountId);
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(existing.accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(existing.accountId);

    const key = {
      PK: isPrivate ? 'ENVIRONMENT#LIST' : `ACCOUNT#${existing.accountId}`,
      SK: `ENVIRONMENT#${id}`,
    };

    if (isCustomer) {
      await this.dynamoDbRouter.delete(existing.accountId, { Key: key });
    } else {
      await this.dynamoDb.delete({ Key: key });
    }
  }

  private mapToEnvironment(item: Record<string, any>): Environment {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      accountId: item.accountId,
      enterpriseId: item.enterpriseId,
      workstreamId: item.workstreamId,
      productId: item.productId,
      serviceId: item.serviceId,
      connectorName: item.connectorName,
      connectivityStatus: item.connectivityStatus || 'unknown',
      scope: item.scope || null,
      entity: item.entity || null,
      connectorIconName: item.connectorIconName || null,
      connectors: item.connectors || [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
