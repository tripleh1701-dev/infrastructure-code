import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { CreateBuildJobDto } from './dto/create-build-job.dto';
import { UpdateBuildJobDto } from './dto/update-build-job.dto';
import { CreateBuildExecutionDto } from './dto/create-build-execution.dto';

export interface BuildJob {
  id: string;
  accountId: string;
  enterpriseId: string;
  connectorName: string;
  description?: string;
  entity?: string;
  pipeline?: string;
  product: string;
  service: string;
  status: string;
  scope?: string;
  connectorIconName?: string;
  pipelineStagesState?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface BuildExecution {
  id: string;
  buildJobId: string;
  buildNumber: string;
  branch: string;
  status: string;
  duration?: string;
  timestamp: string;
  jiraNumber?: string;
  approvers?: string[];
  logs?: string;
  createdAt: string;
}

@Injectable()
export class BuildsService {
  constructor(private readonly dynamoDb: DynamoDBService) {}

  // ─── BUILD JOBS ────────────────────────────────────────────────────────────

  async findAllJobs(accountId?: string, enterpriseId?: string): Promise<BuildJob[]> {
    if (accountId) {
      const result = await this.dynamoDb.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `ACCOUNT#${accountId}`,
          ':sk': 'BUILD_JOB#',
        },
      });

      let items = (result.Items || []).map(this.mapToBuildJob);
      if (enterpriseId) {
        items = items.filter((b) => b.enterpriseId === enterpriseId);
      }
      return items;
    }

    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#BUILD_JOB' },
    );

    let items = (result.Items || []).map(this.mapToBuildJob);
    if (enterpriseId) {
      items = items.filter((b) => b.enterpriseId === enterpriseId);
    }
    return items;
  }

  async findOneJob(id: string): Promise<BuildJob> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk AND GSI1SK = :sk',
      {
        ':pk': 'ENTITY#BUILD_JOB',
        ':sk': `BUILD_JOB#${id}`,
      },
    );

    if (!result.Items?.length) {
      throw new NotFoundException(`Build job with ID ${id} not found`);
    }

    return this.mapToBuildJob(result.Items[0]);
  }

  async createJob(dto: CreateBuildJobDto): Promise<BuildJob> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const item: Record<string, any> = {
      PK: `ACCOUNT#${dto.accountId}`,
      SK: `BUILD_JOB#${id}`,
      GSI1PK: 'ENTITY#BUILD_JOB',
      GSI1SK: `BUILD_JOB#${id}`,
      GSI2PK: `ENTERPRISE#${dto.enterpriseId}`,
      GSI2SK: `BUILD_JOB#${id}`,
      id,
      accountId: dto.accountId,
      enterpriseId: dto.enterpriseId,
      connectorName: dto.connectorName,
      description: dto.description || null,
      entity: dto.entity || null,
      pipeline: dto.pipeline || null,
      product: dto.product || 'DevOps',
      service: dto.service || 'Integration',
      status: dto.status || 'ACTIVE',
      scope: dto.scope || null,
      connectorIconName: dto.connectorIconName || null,
      pipelineStagesState: dto.pipelineStagesState || {},
      createdAt: now,
      updatedAt: now,
    };

    await this.dynamoDb.put({ Item: item });

    return this.mapToBuildJob(item);
  }

  async updateJob(id: string, dto: UpdateBuildJobDto): Promise<BuildJob> {
    const existing = await this.findOneJob(id);

    const now = new Date().toISOString();
    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, any> = { ':updatedAt': now };

    const fields: [keyof UpdateBuildJobDto, string][] = [
      ['connectorName', 'connectorName'],
      ['description', 'description'],
      ['entity', 'entity'],
      ['pipeline', 'pipeline'],
      ['product', 'product'],
      ['service', 'service'],
      ['status', 'status'],
      ['scope', 'scope'],
      ['connectorIconName', 'connectorIconName'],
      ['pipelineStagesState', 'pipelineStagesState'],
    ];

    for (const [dtoKey, dbKey] of fields) {
      if (dto[dtoKey] !== undefined) {
        updateExpressions.push(`#${dbKey} = :${dbKey}`);
        names[`#${dbKey}`] = dbKey;
        values[`:${dbKey}`] = dto[dtoKey];
      }
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `ACCOUNT#${existing.accountId}`, SK: `BUILD_JOB#${id}` },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    });

    return this.mapToBuildJob(result.Attributes!);
  }

  async removeJob(id: string): Promise<void> {
    const existing = await this.findOneJob(id);

    // Delete all executions for this job
    const executions = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `BUILD_JOB#${id}`,
        ':sk': 'EXECUTION#',
      },
    });

    const deleteRequests = [
      { DeleteRequest: { Key: { PK: `ACCOUNT#${existing.accountId}`, SK: `BUILD_JOB#${id}` } } },
      ...(executions.Items || []).map((item) => ({
        DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
      })),
    ];

    for (let i = 0; i < deleteRequests.length; i += 25) {
      await this.dynamoDb.batchWrite(deleteRequests.slice(i, i + 25));
    }
  }

  // ─── BUILD EXECUTIONS ─────────────────────────────────────────────────────

  async findExecutions(buildJobId: string): Promise<BuildExecution[]> {
    const result = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `BUILD_JOB#${buildJobId}`,
        ':sk': 'EXECUTION#',
      },
    });

    return (result.Items || [])
      .map(this.mapToBuildExecution)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async createExecution(dto: CreateBuildExecutionDto): Promise<BuildExecution> {
    // Verify build job exists
    await this.findOneJob(dto.buildJobId);

    const id = uuidv4();
    const now = new Date().toISOString();

    const item: Record<string, any> = {
      PK: `BUILD_JOB#${dto.buildJobId}`,
      SK: `EXECUTION#${id}`,
      GSI1PK: 'ENTITY#BUILD_EXECUTION',
      GSI1SK: `EXECUTION#${id}`,
      id,
      buildJobId: dto.buildJobId,
      buildNumber: dto.buildNumber,
      branch: dto.branch || 'main',
      status: 'running',
      jiraNumber: dto.jiraNumber || null,
      approvers: dto.approvers || null,
      timestamp: now,
      createdAt: now,
    };

    await this.dynamoDb.put({ Item: item });

    return this.mapToBuildExecution(item);
  }

  async updateExecution(
    buildJobId: string,
    executionId: string,
    updates: { status?: string; duration?: string; logs?: string },
  ): Promise<BuildExecution> {
    const updateExpressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        updateExpressions.push(`#${key} = :${key}`);
        names[`#${key}`] = key;
        values[`:${key}`] = value;
      }
    }

    if (!updateExpressions.length) {
      throw new NotFoundException('No fields to update');
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `BUILD_JOB#${buildJobId}`, SK: `EXECUTION#${executionId}` },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    });

    if (!result.Attributes) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    return this.mapToBuildExecution(result.Attributes);
  }

  // ─── Mappers ───────────────────────────────────────────────────────────────

  private mapToBuildJob(item: Record<string, any>): BuildJob {
    return {
      id: item.id,
      accountId: item.accountId,
      enterpriseId: item.enterpriseId,
      connectorName: item.connectorName,
      description: item.description,
      entity: item.entity,
      pipeline: item.pipeline,
      product: item.product || 'DevOps',
      service: item.service || 'Integration',
      status: item.status || 'ACTIVE',
      scope: item.scope,
      connectorIconName: item.connectorIconName,
      pipelineStagesState: item.pipelineStagesState,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private mapToBuildExecution(item: Record<string, any>): BuildExecution {
    return {
      id: item.id,
      buildJobId: item.buildJobId,
      buildNumber: item.buildNumber,
      branch: item.branch || 'main',
      status: item.status || 'pending',
      duration: item.duration,
      timestamp: item.timestamp,
      jiraNumber: item.jiraNumber,
      approvers: item.approvers,
      logs: item.logs,
      createdAt: item.createdAt,
    };
  }
}
