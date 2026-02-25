import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBRouterService } from '../common/dynamodb/dynamodb-router.service';
import { PipelinesService } from '../pipelines/pipelines.service';
import { BuildsService } from '../builds/builds.service';
import { CredentialsService, Credential } from '../credentials/credentials.service';
import { GenerateBuildYamlDto } from './dto/generate-build-yaml.dto';
import { CognitoUser } from '../auth/interfaces/cognito-user.interface';
import { KMSClient, EncryptCommand } from '@aws-sdk/client-kms';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { resolveAwsCredentials } from '../common/utils/aws-credentials';

/**
 * Pipeline Configs Service
 *
 * Takes a pipeline's YAML (or canvas data) + build job stages state,
 * resolves all credentials/connectors/environments, constructs an
 * enriched "Build YAML", encrypts sensitive fields via KMS,
 * and stores it in the CUSTOMER's DynamoDB table — never control-plane.
 *
 * After storage, invokes the pipeline-executor Lambda asynchronously.
 */
@Injectable()
export class PipelineConfigsService {
  private readonly logger = new Logger(PipelineConfigsService.name);
  private kmsClient: KMSClient;
  private lambdaClient: LambdaClient;
  private defaultKmsKeyId: string | undefined;
  private executorFunctionName: string;

  constructor(
    private readonly dynamoDbRouter: DynamoDBRouterService,
    private readonly configService: ConfigService,
    private readonly pipelinesService: PipelinesService,
    private readonly buildsService: BuildsService,
    private readonly credentialsService: CredentialsService,
  ) {
    const region = this.configService.get('AWS_REGION', 'us-east-1');
    const credentials = resolveAwsCredentials(
      this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
    );

    this.kmsClient = new KMSClient({ region, ...(credentials && { credentials }) });
    this.lambdaClient = new LambdaClient({ region, ...(credentials && { credentials }) });
    this.defaultKmsKeyId = this.configService.get<string>('PIPELINE_KMS_KEY_ID');
    this.executorFunctionName = this.configService.get<string>(
      'PIPELINE_EXECUTOR_FUNCTION',
      'license-portal-staging-pipeline-executor',
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async generateBuildYaml(dto: GenerateBuildYamlDto, user: CognitoUser) {
    const { accountId, enterpriseId, buildJobId, buildVersion, pipelineStagesState } = dto;

    if (!accountId) throw new BadRequestException('accountId is required');

    this.logger.log(`Generating build YAML: account=${accountId}, buildJob=${buildJobId}, version=${buildVersion}`);

    // 1. Fetch build job to get pipeline reference
    const buildJob = await this.buildsService.findOneJob(buildJobId, accountId);
    if (!buildJob.pipeline) {
      throw new BadRequestException('Build job has no pipeline assigned');
    }

    // 2. Fetch pipeline to get YAML / nodes / edges
    let pipeline: any;
    try {
      pipeline = await this.pipelinesService.findOne(accountId, buildJob.pipeline);
    } catch {
      // Pipeline may be referenced by name — try finding from list
      const allPipelines = await this.pipelinesService.findAll(accountId, enterpriseId);
      pipeline = allPipelines.find(
        (p) => p.name.toLowerCase() === buildJob.pipeline!.toLowerCase(),
      );
      if (!pipeline) {
        throw new NotFoundException(`Pipeline "${buildJob.pipeline}" not found`);
      }
    }

    // 3. Resolve credentials for each stage from pipelineStagesState
    const resolvedCredentials: Record<string, ResolvedCredential> = {};
    const selectedConnectors = pipelineStagesState.selectedConnectors || {};

    for (const [stageKey, credentialId] of Object.entries(selectedConnectors)) {
      if (credentialId) {
        try {
          const credential = await this.credentialsService.findOne(credentialId, accountId);
          resolvedCredentials[stageKey] = this.mapCredential(credential);
        } catch (err) {
          this.logger.warn(`Credential ${credentialId} for stage ${stageKey} not found: ${err.message}`);
        }
      }
    }

    // 4. Construct build YAML
    const buildYaml = this.constructBuildYaml(
      pipeline,
      buildJob,
      buildVersion,
      pipelineStagesState,
      resolvedCredentials,
    );

    // 5. Encrypt sensitive data for storage
    const kmsKeyId = await this.resolveKmsKey(accountId);
    const encryptedCredentials: Record<string, string> = {};
    const sensitiveFields: string[] = [];

    for (const [stageKey, cred] of Object.entries(resolvedCredentials)) {
      const sensitiveJson = JSON.stringify({
        apiKey: cred.apiKey,
        token: cred.token,
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
        password: cred.password,
      });
      encryptedCredentials[stageKey] = await this.encryptField(sensitiveJson, kmsKeyId);
      sensitiveFields.push(stageKey);
    }

    const now = new Date().toISOString();
    const status = dto.status || 'ACTIVE';
    const pipelineName = pipeline.name || buildJob.connectorName;

    // 6. Write pipeline config to CUSTOMER DynamoDB (via router — resolves to customer table)
    const pipelineItem = {
      PK: `CUSTOMER#${accountId}`,
      SK: `PIPELINE#${pipelineName}#VERSION#${buildVersion}`,
      GSI1PK: 'ENTITY#BUILD_YAML',
      GSI1SK: `BUILD_YAML#${pipelineName}#VERSION#${buildVersion}`,
      GSI2PK: `ENT#${enterpriseId}`,
      GSI2SK: `BUILD_YAML#${pipelineName}`,
      entityType: 'BUILD_YAML',
      customerId: accountId,
      enterpriseId,
      buildJobId,
      pipelineId: pipeline.id,
      pipelineName,
      buildVersion,
      yamlContent: buildYaml,
      encryptedCredentials,
      kmsKeyId,
      stagesState: {
        selectedEnvironments: pipelineStagesState.selectedEnvironments || {},
        connectorRepositoryUrls: pipelineStagesState.connectorRepositoryUrls || {},
        selectedBranches: pipelineStagesState.selectedBranches || {},
        selectedApprovers: pipelineStagesState.selectedApprovers || {},
        // Don't store raw credential IDs — they're resolved + encrypted
      },
      status,
      createdAt: now,
      createdBy: user.sub || user.email,
      updatedAt: now,
    };

    await this.dynamoDbRouter.put(accountId, { Item: pipelineItem });
    this.logger.log(`Build YAML written to customer DynamoDB: PK=${pipelineItem.PK}, SK=${pipelineItem.SK}`);

    // 7. Write build record to CUSTOMER DynamoDB
    const buildItem = {
      PK: `CUSTOMER#${accountId}`,
      SK: `BUILD#${pipelineName}#VERSION#${buildVersion}`,
      GSI1PK: 'ENTITY#BUILD_RECORD',
      GSI1SK: `BUILD#${pipelineName}#VERSION#${buildVersion}`,
      GSI2PK: `ENT#${enterpriseId}`,
      GSI2SK: `BUILD#${pipelineName}`,
      entityType: 'BUILD_RECORD',
      customerId: accountId,
      buildJobId,
      pipelineName,
      buildVersion,
      executionStatus: 'PENDING',
      logsPointer: null,
      triggeredAt: now,
      createdAt: now,
    };

    await this.dynamoDbRouter.put(accountId, { Item: buildItem });
    this.logger.log(`Build record written to customer DynamoDB: PK=${buildItem.PK}, SK=${buildItem.SK}`);

    // 8. Invoke pipeline executor Lambda
    let lambdaResult: any = null;
    try {
      lambdaResult = await this.invokePipelineExecutor(accountId, pipelineName, buildVersion);
      this.logger.log(`Lambda invocation result: ${JSON.stringify(lambdaResult)}`);
    } catch (err: any) {
      this.logger.error(`Lambda invocation failed: ${err.message}`, err.stack);
    }

    return {
      customerId: accountId,
      pipelineName,
      buildVersion,
      pipelineId: pipeline.id,
      buildJobId,
      status,
      yamlPreview: buildYaml.substring(0, 500) + (buildYaml.length > 500 ? '...' : ''),
      createdAt: now,
      createdBy: pipelineItem.createdBy,
      lambdaInvoked: !!lambdaResult,
      stageCount: Object.keys(selectedConnectors).length,
    };
  }

  /**
   * List build YAMLs for a customer account
   */
  async listByAccount(accountId: string, enterpriseId?: string) {
    const result = await this.dynamoDbRouter.query(accountId, {
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `CUSTOMER#${accountId}`,
        ':sk': 'PIPELINE#',
      },
    });

    let items = (result.Items || []).filter((item) => item.entityType === 'BUILD_YAML');
    if (enterpriseId) {
      items = items.filter((item) => item.GSI2PK === `ENT#${enterpriseId}`);
    }

    return items.map((item) => ({
      customerId: item.customerId,
      pipelineName: item.pipelineName,
      buildVersion: item.buildVersion,
      buildJobId: item.buildJobId,
      pipelineId: item.pipelineId,
      status: item.status,
      createdAt: item.createdAt,
      createdBy: item.createdBy,
      updatedAt: item.updatedAt,
    }));
  }

  /**
   * Get a specific build YAML (including full content)
   */
  async getOne(accountId: string, pipelineName: string, buildVersion: string) {
    const result = await this.dynamoDbRouter.get(accountId, {
      Key: {
        PK: `CUSTOMER#${accountId}`,
        SK: `PIPELINE#${pipelineName}#VERSION#${buildVersion}`,
      },
    });

    if (!result.Item) {
      throw new NotFoundException(`Build YAML not found: ${pipelineName} v${buildVersion}`);
    }

    const item = result.Item;
    return {
      customerId: item.customerId,
      pipelineName: item.pipelineName,
      buildVersion: item.buildVersion,
      yamlContent: item.yamlContent,
      stagesState: item.stagesState,
      status: item.status,
      createdAt: item.createdAt,
      createdBy: item.createdBy,
    };
  }

  // ---------------------------------------------------------------------------
  // Build YAML Construction
  // ---------------------------------------------------------------------------

  private constructBuildYaml(
    pipeline: any,
    buildJob: any,
    buildVersion: string,
    stagesState: any,
    resolvedCredentials: Record<string, ResolvedCredential>,
  ): string {
    const pipelineName = pipeline.name || buildJob.connectorName || buildJob.connector_name;
    const nodes = pipeline.nodes || [];
    const selectedEnvs = stagesState.selectedEnvironments || {};
    const repoUrls = stagesState.connectorRepositoryUrls || {};
    const branches = stagesState.selectedBranches || {};
    const approvers = stagesState.selectedApprovers || {};

    let yaml = `pipeline:\n`;
    yaml += `  name: "${this.esc(pipelineName)}"\n`;
    yaml += `  buildVersion: "${this.esc(buildVersion)}"\n`;
    yaml += `  execution:\n`;
    yaml += `    entryPoint: execute_pipeline\n`;
    yaml += `    logging:\n`;
    yaml += `      successMessage: "🎉 Pipeline execution completed successfully"\n`;
    yaml += `      errorBehavior: "exit_on_failure"\n`;
    yaml += `      failureExitCode: 1\n`;
    yaml += `  nodes:\n`;

    // Parse nodes from pipeline canvas data
    const envNodes = this.extractEnvironmentNodes(nodes);

    for (const envNode of envNodes) {
      const envName = envNode.label || envNode.id;
      yaml += `    - name: "${this.esc(envName)}"\n`;

      if (selectedEnvs[envNode.id]) {
        yaml += `      environment: "${this.esc(selectedEnvs[envNode.id])}"\n`;
      }

      yaml += `      stages:\n`;

      for (const stage of envNode.stages) {
        const stageKey = `${envNode.id}::${stage.id}`;
        const cred = resolvedCredentials[stageKey];
        const repoUrl = repoUrls[stageKey] || '';
        const branch = branches[stageKey] || 'main';
        const stageApprovers = approvers[stageKey] || [];

        yaml += `        - name: "${this.esc(stage.label || stage.type)}"\n`;
        yaml += `          type: "${this.esc(stage.type)}"\n`;

        if (stage.tool) {
          yaml += `          tool:\n`;
          yaml += `            type: "${this.esc(stage.tool)}"\n`;

          if (cred) {
            yaml += this.buildToolYaml(stage.tool, cred, repoUrl, branch);
          }
        }

        if (stageApprovers.length > 0) {
          yaml += `          approvers:\n`;
          for (const approver of stageApprovers) {
            yaml += `            - "${this.esc(approver)}"\n`;
          }
        }
      }
    }

    return yaml;
  }

  private buildToolYaml(
    toolType: string,
    cred: ResolvedCredential,
    repoUrl: string,
    branch: string,
  ): string {
    const upper = toolType.toUpperCase();
    let yaml = '';

    if (upper === 'JIRA' || upper.includes('JIRA')) {
      yaml += `            connector:\n`;
      yaml += `              url: "${this.esc(cred.url || '')}"\n`;
      yaml += `              authentication:\n`;
      yaml += `                type: "${this.esc(cred.authType)}"\n`;
      if (cred.username) yaml += `                username: "${this.esc(cred.username)}"\n`;
      yaml += `                apiKey: "ENCRYPTED"\n`;
    } else if (upper === 'GITHUB' || upper.includes('GITHUB')) {
      yaml += `            connector:\n`;
      yaml += `              repoUrl: "${this.esc(repoUrl || cred.url || '')}"\n`;
      yaml += `              branch: "${this.esc(branch)}"\n`;
      yaml += `              authentication:\n`;
      yaml += `                type: PersonalAccessToken\n`;
      yaml += `                token: "ENCRYPTED"\n`;
    } else if (upper.includes('SAP') || upper.includes('CPI') || upper.includes('CLOUD_FOUNDRY')) {
      yaml += `            environment:\n`;
      yaml += `              apiUrl: "${this.esc(cred.url || '')}"\n`;
      yaml += `              authentication:\n`;
      yaml += `                clientId: "ENCRYPTED"\n`;
      yaml += `                clientSecret: "ENCRYPTED"\n`;
      if (cred.tokenUrl) yaml += `                tokenUrl: "${this.esc(cred.tokenUrl)}"\n`;
      if (cred.artifacts && cred.artifacts.length > 0) {
        yaml += `            artifacts:\n`;
        for (const art of cred.artifacts) {
          yaml += `              - name: "${this.esc(art.name)}"\n`;
          yaml += `                type: "${this.esc(art.type)}"\n`;
        }
      }
    } else {
      // Generic tool
      yaml += `            connector:\n`;
      if (cred.url) yaml += `              url: "${this.esc(cred.url)}"\n`;
      yaml += `              authentication:\n`;
      yaml += `                type: "${this.esc(cred.authType)}"\n`;
    }

    return yaml;
  }

  private extractEnvironmentNodes(nodes: any[]): EnvironmentNode[] {
    // Parse React Flow nodes into environment groups with their stages
    const envGroups: Map<string, EnvironmentNode> = new Map();

    // First pass: identify environment group nodes
    for (const node of nodes) {
      if (node.type === 'environmentGroup' || node.type === 'group') {
        envGroups.set(node.id, {
          id: node.id,
          label: node.data?.label || node.data?.name || node.id,
          stages: [],
        });
      }
    }

    // If no explicit groups, create a default
    if (envGroups.size === 0) {
      envGroups.set('default', { id: 'default', label: 'Development', stages: [] });
    }

    // Second pass: assign stage nodes to their parent groups
    for (const node of nodes) {
      if (node.type !== 'environmentGroup' && node.type !== 'group') {
        const parentId = node.parentId || node.parentNode || 'default';
        const group = envGroups.get(parentId) || envGroups.values().next().value;
        if (group) {
          group.stages.push({
            id: node.id,
            type: node.data?.stageType || node.data?.type || node.type || 'generic',
            label: node.data?.label || node.data?.name || node.id,
            tool: node.data?.tool || node.data?.connector_tool || '',
          });
        }
      }
    }

    return Array.from(envGroups.values());
  }

  private mapCredential(cred: Credential): ResolvedCredential {
    const c = cred.credentials || {};
    return {
      id: cred.id,
      name: cred.name,
      authType: cred.authType,
      connector: cred.connector,
      url: c.url || c.URL || c.baseUrl || '',
      username: c.username || c.Username || c.email || '',
      apiKey: c.apiToken || c.api_token || c['API Key'] || c.apiKey || '',
      token: c.token || c['Personal Access Token'] || c.pat || '',
      clientId: c.clientId || c.client_id || c['Client ID'] || '',
      clientSecret: c.clientSecret || c.client_secret || c['Client Secret'] || '',
      tokenUrl: c.tokenUrl || c.token_url || c['Token URL'] || '',
      password: c.password || c.Password || '',
      artifacts: [],
    };
  }

  private esc(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  // ---------------------------------------------------------------------------
  // KMS Encryption
  // ---------------------------------------------------------------------------

  private async resolveKmsKey(accountId: string): Promise<string> {
    if (!this.defaultKmsKeyId) {
      this.logger.warn('PIPELINE_KMS_KEY_ID not configured — secrets will NOT be encrypted in dev');
      return 'NOT_CONFIGURED';
    }
    return this.defaultKmsKeyId;
  }

  private async encryptField(plaintext: string, kmsKeyId: string): Promise<string> {
    if (kmsKeyId === 'NOT_CONFIGURED') {
      return `dev:${Buffer.from(plaintext).toString('base64')}`;
    }

    try {
      const result = await this.kmsClient.send(
        new EncryptCommand({ KeyId: kmsKeyId, Plaintext: Buffer.from(plaintext) }),
      );
      if (!result.CiphertextBlob) throw new Error('KMS returned empty ciphertext');
      return Buffer.from(result.CiphertextBlob).toString('base64');
    } catch (err: any) {
      this.logger.error(`KMS encryption failed: ${err.message}`);
      throw new BadRequestException('Failed to encrypt sensitive configuration');
    }
  }

  // ---------------------------------------------------------------------------
  // Lambda Invocation
  // ---------------------------------------------------------------------------

  private async invokePipelineExecutor(customerId: string, pipelineName: string, buildVersion: string) {
    const payload = JSON.stringify({ customerId, pipelineName, buildVersion });
    this.logger.log(`Invoking Lambda ${this.executorFunctionName}: ${customerId}/${pipelineName}/${buildVersion}`);

    const result = await this.lambdaClient.send(
      new InvokeCommand({
        FunctionName: this.executorFunctionName,
        InvocationType: 'Event',
        Payload: Buffer.from(payload),
      }),
    );

    this.logger.log(`Lambda invocation status: ${result.StatusCode}`);
    return { statusCode: result.StatusCode, functionError: result.FunctionError || null };
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ResolvedCredential {
  id: string;
  name: string;
  authType: string;
  connector: string;
  url: string;
  username: string;
  apiKey: string;
  token: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  password: string;
  artifacts: { name: string; type: string }[];
}

interface EnvironmentNode {
  id: string;
  label: string;
  stages: { id: string; type: string; label: string; tool: string }[];
}
