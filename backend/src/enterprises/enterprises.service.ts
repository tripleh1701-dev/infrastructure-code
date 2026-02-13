import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { CreateEnterpriseDto } from './dto/create-enterprise.dto';
import { UpdateEnterpriseDto } from './dto/update-enterprise.dto';

export interface Enterprise {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseProduct {
  id: string;
  enterpriseId: string;
  productId: string;
}

export interface EnterpriseService {
  id: string;
  enterpriseId: string;
  serviceId: string;
}

@Injectable()
export class EnterprisesService {
  constructor(private readonly dynamoDb: DynamoDBService) {}

  async findAll(): Promise<Enterprise[]> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#ENTERPRISE' },
    );

    return (result.Items || []).map(this.mapToEnterprise);
  }

  async findOne(id: string): Promise<Enterprise & { products: string[]; services: string[] }> {
    const result = await this.dynamoDb.get({
      Key: { PK: `ENTERPRISE#${id}`, SK: 'METADATA' },
    });

    if (!result.Item) {
      throw new NotFoundException(`Enterprise with ID ${id} not found`);
    }

    // Get products
    const productsResult = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ENTERPRISE#${id}`,
        ':sk': 'PRODUCT#',
      },
    });

    // Get services
    const servicesResult = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ENTERPRISE#${id}`,
        ':sk': 'SERVICE#',
      },
    });

    return {
      ...this.mapToEnterprise(result.Item),
      products: (productsResult.Items || []).map((i) => i.productId),
      services: (servicesResult.Items || []).map((i) => i.serviceId),
    };
  }

  async create(dto: CreateEnterpriseDto): Promise<Enterprise> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const enterprise: Record<string, any> = {
      PK: `ENTERPRISE#${id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#ENTERPRISE',
      GSI1SK: `ENTERPRISE#${id}`,
      id,
      name: dto.name,
      createdAt: now,
      updatedAt: now,
    };

    const operations: any[] = [{ Put: { Item: enterprise } }];

    // Add products
    if (dto.products?.length) {
      for (const productId of dto.products) {
        operations.push({
          Put: {
            Item: {
              PK: `ENTERPRISE#${id}`,
              SK: `PRODUCT#${productId}`,
              enterpriseId: id,
              productId,
              createdAt: now,
            },
          },
        });
      }
    }

    // Add services
    if (dto.services?.length) {
      for (const serviceId of dto.services) {
        operations.push({
          Put: {
            Item: {
              PK: `ENTERPRISE#${id}`,
              SK: `SERVICE#${serviceId}`,
              enterpriseId: id,
              serviceId,
              createdAt: now,
            },
          },
        });
      }
    }

    await this.dynamoDb.transactWrite(operations);

    return this.mapToEnterprise(enterprise);
  }

  async update(id: string, dto: UpdateEnterpriseDto): Promise<Enterprise> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException(`Enterprise with ID ${id} not found`);
    }

    const now = new Date().toISOString();

    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const expressionAttributeNames: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues: Record<string, any> = {
      ':updatedAt': now,
    };

    if (dto.name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = dto.name;
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `ENTERPRISE#${id}`, SK: 'METADATA' },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return this.mapToEnterprise(result.Attributes!);
  }

  async remove(id: string): Promise<void> {
    const items = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `ENTERPRISE#${id}` },
    });

    if (!items.Items?.length) {
      throw new NotFoundException(`Enterprise with ID ${id} not found`);
    }

    const deleteRequests = items.Items.map((item) => ({
      DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
    }));

    for (let i = 0; i < deleteRequests.length; i += 25) {
      await this.dynamoDb.batchWrite(deleteRequests.slice(i, i + 25));
    }
  }

  private mapToEnterprise(item: Record<string, any>): Enterprise {
    return {
      id: item.id,
      name: item.name,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
