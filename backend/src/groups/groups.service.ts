import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

export interface Group {
  id: string;
  name: string;
  description?: string;
  accountId?: string;
  enterpriseId?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class GroupsService {
  constructor(private readonly dynamoDb: DynamoDBService) {}

  async findAll(accountId?: string): Promise<Group[]> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#GROUP' },
    );

    let groups = (result.Items || []).map(this.mapToGroup);

    if (accountId) {
      groups = groups.filter((g) => (g as any).accountId === accountId);
    }

    // Deduplicate by name – keep the first occurrence per unique name
    const seen = new Set<string>();
    groups = groups.filter((g) => {
      if (seen.has(g.name)) return false;
      seen.add(g.name);
      return true;
    });

    return groups;
  }

  async findOne(id: string): Promise<Group> {
    const result = await this.dynamoDb.get({
      Key: { PK: `GROUP#${id}`, SK: 'METADATA' },
    });

    if (!result.Item) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    return this.mapToGroup(result.Item);
  }

  async create(dto: CreateGroupDto): Promise<Group> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const group: Record<string, any> = {
      PK: `GROUP#${id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#GROUP',
      GSI1SK: `GROUP#${id}`,
      id,
      name: dto.name,
      description: dto.description,
      createdAt: now,
      updatedAt: now,
    };

    await this.dynamoDb.put({ Item: group });

    return this.mapToGroup(group);
  }

  async update(id: string, dto: UpdateGroupDto): Promise<Group> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException(`Group with ID ${id} not found`);
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

    if (dto.description !== undefined) {
      updateExpressions.push('#description = :description');
      expressionAttributeNames['#description'] = 'description';
      expressionAttributeValues[':description'] = dto.description;
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `GROUP#${id}`, SK: 'METADATA' },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return this.mapToGroup(result.Attributes!);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    await this.dynamoDb.delete({
      Key: { PK: `GROUP#${id}`, SK: 'METADATA' },
    });
  }

  private mapToGroup(item: Record<string, any>): Group {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      accountId: item.accountId,
      enterpriseId: item.enterpriseId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
