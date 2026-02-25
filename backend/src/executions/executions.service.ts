import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { DynamoDBRouterService } from '../common/dynamodb/dynamodb-router.service';
import { PipelinesService } from '../pipelines/pipelines.service';
import { YamlParserService, ParsedPipeline } from './yaml-parser.service';
import { DependencyResolverService } from './dependency-resolver.service';
import { StageHandlersService } from './stage-handlers.service';
import { InboxService } from '../inbox/inbox.service';
import { resolveAwsCredentials } from '../common/utils/aws-credentials';

export type ExecutionStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'WAITING_APPROVAL';

export interface ExecutionRecord {
  executionId: string;
  pipelineId: string;
  buildJobId?: string;
  accountId: string;
  userId: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  currentNode?: string;
  currentStage?: string;
  stageStates: Record<string, any>;
  pipelineSnapshot?: any;
}

/**
 * Executions Service
 *
 * Routes all customer operational data to the correct DynamoDB table:
 * - Public accounts → shared customer table (PK: ACCT#<accountId>)
 * - Private accounts → dedicated customer table (PK: EXEC#LIST)
 * - Admin queries → control plane table
 */
@Injectable()
export class ExecutionsService {
  private readonly logger = new Logger(ExecutionsService.name);
  private lambdaClient: LambdaClient;
  private executorFunctionName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly dynamoDb: DynamoDBService,
    private readonly dynamoDbRouter: DynamoDBRouterService,
    private readonly pipelinesService: PipelinesService,
    private readonly yamlParser: YamlParserService,
    private readonly dependencyResolver: DependencyResolverService,
    private readonly stageHandlers: StageHandlersService,
    @Inject(forwardRef(() => InboxService))
    private readonly inboxService: InboxService,
  ) {
    const region = this.configService.get('AWS_REGION', 'us-east-1');
    const credentials = resolveAwsCredentials(
      this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
    );
    this.lambdaClient = new LambdaClient({ region, ...(credentials && { credentials }) });
    this.executorFunctionName = this.configService.get<string>(
      'PIPELINE_EXECUTOR_FUNCTION',
      'license-portal-staging-pipeline-executor',
    );
  }

  // ---------------------------------------------------------------------------
  // RUN PIPELINE
  // ---------------------------------------------------------------------------

  async runPipeline(
    accountId: string,
    pipelineId: string,
    userId: string,
    userEmail: string,
    buildJobId?: string,
    branch?: string,
    approverEmails?: string[],
  ): Promise<{ executionId: string }> {
    const pipeline = await this.pipelinesService.findOne(accountId, pipelineId);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

    let parsedPipeline: ParsedPipeline;
    if (pipeline.yamlContent) {
      parsedPipeline = this.yamlParser.parse(pipeline.yamlContent);
    } else {
      parsedPipeline = this.yamlParser.parseFromCanvasData(
        pipeline.nodes || [],
        pipeline.edges || [],
      );
    }

    if (parsedPipeline.nodes.length === 0) {
      throw new BadRequestException('Pipeline has no executable nodes');
    }

    const executionId = uuidv4();
    const now = new Date().toISOString();

    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

    const executionItem: Record<string, any> = {
      PK: isPrivate ? 'EXEC#LIST' : `ACCT#${accountId}`,
      SK: `EXEC#${executionId}`,
      GSI1PK: 'ENTITY#EXECUTION',
      GSI1SK: `EXEC#${executionId}`,
      GSI2PK: `PIPELINE#${pipelineId}`,
      GSI2SK: `EXEC#${executionId}`,
      entityType: 'EXECUTION',
      id: executionId,
      executionId,
      pipelineId,
      buildJobId: buildJobId || null,
      accountId,
      userId,
      status: 'RUNNING',
      startTime: now,
      currentNode: null,
      currentStage: null,
      stageStates: {},
      branch: branch || 'main',
      approverEmails: approverEmails || [],
      userEmail: userEmail || null,
      createdAt: now,
      updatedAt: now,
    };

    if (isCustomer) {
      await this.dynamoDbRouter.put(accountId, { Item: executionItem });
    } else {
      await this.dynamoDb.put({ Item: executionItem });
    }

    this.logger.log(`[EXECUTION:${executionId}] Pipeline execution started for ${pipelineId}`);

    // Invoke the pipeline-executor Lambda asynchronously (InvocationType: Event)
    // This ensures the execution runs in its own Lambda invocation and is not
    // killed when the API Gateway Lambda returns the response.
    try {
      const payload = {
        executionId,
        accountId,
        pipelineId,
        buildJobId: buildJobId || null,
        userId,
        userEmail: userEmail || null,
        branch: branch || 'main',
        approverEmails: approverEmails || [],
        pipelineName: pipeline?.name || parsedPipeline.name,
        parsedPipeline: {
          name: parsedPipeline.name,
          nodes: parsedPipeline.nodes,
        },
        isCustomer,
        isPrivate,
      };

      this.logger.log(
        `[EXECUTION:${executionId}] Invoking Lambda ${this.executorFunctionName} asynchronously`,
      );

      const result = await this.lambdaClient.send(
        new InvokeCommand({
          FunctionName: this.executorFunctionName,
          InvocationType: 'Event', // Async — returns 202 immediately
          Payload: Buffer.from(JSON.stringify(payload)),
        }),
      );

      this.logger.log(
        `[EXECUTION:${executionId}] Lambda invoked, StatusCode: ${result.StatusCode}`,
      );
    } catch (lambdaErr: any) {
      this.logger.error(
        `[EXECUTION:${executionId}] Failed to invoke pipeline-executor Lambda: ${lambdaErr.message}`,
      );

      // Mark execution as FAILED since the executor won't run
      await this.finalizeExecution(executionId, accountId, isCustomer, isPrivate, 'FAILED');

      throw new BadRequestException(
        `Failed to start pipeline execution: ${lambdaErr.message}`,
      );
    }

    return { executionId };
  }

  // ---------------------------------------------------------------------------
  // GET EXECUTION STATUS + LOGS
  // ---------------------------------------------------------------------------

  async getExecutionLogs(
    accountId: string,
    executionId: string,
  ): Promise<{
    status: ExecutionStatus;
    stageStates: Record<string, any>;
    currentNode?: string;
    currentStage?: string;
    startTime: string;
    endTime?: string;
    logs: string[];
  }> {
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

    const pk = isPrivate ? 'EXEC#LIST' : `ACCT#${accountId}`;

    const result = isCustomer
      ? await this.dynamoDbRouter.get(accountId, {
          Key: { PK: pk, SK: `EXEC#${executionId}` },
        })
      : await this.dynamoDb.get({
          Key: { PK: `ACCT#${accountId}`, SK: `EXEC#${executionId}` },
        });

    if (!result.Item) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    const item = result.Item;
    if (item.accountId !== accountId) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    const stagesResult = isCustomer
      ? await this.dynamoDbRouter.query(accountId, {
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `EXEC#${executionId}`,
            ':sk': 'STAGE#',
          },
        })
      : await this.dynamoDb.query({
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `EXEC#${executionId}`,
            ':sk': 'STAGE#',
          },
        });

    const stageRecords = (stagesResult.Items || []).map((s) => ({
      stageId: s.stageId,
      nodeId: s.nodeId,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      message: s.message,
    }));

    const logs = stageRecords.map(
      (s) =>
        `[NODE:${s.nodeId}][STAGE:${s.stageId}] ${s.status}${s.message ? ` — ${s.message}` : ''} (${s.startedAt || ''})`,
    );

    return {
      status: item.status as ExecutionStatus,
      stageStates: item.stageStates || {},
      currentNode: item.currentNode,
      currentStage: item.currentStage,
      startTime: item.startTime,
      endTime: item.endTime,
      logs,
    };
  }

  // ---------------------------------------------------------------------------
  // LIST EXECUTIONS FOR PIPELINE
  // ---------------------------------------------------------------------------

  async listExecutions(
    accountId: string,
    pipelineId: string,
  ): Promise<any[]> {
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);

    const result = isCustomer
      ? await this.dynamoDbRouter.queryByIndex(
          accountId,
          'GSI2',
          'GSI2PK = :pk',
          { ':pk': `PIPELINE#${pipelineId}` },
        )
      : await this.dynamoDb.queryByIndex(
          'GSI2',
          'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
          { ':pk': `PIPELINE#${pipelineId}`, ':sk': 'EXEC#' },
        );

    return (result.Items || [])
      .filter((item) => item.entityType === 'EXECUTION')
      .map((item) => ({
        executionId: item.executionId,
        pipelineId: item.pipelineId,
        buildJobId: item.buildJobId,
        status: item.status,
        startTime: item.startTime,
        endTime: item.endTime,
        currentNode: item.currentNode,
        currentStage: item.currentStage,
        branch: item.branch,
      }));
  }

  // ---------------------------------------------------------------------------
  // APPROVE STAGE
  // ---------------------------------------------------------------------------

  async approveStage(
    accountId: string,
    executionId: string,
    stageId: string,
    userId: string,
  ): Promise<void> {
    const isCustomer = await this.dynamoDbRouter.isCustomerAccount(accountId);
    const isPrivate = await this.dynamoDbRouter.isPrivateAccount(accountId);

    const stageKey = { PK: `EXEC#${executionId}`, SK: `STAGE#${stageId}` };

    try {
      const stageParams = {
        Key: stageKey,
        UpdateExpression: 'SET #status = :status, approvedBy = :user, approvedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'APPROVED',
          ':user': userId,
          ':now': new Date().toISOString(),
        },
      };

      if (isCustomer) {
        await this.dynamoDbRouter.update(accountId, stageParams);
      } else {
        await this.dynamoDb.update(stageParams);
      }
    } catch {
      throw new NotFoundException(`Stage ${stageId} not found for execution ${executionId}`);
    }

    const execKey = isPrivate
      ? { PK: 'EXEC#LIST', SK: `EXEC#${executionId}` }
      : { PK: `ACCT#${accountId}`, SK: `EXEC#${executionId}` };

    const execParams = {
      Key: execKey,
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'RUNNING',
        ':now': new Date().toISOString(),
      },
    };

    if (isCustomer) {
      await this.dynamoDbRouter.update(accountId, execParams);
    } else {
      await this.dynamoDb.update(execParams);
    }

    console.log(`[EXECUTION:${executionId}][STAGE:${stageId}] APPROVED by ${userId}`);
    this.logger.log(`Stage ${stageId} approved for execution ${executionId}`);
  }

  // ---------------------------------------------------------------------------
  // EXECUTION ENGINE (async, runs after returning executionId)
  // ---------------------------------------------------------------------------

  async executePipeline(
    executionId: string,
    accountId: string,
    pipeline: ParsedPipeline,
    isCustomer: boolean,
    isPrivate: boolean,
    userId?: string,
    userEmail?: string,
    approverEmails?: string[],
    pipelineId?: string,
    buildJobId?: string,
    branch?: string,
    pipelineName?: string,
  ): Promise<void> {
    console.log(`[EXECUTION:${executionId}] Starting pipeline: ${pipeline.name}`);
    console.log(`[EXECUTION:${executionId}] Nodes: ${pipeline.nodes.map((n) => n.id).join(', ')}`);

    try {
      const nodeTiers = this.dependencyResolver.resolveNodeOrder(pipeline.nodes);

      for (const tier of nodeTiers) {
        for (const node of tier) {
          console.log(`[EXECUTION:${executionId}][NODE:${node.id}] Starting node: ${node.name}`);

          await this.updateExecutionProgress(executionId, accountId, isCustomer, isPrivate, {
            currentNode: node.id,
          });

          const orderedStages = this.dependencyResolver.resolveStageOrder(node.stages);

          for (const stage of orderedStages) {
            await this.updateExecutionProgress(executionId, accountId, isCustomer, isPrivate, {
              currentStage: stage.id,
            });

            await this.writeStageRecord(executionId, accountId, isCustomer, {
              nodeId: node.id,
              stageId: stage.id,
              stageName: stage.name,
              stageType: stage.type,
              status: 'RUNNING',
              startedAt: new Date().toISOString(),
            });

            const result = await this.stageHandlers.executeStage(
              executionId,
              node.id,
              stage,
              approverEmails,
              accountId,
            );

            await this.writeStageRecord(executionId, accountId, isCustomer, {
              nodeId: node.id,
              stageId: stage.id,
              stageName: stage.name,
              stageType: stage.type,
              status: result.status,
              startedAt: undefined,
              completedAt: new Date().toISOString(),
              message: result.message,
              durationMs: result.durationMs,
            });

            if (result.status === 'FAILED') {
              await this.finalizeExecution(executionId, accountId, isCustomer, isPrivate, 'FAILED');
              return;
            }

            if (result.status === 'WAITING_APPROVAL') {
              await this.updateExecutionStatus(executionId, accountId, isCustomer, isPrivate, 'WAITING_APPROVAL');

              if (approverEmails && approverEmails.length > 0) {
                for (const approverEmail of approverEmails) {
                  try {
                    await this.inboxService.createNotification(accountId, {
                      accountId,
                      recipientEmail: approverEmail,
                      senderEmail: userEmail || 'system',
                      senderUserId: userId,
                      type: 'APPROVAL_REQUEST',
                      status: 'PENDING',
                      title: `Approval Required: ${stage.name}`,
                      message: `Pipeline "${pipelineName || pipeline.name}" requires your approval at stage "${stage.name}" (Node: ${node.name}).`,
                      context: {
                        executionId,
                        pipelineId,
                        buildJobId,
                        stageId: stage.id,
                        stageName: stage.name,
                        pipelineName: pipelineName || pipeline.name,
                        branch: branch || 'main',
                      },
                    });
                  } catch (notifErr: any) {
                    this.logger.error(
                      `[EXECUTION:${executionId}] Failed to create notification for ${approverEmail}: ${notifErr.message}`,
                    );
                  }
                }
                this.logger.log(
                  `[EXECUTION:${executionId}] Approval notifications sent to: ${approverEmails.join(', ')}`,
                );
              }

              return;
            }
          }

          console.log(`[EXECUTION:${executionId}][NODE:${node.id}] Node completed`);
        }
      }

      await this.finalizeExecution(executionId, accountId, isCustomer, isPrivate, 'SUCCESS');
    } catch (error) {
      console.log(`[EXECUTION:${executionId}] FATAL ERROR: ${error.message}`);
      await this.finalizeExecution(executionId, accountId, isCustomer, isPrivate, 'FAILED');
    }
  }

  // ---------------------------------------------------------------------------
  // DynamoDB Helpers
  // ---------------------------------------------------------------------------

  private async updateExecutionProgress(
    executionId: string,
    accountId: string,
    isCustomer: boolean,
    isPrivate: boolean,
    updates: Record<string, any>,
  ): Promise<void> {
    const key = isPrivate
      ? { PK: 'EXEC#LIST', SK: `EXEC#${executionId}` }
      : { PK: `ACCT#${accountId}`, SK: `EXEC#${executionId}` };

    const expressions: string[] = ['updatedAt = :now'];
    const values: Record<string, any> = { ':now': new Date().toISOString() };

    for (const [k, v] of Object.entries(updates)) {
      expressions.push(`${k} = :${k}`);
      values[`:${k}`] = v;
    }

    const params = {
      Key: key,
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeValues: values,
    };

    if (isCustomer) {
      await this.dynamoDbRouter.update(accountId, params);
    } else {
      await this.dynamoDb.update(params);
    }
  }

  private async updateExecutionStatus(
    executionId: string,
    accountId: string,
    isCustomer: boolean,
    isPrivate: boolean,
    status: ExecutionStatus,
  ): Promise<void> {
    const key = isPrivate
      ? { PK: 'EXEC#LIST', SK: `EXEC#${executionId}` }
      : { PK: `ACCT#${accountId}`, SK: `EXEC#${executionId}` };

    const params = {
      Key: key,
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':now': new Date().toISOString(),
      },
    };

    if (isCustomer) {
      await this.dynamoDbRouter.update(accountId, params);
    } else {
      await this.dynamoDb.update(params);
    }
  }

  private async finalizeExecution(
    executionId: string,
    accountId: string,
    isCustomer: boolean,
    isPrivate: boolean,
    status: ExecutionStatus,
  ): Promise<void> {
    const now = new Date().toISOString();
    console.log(`[EXECUTION:${executionId}] Pipeline ${status}`);

    const key = isPrivate
      ? { PK: 'EXEC#LIST', SK: `EXEC#${executionId}` }
      : { PK: `ACCT#${accountId}`, SK: `EXEC#${executionId}` };

    const params = {
      Key: key,
      UpdateExpression: 'SET #status = :status, endTime = :endTime, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':endTime': now,
        ':now': now,
      },
    };

    if (isCustomer) {
      await this.dynamoDbRouter.update(accountId, params);
    } else {
      await this.dynamoDb.update(params);
    }
  }

  private async writeStageRecord(
    executionId: string,
    accountId: string,
    isCustomer: boolean,
    stage: {
      nodeId: string;
      stageId: string;
      stageName: string;
      stageType: string;
      status: string;
      startedAt?: string;
      completedAt?: string;
      message?: string;
      durationMs?: number;
    },
  ): Promise<void> {
    const item: Record<string, any> = {
      PK: `EXEC#${executionId}`,
      SK: `STAGE#${stage.stageId}`,
      entityType: 'EXECUTION_STAGE',
      executionId,
      accountId,
      nodeId: stage.nodeId,
      stageId: stage.stageId,
      stageName: stage.stageName,
      stageType: stage.stageType,
      status: stage.status,
      ...(stage.startedAt && { startedAt: stage.startedAt }),
      ...(stage.completedAt && { completedAt: stage.completedAt }),
      ...(stage.message && { message: stage.message }),
      ...(stage.durationMs !== undefined && { durationMs: stage.durationMs }),
    };

    if (isCustomer) {
      await this.dynamoDbRouter.put(accountId, { Item: item });
    } else {
      await this.dynamoDb.put({ Item: item });
    }
  }
}
