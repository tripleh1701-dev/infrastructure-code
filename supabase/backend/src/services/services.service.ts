import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { CreateServiceDto } from './dto/create-service.dto';

export interface Service {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ServicesService {
  constructor(private readonly dynamoDb: DynamoDBService) {}

  async findAll(): Promise<Service[]> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#SERVICE' },
    );

    return (result.Items || []).map(this.mapToService);
  }

  async findOne(id: string): Promise<Service> {
    const result = await this.dynamoDb.get({
      Key: { PK: `SERVICE#${id}`, SK: 'METADATA' },
    });

    if (!result.Item) {
      throw new NotFoundException(`Service with ID ${id} not found`);
    }

    return this.mapToService(result.Item);
  }

  async create(dto: CreateServiceDto): Promise<Service> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const service: Record<string, any> = {
      PK: `SERVICE#${id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#SERVICE',
      GSI1SK: `SERVICE#${id}`,
      id,
      name: dto.name,
      description: dto.description,
      createdAt: now,
      updatedAt: now,
    };

    await this.dynamoDb.put({ Item: service });

    return this.mapToService(service);
  }

  async update(id: string, dto: Partial<CreateServiceDto>): Promise<Service> {
    await this.findOne(id);

    const now = new Date().toISOString();
    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, any> = { ':updatedAt': now };

    if (dto.name !== undefined) {
      updateExpressions.push('#name = :name');
      names['#name'] = 'name';
      values[':name'] = dto.name;
    }

    if (dto.description !== undefined) {
      updateExpressions.push('#description = :description');
      names['#description'] = 'description';
      values[':description'] = dto.description;
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `SERVICE#${id}`, SK: 'METADATA' },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    });

    return this.mapToService(result.Attributes!);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.dynamoDb.delete({
      Key: { PK: `SERVICE#${id}`, SK: 'METADATA' },
    });
  }

  private mapToService(item: Record<string, any>): Service {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || item.createdAt,
    };
  }
}
