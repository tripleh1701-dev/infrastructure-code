import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { DynamoDBService } from "../common/dynamodb/dynamodb.service";
import { DynamoDBRouterService } from "../common/dynamodb/dynamodb-router.service";
import { CreateBuildJobDto } from "./dto/create-build-job.dto";
import { UpdateBuildJobDto } from "./dto/update-build-job.dto";
import { CreateBuildExecutionDto } from "./dto/create-build-execution.dto";

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
  selectedArtifacts?: any[];
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

/**
 * Builds Service
 *
 * Routes all customer operational data to the correct DynamoDB table:
 * - Public accounts → shared customer table (account-admin-public-staging)
 *   PK: ACCOUNT#<accountId>         SK: BUILD_JOB#<id>
 * - Private accounts → dedicated customer table
 *   PK: BUILD_JOB#LIST             SK: BUILD_JOB#<id>
 * - Admin queries (no accountId) → control plane table
 */
@Injectable()
export class BuildsService {
  private readonly logger = new Logger(BuildsService.name);

  constructor(
    private readonly dynamoDb: DynamoDBService,
    private readonly dynamoDbRouter: DynamoDBRouterService,
  ) {}

  // ─── BUILD JOBS ────────────────────────────────────────────────────────────

  async findAllJobs(accountId?: string, enterpriseId?: string): Promise<BuildJob[]> {
    if (!accountId) {
      // Admin query — control plane table only
      const result = await this.dynamoDb.queryByIndex("GSI1", "GSI1PK = :pk", { ":pk": "ENTITY#BUILD_JOB" });
      let items = (result.Items || []).map(this.mapToBuildJob);
      if (enterpriseId) {
        items = items.filter((b) => b.enterpriseId === enterpriseId);
      }
      return items;
    }

    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

    if (isCustomer) {
      const pk = isPrivate ? "BUILD_JOB#LIST" : `ACCOUNT#${accountId}`;
      const result = await this.dynamoDbRouter.query(accountId, {
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":sk": "BUILD_JOB#",
        },
      });

      let items = (result.Items || []).map(this.mapToBuildJob);
      if (enterpriseId) {
        items = items.filter((b) => b.enterpriseId === enterpriseId);
      }
      return items;
    }

    // Fallback: control plane
    const result = await this.dynamoDb.query({
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `ACCOUNT#${accountId}`,
        ":sk": "BUILD_JOB#",
      },
    });

    let items = (result.Items || []).map(this.mapToBuildJob);
    if (enterpriseId) {
      items = items.filter((b) => b.enterpriseId === enterpriseId);
    }
    return items;
  }

  async findOneJob(id: string, accountId?: string): Promise<BuildJob> {
    if (accountId) {
      const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);
      const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

      if (isCustomer) {
        const pk = isPrivate ? "BUILD_JOB#LIST" : `ACCOUNT#${accountId}`;
        const result = await this.dynamoDbRouter.get(accountId, {
          Key: { PK: pk, SK: `BUILD_JOB#${id}` },
        });
        if (result.Item) {
          return this.mapToBuildJob(result.Item);
        }
      }
    }

    // Fallback: GSI lookup on control plane table
    const result = await this.dynamoDb.queryByIndex("GSI1", "GSI1PK = :pk AND GSI1SK = :sk", {
      ":pk": "ENTITY#BUILD_JOB",
      ":sk": `BUILD_JOB#${id}`,
    });

    if (!result.Items?.length) {
      throw new NotFoundException(`Build job with ID ${id} not found`);
    }

    return this.mapToBuildJob(result.Items[0]);
  }

  async createJob(dto: CreateBuildJobDto): Promise<BuildJob> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(dto.accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(dto.accountId);

    this.logger.log(
      `Creating build job for account ${dto.accountId} (${isCustomer ? (isPrivate ? 'private' : 'public') : 'control-plane'} table)`,
    );

    const item: Record<string, any> = {
      PK: isPrivate ? "BUILD_JOB#LIST" : `ACCOUNT#${dto.accountId}`,
      SK: `BUILD_JOB#${id}`,
      GSI1PK: "ENTITY#BUILD_JOB",
      GSI1SK: `BUILD_JOB#${id}`,
      GSI2PK: `ENTERPRISE#${dto.enterpriseId}`,
      GSI2SK: `BUILD_JOB#${id}`,
      entityType: "BUILD_JOB",
      id,
      accountId: dto.accountId,
      enterpriseId: dto.enterpriseId,
      connectorName: dto.connectorName,
      description: dto.description || null,
      entity: dto.entity || null,
      pipeline: dto.pipeline || null,
      product: dto.product || "DevOps",
      service: dto.service || "Integration",
      status: dto.status || "ACTIVE",
      scope: dto.scope || null,
      connectorIconName: dto.connectorIconName || null,
      pipelineStagesState: dto.pipelineStagesState || {},
      selectedArtifacts: dto.selectedArtifacts || [],
      createdAt: now,
      updatedAt: now,
    };

    if (isCustomer) {
      await this.dynamoDbRouter.put(dto.accountId, { Item: item });
    } else {
      await this.dynamoDb.put({ Item: item });
    }

    this.logger.log(`Build job ${id} created successfully`);
    return this.mapToBuildJob(item);
  }

  async updateJob(id: string, dto: UpdateBuildJobDto): Promise<BuildJob> {
    const existing = await this.findOneJob(id);
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(existing.accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(existing.accountId);

    const now = new Date().toISOString();
    const updateExpressions: string[] = ["#updatedAt = :updatedAt"];
    const names: Record<string, string> = { "#updatedAt": "updatedAt" };
    const values: Record<string, any> = { ":updatedAt": now };

    const fields: [keyof UpdateBuildJobDto, string][] = [
      ["connectorName", "connectorName"],
      ["description", "description"],
      ["entity", "entity"],
      ["pipeline", "pipeline"],
      ["product", "product"],
      ["service", "service"],
      ["status", "status"],
      ["scope", "scope"],
      ["connectorIconName", "connectorIconName"],
      ["pipelineStagesState", "pipelineStagesState"],
      ["selectedArtifacts", "selectedArtifacts"],
    ];

    for (const [dtoKey, dbKey] of fields) {
      if (dto[dtoKey] !== undefined) {
        updateExpressions.push(`#${dbKey} = :${dbKey}`);
        names[`#${dbKey}`] = dbKey;
        values[`:${dbKey}`] = dto[dtoKey];
      }
    }

    const key = isPrivate
      ? { PK: "BUILD_JOB#LIST", SK: `BUILD_JOB#${id}` }
      : { PK: `ACCOUNT#${existing.accountId}`, SK: `BUILD_JOB#${id}` };

    const updateParams = {
      Key: key,
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW" as const,
    };

    const result = isCustomer
      ? await this.dynamoDbRouter.update(existing.accountId, updateParams)
      : await this.dynamoDb.update(updateParams);

    this.logger.log(`Build job ${id} updated (${isCustomer ? 'customer' : 'control-plane'} table)`);
    return this.mapToBuildJob(result.Attributes!);
  }

  async removeJob(id: string): Promise<void> {
    const existing = await this.findOneJob(id);
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(existing.accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(existing.accountId);

    // Delete all executions for this job
    let execItems: Record<string, any>[] = [];
    if (isCustomer) {
      const execResult = await this.dynamoDbRouter.query(existing.accountId, {
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `BUILD_JOB#${id}`,
          ":sk": "EXECUTION#",
        },
      });
      execItems = execResult.Items || [];
    } else {
      const execResult = await this.dynamoDb.query({
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `BUILD_JOB#${id}`,
          ":sk": "EXECUTION#",
        },
      });
      execItems = execResult.Items || [];
    }

    const jobKey = isPrivate
      ? { PK: "BUILD_JOB#LIST", SK: `BUILD_JOB#${id}` }
      : { PK: `ACCOUNT#${existing.accountId}`, SK: `BUILD_JOB#${id}` };

    const deleteRequests = [
      { DeleteRequest: { Key: jobKey } },
      ...execItems.map((item) => ({
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

    this.logger.log(`Build job ${id} deleted (${isCustomer ? 'customer' : 'control-plane'} table)`);
  }

  // ─── BUILD EXECUTIONS ─────────────────────────────────────────────────────

  async findExecutions(buildJobId: string, accountId?: string): Promise<BuildExecution[]> {
    let items: Record<string, any>[] = [];

    if (accountId) {
      const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);

      if (isCustomer) {
        const result = await this.dynamoDbRouter.query(accountId, {
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `BUILD_JOB#${buildJobId}`,
            ":sk": "EXECUTION#",
          },
        });
        items = result.Items || [];
      } else {
        const result = await this.dynamoDb.query({
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `BUILD_JOB#${buildJobId}`,
            ":sk": "EXECUTION#",
          },
        });
        items = result.Items || [];
      }
    } else {
      const result = await this.dynamoDb.query({
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `BUILD_JOB#${buildJobId}`,
          ":sk": "EXECUTION#",
        },
      });
      items = result.Items || [];
    }

    return items
      .map(this.mapToBuildExecution)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async createExecution(dto: CreateBuildExecutionDto): Promise<BuildExecution> {
    if (!dto.buildJobId) {
      throw new Error("buildJobId is required");
    }
    const buildJob = await this.findOneJob(dto.buildJobId);
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(buildJob.accountId);

    const id = uuidv4();
    const now = new Date().toISOString();

    const item: Record<string, any> = {
      PK: `BUILD_JOB#${dto.buildJobId}`,
      SK: `EXECUTION#${id}`,
      GSI1PK: "ENTITY#BUILD_EXECUTION",
      GSI1SK: `EXECUTION#${id}`,
      id,
      buildJobId: dto.buildJobId,
      buildNumber: dto.buildNumber,
      branch: dto.branch || "main",
      status: "running",
      jiraNumber: dto.jiraNumber || null,
      approvers: dto.approvers || null,
      timestamp: now,
      createdAt: now,
    };

    if (isCustomer) {
      await this.dynamoDbRouter.put(buildJob.accountId, { Item: item });
    } else {
      await this.dynamoDb.put({ Item: item });
    }

    this.logger.log(`Execution ${id} created for build job ${dto.buildJobId} (${isCustomer ? 'customer' : 'control-plane'} table)`);
    return this.mapToBuildExecution(item);
  }

  async updateExecution(
    buildJobId: string,
    executionId: string,
    updates: { status?: string; duration?: string; logs?: string },
    accountId?: string,
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
      throw new NotFoundException("No fields to update");
    }

    const updateParams = {
      Key: { PK: `BUILD_JOB#${buildJobId}`, SK: `EXECUTION#${executionId}` },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW" as const,
    };

    let result;
    if (accountId) {
      const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);
      result = isCustomer
        ? await this.dynamoDbRouter.update(accountId, updateParams)
        : await this.dynamoDb.update(updateParams);
    } else {
      result = await this.dynamoDb.update(updateParams);
    }

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
      product: item.product || "DevOps",
      service: item.service || "Integration",
      status: item.status || "ACTIVE",
      scope: item.scope,
      connectorIconName: item.connectorIconName,
      pipelineStagesState: item.pipelineStagesState,
      selectedArtifacts: item.selectedArtifacts || [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private mapToBuildExecution(item: Record<string, any>): BuildExecution {
    return {
      id: item.id,
      buildJobId: item.buildJobId,
      buildNumber: item.buildNumber,
      branch: item.branch || "main",
      status: item.status || "pending",
      duration: item.duration,
      timestamp: item.timestamp,
      jiraNumber: item.jiraNumber,
      approvers: item.approvers,
      logs: item.logs,
      createdAt: item.createdAt,
    };
  }
}
