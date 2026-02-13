import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBRouterService } from '../common/dynamodb/dynamodb-router.service';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { CreatePipelineDto, PipelineStatus } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { CognitoUser } from '../auth/interfaces/cognito-user.interface';

/**
 * Pipeline entity returned by the service layer
 */
export interface Pipeline {
  id: string;
  name: string;
  description?: string;
  accountId: string;
  enterpriseId: string;
  productId?: string;
  serviceIds?: string[];
  deploymentType: string;
  status: PipelineStatus;
  nodes: any[];
  edges: any[];
  yamlContent?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Pipelines Service
 *
 * Implements full CRUD with DynamoDB single-table design:
 *
 * Shared table (public accounts):
 *   PK: ACCT#<accountId>       SK: PIPELINE#<pipelineId>
 *   GSI1PK: ENTITY#PIPELINE    GSI1SK: PIPELINE#<pipelineId>
 *   GSI2PK: ENT#<enterpriseId> GSI2SK: PIPELINE#<pipelineId>
 *   GSI3PK: STATUS#<status>    GSI3SK: <updatedAt>
 *
 * Dedicated table (private accounts):
 *   PK: PIPELINE#LIST          SK: PIPELINE#<pipelineId>
 *   GSI1PK: ENTITY#PIPELINE    GSI1SK: PIPELINE#<pipelineId>
 *   GSI2PK: ENT#<enterpriseId> GSI2SK: PIPELINE#<pipelineId>
 *   GSI3PK: STATUS#<status>    GSI3SK: <updatedAt>
 */
@Injectable()
export class PipelinesService {
  private readonly logger = new Logger(PipelinesService.name);

  constructor(
    private readonly dynamoDb: DynamoDBService,
    private readonly dynamoDbRouter: DynamoDBRouterService,
  ) {}

  // ---------------------------------------------------------------------------
  // READ operations
  // ---------------------------------------------------------------------------

  /**
   * List all pipelines for an account, optionally filtered by enterprise
   */
  async findAll(
    accountId: string,
    enterpriseId?: string,
    status?: PipelineStatus,
  ): Promise<Pipeline[]> {
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

    if (enterpriseId) {
      // Query by enterprise via GSI2
      const result = isPrivate
        ? await this.dynamoDbRouter.queryByIndex(
            accountId,
            'GSI2',
            'GSI2PK = :pk',
            { ':pk': `ENT#${enterpriseId}` },
          )
        : await this.dynamoDb.queryByIndex(
            'GSI2',
            'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
            { ':pk': `ENT#${enterpriseId}`, ':sk': 'PIPELINE#' },
          );

      let items = (result.Items || []).filter(
        (item) => item.entityType === 'PIPELINE',
      );

      // For shared table, also filter by accountId for tenant isolation
      if (!isPrivate) {
        items = items.filter((item) => item.accountId === accountId);
      }

      if (status) {
        items = items.filter((item) => item.status === status);
      }

      return items.map(this.mapToPipeline);
    }

    // No enterprise filter — query all pipelines for the account
    if (isPrivate) {
      const result = await this.dynamoDbRouter.query(accountId, {
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': 'PIPELINE#LIST',
          ':sk': 'PIPELINE#',
        },
      });

      let items = result.Items || [];
      if (status) {
        items = items.filter((item) => item.status === status);
      }
      return items.map(this.mapToPipeline);
    }

    // Public account — query by ACCT PK partition
    const result = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ACCT#${accountId}`,
        ':sk': 'PIPELINE#',
      },
    });

    let items = result.Items || [];
    if (status) {
      items = items.filter((item) => item.status === status);
    }
    return items.map(this.mapToPipeline);
  }

  /**
   * Get a single pipeline by ID
   */
  async findOne(accountId: string, pipelineId: string): Promise<Pipeline> {
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

    const result = isPrivate
      ? await this.dynamoDbRouter.get(accountId, {
          Key: { PK: 'PIPELINE#LIST', SK: `PIPELINE#${pipelineId}` },
        })
      : await this.dynamoDb.get({
          Key: { PK: `ACCT#${accountId}`, SK: `PIPELINE#${pipelineId}` },
        });

    if (!result.Item) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

    // Verify tenant isolation for shared table
    if (!isPrivate && result.Item.accountId !== accountId) {
      throw new ForbiddenException('Access denied to this pipeline');
    }

    return this.mapToPipeline(result.Item);
  }

  // ---------------------------------------------------------------------------
  // WRITE operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new pipeline
   */
  async create(dto: CreatePipelineDto, user: CognitoUser): Promise<Pipeline> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const status = dto.status || PipelineStatus.DRAFT;

    this.logger.log(
      `Creating pipeline "${dto.name}" for account ${dto.accountId}`,
    );

    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(dto.accountId);

    const item: Record<string, any> = {
      // Keys — vary by table type
      PK: isPrivate ? 'PIPELINE#LIST' : `ACCT#${dto.accountId}`,
      SK: `PIPELINE#${id}`,

      // GSI keys for cross-cutting queries
      GSI1PK: 'ENTITY#PIPELINE',
      GSI1SK: `PIPELINE#${id}`,
      GSI2PK: `ENT#${dto.enterpriseId}`,
      GSI2SK: `PIPELINE#${id}`,
      GSI3PK: `STATUS#${status}`,
      GSI3SK: now,

      // Entity marker for GSI filtering
      entityType: 'PIPELINE',

      // Business attributes
      id,
      name: dto.name,
      description: dto.description || null,
      accountId: dto.accountId,
      enterpriseId: dto.enterpriseId,
      productId: dto.productId || null,
      serviceIds: dto.serviceIds || [],
      deploymentType: dto.deploymentType || 'cloud',
      status,
      nodes: dto.nodes || [],
      edges: dto.edges || [],
      yamlContent: dto.yamlContent || null,
      createdBy: user.sub,
      createdAt: now,
      updatedAt: now,
    };

    if (isPrivate) {
      await this.dynamoDbRouter.put(dto.accountId, { Item: item });
    } else {
      await this.dynamoDb.put({ Item: item });
    }

    this.logger.log(`Pipeline ${id} created successfully`);
    return this.mapToPipeline(item);
  }

  /**
   * Update an existing pipeline
   *
   * Uses a DynamoDB UpdateExpression to patch only the changed fields,
   * including GSI key updates when status changes.
   */
  async update(
    accountId: string,
    pipelineId: string,
    dto: UpdatePipelineDto,
  ): Promise<Pipeline> {
    // Verify existence + tenant access
    const existing = await this.findOne(accountId, pipelineId);

    const now = new Date().toISOString();
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, any> = { ':updatedAt': now };

    // Build dynamic update expression from provided fields
    const fieldMap: [keyof UpdatePipelineDto, string][] = [
      ['name', 'name'],
      ['description', 'description'],
      ['productId', 'productId'],
      ['serviceIds', 'serviceIds'],
      ['deploymentType', 'deploymentType'],
      ['nodes', 'nodes'],
      ['edges', 'edges'],
      ['yamlContent', 'yamlContent'],
    ];

    for (const [dtoKey, dbKey] of fieldMap) {
      if (dto[dtoKey] !== undefined) {
        updateExpressions.push(`#${dbKey} = :${dbKey}`);
        names[`#${dbKey}`] = dbKey;
        values[`:${dbKey}`] = dto[dtoKey];
      }
    }

    // Status change also updates GSI3PK for status-based queries
    if (dto.status !== undefined) {
      updateExpressions.push('#status = :status');
      updateExpressions.push('GSI3PK = :gsi3pk');
      updateExpressions.push('GSI3SK = :gsi3sk');
      names['#status'] = 'status';
      values[':status'] = dto.status;
      values[':gsi3pk'] = `STATUS#${dto.status}`;
      values[':gsi3sk'] = now;
    }

    const key = isPrivate
      ? { PK: 'PIPELINE#LIST', SK: `PIPELINE#${pipelineId}` }
      : { PK: `ACCT#${accountId}`, SK: `PIPELINE#${pipelineId}` };

    const updateParams = {
      Key: key,
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW' as const,
    };

    const result = isPrivate
      ? await this.dynamoDbRouter.update(accountId, updateParams)
      : await this.dynamoDb.update(updateParams);

    this.logger.log(`Pipeline ${pipelineId} updated`);
    return this.mapToPipeline(result.Attributes!);
  }

  /**
   * Delete a pipeline
   */
  async remove(accountId: string, pipelineId: string): Promise<void> {
    // Verify existence + tenant access
    await this.findOne(accountId, pipelineId);

    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

    const key = isPrivate
      ? { PK: 'PIPELINE#LIST', SK: `PIPELINE#${pipelineId}` }
      : { PK: `ACCT#${accountId}`, SK: `PIPELINE#${pipelineId}` };

    if (isPrivate) {
      await this.dynamoDbRouter.delete(accountId, { Key: key });
    } else {
      await this.dynamoDb.delete({ Key: key });
    }

    this.logger.log(`Pipeline ${pipelineId} deleted`);
  }

  // ---------------------------------------------------------------------------
  // Bulk / Utility operations
  // ---------------------------------------------------------------------------

  /**
   * Duplicate a pipeline (clone with a new ID)
   */
  async duplicate(
    accountId: string,
    pipelineId: string,
    user: CognitoUser,
  ): Promise<Pipeline> {
    const existing = await this.findOne(accountId, pipelineId);

    const createDto: CreatePipelineDto = {
      name: `${existing.name} (Copy)`,
      description: existing.description,
      accountId: existing.accountId,
      enterpriseId: existing.enterpriseId,
      productId: existing.productId,
      serviceIds: existing.serviceIds,
      deploymentType: existing.deploymentType,
      status: PipelineStatus.DRAFT,
      nodes: existing.nodes,
      edges: existing.edges,
      yamlContent: existing.yamlContent,
    };

    return this.create(createDto, user);
  }

  /**
   * Count pipelines by status for a given account (dashboard metrics)
   */
  async countByStatus(
    accountId: string,
    enterpriseId?: string,
  ): Promise<Record<string, number>> {
    const all = await this.findAll(accountId, enterpriseId);

    const counts: Record<string, number> = {
      draft: 0,
      active: 0,
      inactive: 0,
      archived: 0,
      total: all.length,
    };

    for (const pipeline of all) {
      if (counts[pipeline.status] !== undefined) {
        counts[pipeline.status]++;
      }
    }

    return counts;
  }

  // ---------------------------------------------------------------------------
  // Mapper
  // ---------------------------------------------------------------------------

  private mapToPipeline(item: Record<string, any>): Pipeline {
    return {
      id: item.id,
      name: item.name,
      description: item.description ?? undefined,
      accountId: item.accountId,
      enterpriseId: item.enterpriseId,
      productId: item.productId ?? undefined,
      serviceIds: item.serviceIds ?? [],
      deploymentType: item.deploymentType || 'cloud',
      status: item.status || PipelineStatus.DRAFT,
      nodes: item.nodes || [],
      edges: item.edges || [],
      yamlContent: item.yamlContent ?? undefined,
      createdBy: item.createdBy ?? undefined,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
