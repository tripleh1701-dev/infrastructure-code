import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

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
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class EnvironmentsService {
  constructor(private readonly dynamoDb: DynamoDBService) {}

  async findAll(accountId?: string, enterpriseId?: string): Promise<Environment[]> {
    if (accountId) {
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

    // Fallback: scan by GSI1
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

  async findOne(id: string): Promise<Environment> {
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

    const item: Record<string, any> = {
      PK: `ACCOUNT#${dto.accountId}`,
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
      createdAt: now,
      updatedAt: now,
    };

    await this.dynamoDb.put({ Item: item });

    return this.mapToEnvironment(item);
  }

  async update(id: string, dto: UpdateEnvironmentDto): Promise<Environment> {
    const existing = await this.findOne(id);

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
    ];

    for (const [dtoKey, dbKey] of fields) {
      if (dto[dtoKey] !== undefined) {
        updateExpressions.push(`#${dbKey} = :${dbKey}`);
        names[`#${dbKey}`] = dbKey;
        values[`:${dbKey}`] = dto[dtoKey];
      }
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `ACCOUNT#${existing.accountId}`, SK: `ENVIRONMENT#${id}` },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    });

    return this.mapToEnvironment(result.Attributes!);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);

    await this.dynamoDb.delete({
      Key: { PK: `ACCOUNT#${existing.accountId}`, SK: `ENVIRONMENT#${id}` },
    });
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
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
