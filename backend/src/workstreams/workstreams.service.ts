import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { CreateWorkstreamDto } from './dto/create-workstream.dto';
import { UpdateWorkstreamDto } from './dto/update-workstream.dto';

export interface Workstream {
  id: string;
  name: string;
  accountId: string;
  enterpriseId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkstreamTool {
  id: string;
  workstreamId: string;
  toolName: string;
  category: string;
}

interface FindAllFilters {
  accountId?: string;
  enterpriseId?: string;
}

@Injectable()
export class WorkstreamsService {
  constructor(private readonly dynamoDb: DynamoDBService) {}

  async findAll(filters: FindAllFilters = {}): Promise<Workstream[]> {
    if (filters.accountId) {
      const result = await this.dynamoDb.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `ACCOUNT#${filters.accountId}`,
          ':sk': 'WORKSTREAM#',
        },
      });

      let workstreams = (result.Items || []).map(this.mapToWorkstream);

      if (filters.enterpriseId) {
        workstreams = workstreams.filter((w) => w.enterpriseId === filters.enterpriseId);
      }

      return workstreams;
    }

    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#WORKSTREAM' },
    );

    let workstreams = (result.Items || []).map(this.mapToWorkstream);

    if (filters.enterpriseId) {
      workstreams = workstreams.filter((w) => w.enterpriseId === filters.enterpriseId);
    }

    return workstreams;
  }

  async findOne(id: string): Promise<Workstream & { tools: WorkstreamTool[] }> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk AND GSI1SK = :sk',
      {
        ':pk': 'ENTITY#WORKSTREAM',
        ':sk': `WORKSTREAM#${id}`,
      },
    );

    if (!result.Items?.length) {
      throw new NotFoundException(`Workstream with ID ${id} not found`);
    }

    const workstream = this.mapToWorkstream(result.Items[0]);

    // Get tools
    const toolsResult = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `WORKSTREAM#${id}`,
        ':sk': 'TOOL#',
      },
    });

    return {
      ...workstream,
      tools: (toolsResult.Items || []).map(this.mapToTool),
    };
  }

  async create(dto: CreateWorkstreamDto): Promise<Workstream> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const workstream: Record<string, any> = {
      PK: `ACCOUNT#${dto.accountId}`,
      SK: `WORKSTREAM#${id}`,
      GSI1PK: 'ENTITY#WORKSTREAM',
      GSI1SK: `WORKSTREAM#${id}`,
      GSI2PK: `ENTERPRISE#${dto.enterpriseId}`,
      GSI2SK: `WORKSTREAM#${id}`,
      id,
      name: dto.name,
      accountId: dto.accountId,
      enterpriseId: dto.enterpriseId,
      createdAt: now,
      updatedAt: now,
    };

    const operations: any[] = [{ Put: { Item: workstream } }];

    // Add tools
    if (dto.tools?.length) {
      for (const tool of dto.tools) {
        const toolId = uuidv4();
        operations.push({
          Put: {
            Item: {
              PK: `WORKSTREAM#${id}`,
              SK: `TOOL#${toolId}`,
              id: toolId,
              workstreamId: id,
              toolName: tool.toolName,
              category: tool.category,
              createdAt: now,
            },
          },
        });
      }
    }

    await this.dynamoDb.transactWrite(operations);

    return this.mapToWorkstream(workstream);
  }

  async update(id: string, dto: UpdateWorkstreamDto): Promise<Workstream> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException(`Workstream with ID ${id} not found`);
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
      Key: { PK: `ACCOUNT#${existing.accountId}`, SK: `WORKSTREAM#${id}` },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return this.mapToWorkstream(result.Attributes!);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException(`Workstream with ID ${id} not found`);
    }

    // Delete workstream and its tools
    const toolsResult = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `WORKSTREAM#${id}` },
    });

    const deleteRequests = [
      { DeleteRequest: { Key: { PK: `ACCOUNT#${existing.accountId}`, SK: `WORKSTREAM#${id}` } } },
      ...(toolsResult.Items || []).map((item) => ({
        DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
      })),
    ];

    for (let i = 0; i < deleteRequests.length; i += 25) {
      await this.dynamoDb.batchWrite(deleteRequests.slice(i, i + 25));
    }
  }

  /**
   * Ensure a "Default" workstream exists for the given account + enterprise.
   * Returns the workstream ID (existing or newly created).
   */
  async ensureDefault(accountId: string, enterpriseId: string): Promise<string> {
    // Check if any workstream exists for this account + enterprise
    const existing = await this.findAll({ accountId, enterpriseId });

    if (existing.length > 0) {
      const defaultWs = existing.find((w) => w.name === 'Default');
      return defaultWs?.id || existing[0].id;
    }

    // Create a Default workstream
    const created = await this.create({
      name: 'Default',
      accountId,
      enterpriseId,
    } as any);

    return created.id;
  }

  private mapToWorkstream(item: Record<string, any>): Workstream {
    return {
      id: item.id,
      name: item.name,
      accountId: item.accountId,
      enterpriseId: item.enterpriseId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private mapToTool(item: Record<string, any>): WorkstreamTool {
    return {
      id: item.id,
      workstreamId: item.workstreamId,
      toolName: item.toolName,
      category: item.category,
    };
  }
}
