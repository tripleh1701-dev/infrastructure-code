import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';

export interface Credential {
  id: string;
  name: string;
  description?: string;
  accountId: string;
  enterpriseId: string;
  productId?: string;
  serviceId?: string;
  category: string;
  connector: string;
  authType: string;
  credentials?: Record<string, any>;
  oauthAccessToken?: string;
  oauthRefreshToken?: string;
  oauthTokenExpiresAt?: string;
  oauthScope?: string;
  status: string;
  lastUsedAt?: string;
  createdBy?: string;
  expiresAt?: string;
  expiryNoticeDays: number;
  expiryNotify: boolean;
  createdAt: string;
  updatedAt: string;
  workstreams?: string[];
}

@Injectable()
export class CredentialsService {
  constructor(private readonly dynamoDb: DynamoDBService) {}

  async findAll(accountId?: string, enterpriseId?: string): Promise<(Credential & { workstreams: string[] })[]> {
    let items: Credential[];

    if (accountId) {
      const result = await this.dynamoDb.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `ACCOUNT#${accountId}`,
          ':sk': 'CREDENTIAL#',
        },
      });

      items = (result.Items || []).map(this.mapToCredential);
      if (enterpriseId) {
        items = items.filter((c) => c.enterpriseId === enterpriseId);
      }
    } else {
      const result = await this.dynamoDb.queryByIndex(
        'GSI1',
        'GSI1PK = :pk',
        { ':pk': 'ENTITY#CREDENTIAL' },
      );

      items = (result.Items || []).map(this.mapToCredential);
      if (enterpriseId) {
        items = items.filter((c) => c.enterpriseId === enterpriseId);
      }
    }

    // Enrich each credential with its workstream associations
    const enriched = await Promise.all(
      items.map(async (cred) => {
        const wsResult = await this.dynamoDb.query({
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `CREDENTIAL#${cred.id}`,
            ':sk': 'WORKSTREAM#',
          },
        });
        return {
          ...cred,
          workstreams: (wsResult.Items || []).map((item) => item.workstreamId),
        };
      }),
    );

    return enriched;
  }

  /**
   * Find credentials expiring within a given number of days.
   */
  async findExpiring(filters: {
    accountId?: string;
    enterpriseId?: string;
    days?: number;
  }): Promise<(Credential & { daysUntilExpiry: number })[]> {
    const all = await this.findAll(filters.accountId, filters.enterpriseId);
    const now = new Date();
    const windowMs = (filters.days || 30) * 24 * 60 * 60 * 1000;
    const cutoff = new Date(now.getTime() + windowMs);

    return all
      .filter((c) => {
        if (!c.expiresAt) return false;
        const expiryDate = new Date(c.expiresAt);
        return expiryDate > now && expiryDate <= cutoff;
      })
      .map((c) => ({
        ...c,
        daysUntilExpiry: Math.ceil(
          (new Date(c.expiresAt!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
        ),
      }))
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  async findOne(id: string): Promise<Credential & { workstreams: string[] }> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk AND GSI1SK = :sk',
      {
        ':pk': 'ENTITY#CREDENTIAL',
        ':sk': `CREDENTIAL#${id}`,
      },
    );

    if (!result.Items?.length) {
      throw new NotFoundException(`Credential with ID ${id} not found`);
    }

    const credential = this.mapToCredential(result.Items[0]);

    // Get workstreams
    const wsResult = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `CREDENTIAL#${id}`,
        ':sk': 'WORKSTREAM#',
      },
    });

    return {
      ...credential,
      workstreams: (wsResult.Items || []).map((item) => item.workstreamId),
    };
  }

  async create(dto: CreateCredentialDto): Promise<Credential> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const credential: Record<string, any> = {
      PK: `ACCOUNT#${dto.accountId}`,
      SK: `CREDENTIAL#${id}`,
      GSI1PK: 'ENTITY#CREDENTIAL',
      GSI1SK: `CREDENTIAL#${id}`,
      GSI2PK: `ENTERPRISE#${dto.enterpriseId}`,
      GSI2SK: `CREDENTIAL#${id}`,
      id,
      name: dto.name,
      description: dto.description || null,
      accountId: dto.accountId,
      enterpriseId: dto.enterpriseId,
      productId: dto.productId || null,
      serviceId: dto.serviceId || null,
      category: dto.category,
      connector: dto.connector,
      authType: dto.authType,
      credentials: dto.credentials || {},
      status: dto.authType === 'oauth' ? 'pending' : 'active',
      createdBy: dto.createdBy || null,
      expiresAt: dto.expiresAt || null,
      expiryNoticeDays: dto.expiryNoticeDays || 30,
      expiryNotify: dto.expiryNotify ?? true,
      createdAt: now,
      updatedAt: now,
    };

    const operations: any[] = [{ Put: { Item: credential } }];

    if (dto.workstreamIds?.length) {
      for (const wsId of dto.workstreamIds) {
        operations.push({
          Put: {
            Item: {
              PK: `CREDENTIAL#${id}`,
              SK: `WORKSTREAM#${wsId}`,
              id: uuidv4(),
              credentialId: id,
              workstreamId: wsId,
              createdAt: now,
            },
          },
        });
      }
    }

    await this.dynamoDb.transactWrite(operations);

    return this.mapToCredential(credential);
  }

  async update(id: string, dto: UpdateCredentialDto): Promise<Credential> {
    const existing = await this.findOne(id);

    const now = new Date().toISOString();
    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, any> = { ':updatedAt': now };

    const fields: [keyof UpdateCredentialDto, string][] = [
      ['name', 'name'],
      ['description', 'description'],
      ['productId', 'productId'],
      ['serviceId', 'serviceId'],
      ['status', 'status'],
      ['credentials', 'credentials'],
      ['expiresAt', 'expiresAt'],
      ['expiryNoticeDays', 'expiryNoticeDays'],
      ['expiryNotify', 'expiryNotify'],
    ];

    for (const [dtoKey, dbKey] of fields) {
      if (dto[dtoKey] !== undefined) {
        updateExpressions.push(`#${dbKey} = :${dbKey}`);
        names[`#${dbKey}`] = dbKey;
        values[`:${dbKey}`] = dto[dtoKey];
      }
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `ACCOUNT#${existing.accountId}`, SK: `CREDENTIAL#${id}` },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    });

    // Update workstreams if provided
    if (dto.workstreamIds !== undefined) {
      const existingWs = await this.dynamoDb.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `CREDENTIAL#${id}`,
          ':sk': 'WORKSTREAM#',
        },
      });

      if (existingWs.Items?.length) {
        const deleteRequests = existingWs.Items.map((item) => ({
          DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
        }));
        await this.dynamoDb.batchWrite(deleteRequests);
      }

      if (dto.workstreamIds.length > 0) {
        const operations = dto.workstreamIds.map((wsId) => ({
          Put: {
            Item: {
              PK: `CREDENTIAL#${id}`,
              SK: `WORKSTREAM#${wsId}`,
              id: uuidv4(),
              credentialId: id,
              workstreamId: wsId,
              createdAt: now,
            },
          },
        }));
        await this.dynamoDb.transactWrite(operations);
      }
    }

    return this.mapToCredential(result.Attributes!);
  }

  async rotate(id: string, newCredentials: Record<string, any>): Promise<Credential> {
    return this.update(id, {
      credentials: newCredentials,
      status: 'active',
    });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);

    // Delete workstream associations
    const wsResult = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `CREDENTIAL#${id}` },
    });

    const deleteRequests = [
      { DeleteRequest: { Key: { PK: `ACCOUNT#${existing.accountId}`, SK: `CREDENTIAL#${id}` } } },
      ...(wsResult.Items || []).map((item) => ({
        DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
      })),
    ];

    for (let i = 0; i < deleteRequests.length; i += 25) {
      await this.dynamoDb.batchWrite(deleteRequests.slice(i, i + 25));
    }
  }

  private mapToCredential(item: Record<string, any>): Credential {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      accountId: item.accountId,
      enterpriseId: item.enterpriseId,
      productId: item.productId,
      serviceId: item.serviceId,
      category: item.category,
      connector: item.connector,
      authType: item.authType,
      credentials: item.credentials,
      oauthAccessToken: item.oauthAccessToken,
      oauthRefreshToken: item.oauthRefreshToken,
      oauthTokenExpiresAt: item.oauthTokenExpiresAt,
      oauthScope: item.oauthScope,
      status: item.status || 'active',
      lastUsedAt: item.lastUsedAt,
      createdBy: item.createdBy,
      expiresAt: item.expiresAt,
      expiryNoticeDays: item.expiryNoticeDays || 30,
      expiryNotify: item.expiryNotify ?? true,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
