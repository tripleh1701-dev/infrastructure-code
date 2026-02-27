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
import { BuildsService } from '../builds/builds.service';
import { YamlParserService, ParsedPipeline, ParsedStage, ToolConfig, ConnectorAuth } from './yaml-parser.service';
import { DependencyResolverService } from './dependency-resolver.service';
import { StageHandlersService, ExecutionContext } from './stage-handlers.service';
import { InboxService } from '../inbox/inbox.service';
import { ConnectorsService } from '../connectors/connectors.service';
import { EnvironmentsService, EnvironmentConnector } from '../environments/environments.service';
import { CredentialsService } from '../credentials/credentials.service';
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
    private readonly buildsService: BuildsService,
    private readonly yamlParser: YamlParserService,
    private readonly dependencyResolver: DependencyResolverService,
    private readonly stageHandlers: StageHandlersService,
    @Inject(forwardRef(() => InboxService))
    private readonly inboxService: InboxService,
    private readonly connectorsService: ConnectorsService,
    private readonly environmentsService: EnvironmentsService,
    private readonly credentialsService: CredentialsService,
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
    // Try finding pipeline by ID first; if that fails, resolve by name
    let pipeline: any;
    try {
      pipeline = await this.pipelinesService.findOne(accountId, pipelineId);
    } catch {
      // pipelineId might be a name — resolve from the full list
      this.logger.warn(`Pipeline not found by ID "${pipelineId}", attempting name lookup...`);
      const allPipelines = await this.pipelinesService.findAll(accountId);
      pipeline = allPipelines.find(
        (p) => p.name?.toLowerCase() === pipelineId.toLowerCase(),
      );
    }
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    // Use the resolved pipeline ID from here on
    const resolvedPipelineId = pipeline.id;

    // Fetch build job to get selectedArtifacts and pipelineStagesState
    let buildJob: any = null;
    if (buildJobId) {
      try {
        buildJob = await this.buildsService.findOneJob(buildJobId, accountId);
      } catch (err) {
        this.logger.warn(`Build job ${buildJobId} not found: ${err.message}`);
      }
    }

    // ── Debug: log raw pipeline data before parsing ──
    this.logger.log(`[runPipeline] Pipeline ${resolvedPipelineId} raw data — ` +
      `hasYaml=${!!pipeline.yamlContent}, ` +
      `nodesCount=${(pipeline.nodes || []).length}, ` +
      `edgesCount=${(pipeline.edges || []).length}`);
    if (pipeline.yamlContent) {
      this.logger.debug(`[runPipeline] yamlContent (first 500 chars): ${pipeline.yamlContent.substring(0, 500)}`);
    } else {
      this.logger.debug(`[runPipeline] nodes: ${JSON.stringify(
        (pipeline.nodes || []).map((n: any) => ({ id: n.id, type: n.type, parentId: n.parentId || n.parentNode, nodeType: n.data?.nodeType })),
      )}`);
      this.logger.debug(`[runPipeline] edges: ${JSON.stringify(pipeline.edges || [])}`);
    }
    if (buildJob) {
      this.logger.debug(`[runPipeline] buildJob.pipelineStagesState keys: ${JSON.stringify(Object.keys(buildJob.pipelineStagesState || {}))}`);
    }

    let parsedPipeline: ParsedPipeline;
    const stagesState = buildJob?.pipelineStagesState || {};
    const canvasNodes = pipeline.nodes || [];
    const canvasEdges = pipeline.edges || [];

    if (pipeline.yamlContent) {
      parsedPipeline = this.yamlParser.parse(pipeline.yamlContent);

      // Fallback: if YAML produced zero nodes but canvas data exists, use canvas
      if (parsedPipeline.nodes.length === 0 && canvasNodes.length > 0) {
        this.logger.warn(`[runPipeline] YAML produced 0 nodes — falling back to canvas data (${canvasNodes.length} nodes)`);
        parsedPipeline = this.yamlParser.parseFromCanvasData(canvasNodes, canvasEdges, stagesState);
      }
    } else {
      parsedPipeline = this.yamlParser.parseFromCanvasData(canvasNodes, canvasEdges, stagesState);
    }

    this.logger.log(`[runPipeline] Parsed pipeline — nodesCount=${parsedPipeline.nodes.length}, ` +
      `stages=${parsedPipeline.nodes.map(n => `${n.id}(${n.stages.length})`).join(', ')}`);

    // Resolve credentials, connector URLs, and environment configs from DynamoDB
    await this.resolveStageCredentials(parsedPipeline, accountId, buildJob);

    // Enrich deploy stages with selectedArtifacts from build job
    if (buildJob?.selectedArtifacts?.length > 0) {
      this.enrichDeployStagesWithArtifacts(parsedPipeline, buildJob.selectedArtifacts);
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
      GSI2PK: `PIPELINE#${resolvedPipelineId}`,
      GSI2SK: `EXEC#${executionId}`,
      entityType: 'EXECUTION',
      id: executionId,
      executionId,
      pipelineId: resolvedPipelineId,
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

    this.logger.log(`[EXECUTION:${executionId}] Pipeline execution started for ${resolvedPipelineId} (input: ${pipelineId})`);

    // Invoke the pipeline-executor Lambda asynchronously
    try {
      const payload = {
        executionId,
        accountId,
        pipelineId: resolvedPipelineId,
        buildJobId: buildJobId || null,
        userId,
        userEmail: userEmail || null,
        branch: branch || 'main',
        approverEmails: approverEmails || [],
        pipelineName: pipeline?.name || parsedPipeline.name,
        buildVersion: parsedPipeline.buildVersion || buildJob?.buildVersion || '1.0.0',
        parsedPipeline: {
          name: parsedPipeline.name,
          buildVersion: parsedPipeline.buildVersion,
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
          InvocationType: 'Event',
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

      await this.finalizeExecution(executionId, accountId, isCustomer, isPrivate, 'FAILED');

      throw new BadRequestException(
        `Failed to start pipeline execution: ${lambdaErr.message}`,
      );
    }

    return { executionId };
  }

  // ---------------------------------------------------------------------------
  // Enrich deploy stages with selectedArtifacts
  // ---------------------------------------------------------------------------

  private enrichDeployStagesWithArtifacts(
    pipeline: ParsedPipeline,
    selectedArtifacts: any[],
  ): void {
    // Map selectedArtifacts to ArtifactDescriptor format
    const artifacts = selectedArtifacts.map((a) => ({
      name: a.artifactId || a.artifactName || a.name || '',
      type: this.mapArtifactType(a.artifactType || a.type || ''),
    }));

    if (artifacts.length === 0) return;

    for (const node of pipeline.nodes) {
      for (const stage of node.stages) {
        if (stage.type.toLowerCase() === 'deploy' && stage.toolConfig) {
          // Add artifacts to the deploy tool config
          stage.toolConfig.artifacts = [
            ...(stage.toolConfig.artifacts || []),
            ...artifacts,
          ];
          this.logger.log(
            `Enriched deploy stage ${stage.id} with ${artifacts.length} selectedArtifacts`,
          );
        }
      }
    }
  }

  private mapArtifactType(type: string): string {
    // Map display types back to API types
    const typeMap: Record<string, string> = {
      'Integration Flow': 'IntegrationFlow',
      'Value Mapping': 'ValueMapping',
      'Message Mapping': 'MessageMapping',
      'Script Collection': 'ScriptCollection',
      'Groovy Script': 'GroovyScript',
      'IntegrationDesigntimeArtifacts': 'IntegrationFlow',
      'ValueMappingDesigntimeArtifacts': 'ValueMapping',
      'MessageMappingDesigntimeArtifacts': 'MessageMapping',
      'ScriptCollectionDesigntimeArtifacts': 'ScriptCollection',
    };
    return typeMap[type] || type;
  }

  // ---------------------------------------------------------------------------
  // Resolve Credentials & Environments from DynamoDB
  // ---------------------------------------------------------------------------

  /**
   * For each stage in the parsed pipeline, resolve:
   * 1. Connector ID → Credential ID → actual credential fields (URL, auth)
   * 2. Environment name → Environment record → API URL, auth from connectors array
   * 3. Repository URLs and branches from stagesState
   *
   * This populates `stage.toolConfig` with real auth data so the executor
   * doesn't need embedded YAML credentials.
   */
  private async resolveStageCredentials(
    pipeline: ParsedPipeline,
    accountId: string,
    buildJob?: any,
  ): Promise<void> {
    // Pre-fetch all environments for this account (used by deploy stages)
    let environments: any[] = [];
    try {
      const enterpriseId = buildJob?.enterpriseId;
      environments = await this.environmentsService.findAll(accountId, enterpriseId);
    } catch (err) {
      this.logger.warn(`Could not fetch environments: ${err.message}`);
    }

    for (const node of pipeline.nodes) {
      for (const stage of node.stages) {
        const config = stage.config || {};
        const connectorId = config._connectorId;
        const envName = config._environmentName;
        const branch = config._branch;
        const repoUrl = config._repoUrl;

        try {
          // ── Plan / Code stages: resolve connector → credential ──
          if (connectorId && (stage.type === 'plan' || stage.type === 'code')) {
            await this.resolveConnectorCredential(stage, connectorId, accountId, repoUrl, branch);
          }

          // ── Deploy stages: resolve environment → API URL + auth ──
          if (stage.type === 'deploy' && envName) {
            await this.resolveEnvironmentCredential(stage, envName, environments, accountId);
          }

          // ── Deploy stages with connector (fallback) ──
          if (stage.type === 'deploy' && connectorId && !stage.toolConfig?.environment?.authentication) {
            await this.resolveConnectorCredential(stage, connectorId, accountId, repoUrl, branch);
          }
        } catch (err) {
          this.logger.warn(
            `[STAGE:${stage.id}] Credential resolution failed: ${err.message}`,
          );
        }
      }
    }
  }

  /**
   * Resolve a connector ID to its credential, populating the stage's toolConfig.
   */
  private async resolveConnectorCredential(
    stage: ParsedStage,
    connectorId: string,
    accountId: string,
    repoUrl?: string,
    branch?: string,
  ): Promise<void> {
    const connector = await this.connectorsService.findOne(connectorId, accountId);

    if (!connector) {
      this.logger.warn(`Connector ${connectorId} not found`);
      return;
    }

    this.logger.log(
      `[STAGE:${stage.id}] Resolved connector: ${connector.name} (${connector.connectorTool}), credentialId: ${connector.credentialId}`,
    );

    let auth: ConnectorAuth | undefined;

    if (connector.credentialId) {
      try {
        const credential = await this.credentialsService.findOne(connector.credentialId, accountId);
        const c = credential.credentials || {};

        auth = {
          type: credential.authType,
          username: c.username || c.Username || c.email || c['Email'],
          apiKey: c.apiToken || c.api_token || c['API Key'] || c.apiKey || c['Api Key'],
          token: c.token || c['Personal Access Token'] || c.pat || c['Token'],
          clientId: c.clientId || c.client_id || c['Client ID'],
          clientSecret: c.clientSecret || c.client_secret || c['Client Secret'],
          tokenUrl: c.tokenUrl || c.token_url || c['Token URL'],
        };

        // Set credentialId for the stage handler's own resolution (as backup)
        stage.credentialId = connector.credentialId;

        this.logger.log(
          `[STAGE:${stage.id}] Resolved credential: ${credential.name} (${credential.authType})`,
        );
      } catch (err) {
        this.logger.warn(`Credential ${connector.credentialId} not found: ${err.message}`);
      }
    }

    // Build toolConfig based on tool type
    const toolType = stage.toolId || connector.connectorTool?.toUpperCase() || '';
    const upperTool = toolType.toUpperCase();

    if (!stage.toolConfig) {
      stage.toolConfig = { type: toolType };
    }

    if (upperTool === 'JIRA' || upperTool.includes('JIRA')) {
      stage.toolConfig.type = 'JIRA';
      stage.toolConfig.connector = {
        url: connector.url || '',
        authentication: auth,
      };
      // Inject JIRA key from pipeline stages state
      const jiraKey = stage.config?._jiraKey;
      if (jiraKey) {
        if (!stage.toolConfig.inputs) stage.toolConfig.inputs = {};
        stage.toolConfig.inputs.jiraKey = jiraKey;
      }
    } else if (upperTool === 'GITHUB' || upperTool.includes('GITHUB')) {
      stage.toolConfig.type = 'GITHUB';
      stage.toolConfig.connector = {
        repoUrl: repoUrl || connector.url || '',
        branch: branch || 'main',
        authentication: auth,
      };
    } else if (upperTool === 'GITLAB' || upperTool.includes('GITLAB')) {
      stage.toolConfig.type = 'GITLAB';
      stage.toolConfig.connector = {
        repoUrl: repoUrl || connector.url || '',
        branch: branch || 'main',
        authentication: auth,
      };
    } else {
      // Generic connector
      stage.toolConfig.connector = {
        url: connector.url || '',
        authentication: auth,
      };
    }
  }

  /**
   * Resolve an environment name to its Cloud Foundry / SAP CPI credentials.
   * Looks up the environment record and extracts the deploy connector's API URL + auth.
   */
  private async resolveEnvironmentCredential(
    stage: ParsedStage,
    envName: string,
    environments: any[],
    accountId: string,
  ): Promise<void> {
    // Find environment by name (case-insensitive)
    const env = environments.find(
      (e) => e.name?.toLowerCase() === envName.toLowerCase(),
    );

    if (!env) {
      this.logger.warn(`Environment "${envName}" not found for stage ${stage.id}`);
      return;
    }

    this.logger.log(`[STAGE:${stage.id}] Resolved environment: ${env.name} (${env.id})`);

    // Find the deploy connector in the environment's connectors array
    const deployConnector: EnvironmentConnector | undefined = (env.connectors || []).find(
      (c: EnvironmentConnector) =>
        c.category === 'deploy' ||
        c.connector === 'Cloud Foundry' ||
        c.connector === 'SAP CPI',
    );

    if (!deployConnector) {
      this.logger.warn(`No deploy connector found in environment "${envName}"`);
      return;
    }

    // Resolve API credential if referenced by name
    let auth: ConnectorAuth | undefined;

    if (deployConnector.apiCredentialName) {
      auth = await this.resolveNamedCredential(deployConnector.apiCredentialName, accountId);
    }

    // Fall back to inline auth on the environment connector
    if (!auth) {
      if (deployConnector.oauth2ClientId && deployConnector.oauth2ClientSecret) {
        auth = {
          type: 'OAuth2',
          clientId: deployConnector.oauth2ClientId,
          clientSecret: deployConnector.oauth2ClientSecret,
          tokenUrl: deployConnector.oauth2TokenUrl || '',
        };
      } else if (deployConnector.username && deployConnector.apiKey) {
        auth = {
          type: 'Basic',
          username: deployConnector.username,
          apiKey: deployConnector.apiKey,
        };
      }
    }

    // Build the deploy toolConfig
    if (!stage.toolConfig) {
      stage.toolConfig = { type: 'SAP_CPI' };
    }

    stage.toolConfig.type = 'SAP_CPI';
    stage.toolConfig.environment = {
      apiUrl: deployConnector.apiUrl || deployConnector.hostUrl || deployConnector.url || '',
      authentication: auth,
    };

    this.logger.log(
      `[STAGE:${stage.id}] Deploy config: apiUrl=${stage.toolConfig.environment.apiUrl}, authType=${auth?.type || 'none'}`,
    );
  }

  /**
   * Resolve a credential by name (used by environment connectors that reference credentials by name).
   */
  private async resolveNamedCredential(
    credentialName: string,
    accountId: string,
  ): Promise<ConnectorAuth | undefined> {
    try {
      // Fetch all credentials and find by name
      const allCredentials = await this.credentialsService.findAll(accountId);
      const credential = allCredentials.find(
        (c) => c.name?.toLowerCase() === credentialName.toLowerCase(),
      );

      if (!credential) {
        this.logger.warn(`Named credential "${credentialName}" not found`);
        return undefined;
      }

      const c = credential.credentials || {};
      return {
        type: credential.authType,
        username: c.username || c.Username || c.email,
        apiKey: c.apiToken || c.api_token || c['API Key'] || c.apiKey,
        token: c.token || c['Personal Access Token'] || c.pat,
        clientId: c.clientId || c.client_id || c['Client ID'],
        clientSecret: c.clientSecret || c.client_secret || c['Client Secret'],
        tokenUrl: c.tokenUrl || c.token_url || c['Token URL'],
      };
    } catch (err) {
      this.logger.warn(`Failed to resolve named credential "${credentialName}": ${err.message}`);
      return undefined;
    }
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

    // Query stage records
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

    // Query detailed log entries
    const logsResult = isCustomer
      ? await this.dynamoDbRouter.query(accountId, {
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `EXEC#${executionId}`,
            ':sk': 'LOG#',
          },
        })
      : await this.dynamoDb.query({
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `EXEC#${executionId}`,
            ':sk': 'LOG#',
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

    // Combine stage summary logs with detailed log entries
    const stageLogs = stageRecords.map(
      (s) =>
        `[NODE:${s.nodeId}][STAGE:${s.stageId}] ${s.status}${s.message ? ` — ${s.message}` : ''} (${s.startedAt || ''})`,
    );

    // Detailed log lines from LOG# items, sorted by timestamp
    const detailedLogs = (logsResult.Items || [])
      .sort((a, b) => (a.SK || '').localeCompare(b.SK || ''))
      .flatMap((item) => item.logLines || []);

    // Merge: detailed logs first (real-time), then stage summaries
    const allLogs = detailedLogs.length > 0 ? detailedLogs : stageLogs;

    return {
      status: item.status as ExecutionStatus,
      stageStates: item.stageStates || {},
      currentNode: item.currentNode,
      currentStage: item.currentStage,
      startTime: item.startTime,
      endTime: item.endTime,
      logs: allLogs,
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
  // EXECUTION ENGINE (async, runs in pipeline-executor Lambda)
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
    const pName = pipelineName || pipeline.name;
    const buildVersion = pipeline.buildVersion || '1.0.0';

    console.log(`\n🚀 [EXECUTION:${executionId}] Executing pipeline: ${pName} | Version: ${buildVersion}`);
    console.log(`[EXECUTION:${executionId}] Nodes: ${pipeline.nodes.map((n) => n.id).join(', ')}\n`);

    // Create cross-stage execution context
    const context: ExecutionContext = {
      pipelineName: pName,
      buildVersion,
      logs: [],
    };

    // Write initial log entry
    await this.writeLogEntry(executionId, accountId, isCustomer, [
      `🚀 Executing pipeline: ${pName} | Version: ${buildVersion}`,
      `Nodes: ${pipeline.nodes.map((n) => n.name || n.id).join(' → ')}`,
    ]);

    try {
      const nodeTiers = this.dependencyResolver.resolveNodeOrder(pipeline.nodes);

      for (const tier of nodeTiers) {
        for (const node of tier) {
          const nodeLabel = node.name || node.id;
          console.log(`▶ [EXECUTION:${executionId}][NODE:${node.id}] Starting node: ${nodeLabel}`);

          // Set current node in context
          context.currentNodeName = nodeLabel;

          await this.updateExecutionProgress(executionId, accountId, isCustomer, isPrivate, {
            currentNode: node.id,
          });

          await this.writeLogEntry(executionId, accountId, isCustomer, [
            `▶ Node: ${nodeLabel}`,
          ]);

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

            await this.writeLogEntry(executionId, accountId, isCustomer, [
              `  ➡ Stage: ${stage.name} (${stage.type})`,
            ]);

            // Execute stage with cross-stage context
            const result = await this.stageHandlers.executeStage(
              executionId,
              node.id,
              stage,
              approverEmails,
              accountId,
              context,
            );

            // Write detailed log lines from stage execution
            if (result.logLines && result.logLines.length > 0) {
              await this.writeLogEntry(executionId, accountId, isCustomer, result.logLines);
            }

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
              await this.writeLogEntry(executionId, accountId, isCustomer, [
                `❌ Stage FAILED: ${stage.name} — ${result.message}`,
              ]);
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
                      message: `Pipeline "${pName}" requires your approval at stage "${stage.name}" (Node: ${nodeLabel}).`,
                      context: {
                        executionId,
                        pipelineId,
                        buildJobId,
                        stageId: stage.id,
                        stageName: stage.name,
                        pipelineName: pName,
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

          console.log(`✅ [EXECUTION:${executionId}][NODE:${node.id}] Node completed: ${nodeLabel}`);
          await this.writeLogEntry(executionId, accountId, isCustomer, [
            `✅ Node completed: ${nodeLabel}`,
          ]);
        }
      }

      await this.writeLogEntry(executionId, accountId, isCustomer, [
        `🎉 Pipeline execution completed successfully`,
      ]);
      await this.finalizeExecution(executionId, accountId, isCustomer, isPrivate, 'SUCCESS');
    } catch (error) {
      console.log(`[EXECUTION:${executionId}] FATAL ERROR: ${error.message}`);
      await this.writeLogEntry(executionId, accountId, isCustomer, [
        `💥 FATAL ERROR: ${error.message}`,
      ]);
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

  /**
   * Write detailed log entries to DynamoDB for real-time polling.
   * Each call creates a LOG# item with a timestamp-based sort key
   * so getExecutionLogs can stream them in order.
   */
  private logSequence = 0;

  private async writeLogEntry(
    executionId: string,
    accountId: string,
    isCustomer: boolean,
    logLines: string[],
  ): Promise<void> {
    if (!logLines || logLines.length === 0) return;

    this.logSequence++;
    const timestamp = new Date().toISOString();
    const seq = String(this.logSequence).padStart(6, '0');

    const item: Record<string, any> = {
      PK: `EXEC#${executionId}`,
      SK: `LOG#${timestamp}#${seq}`,
      entityType: 'EXECUTION_LOG',
      executionId,
      accountId,
      logLines,
      timestamp,
    };

    try {
      if (isCustomer) {
        await this.dynamoDbRouter.put(accountId, { Item: item });
      } else {
        await this.dynamoDb.put({ Item: item });
      }
    } catch (err: any) {
      // Don't fail execution if log writing fails
      this.logger.warn(`Failed to write log entry: ${err.message}`);
    }
  }
}
