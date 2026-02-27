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
import { EnvironmentsService, Environment } from '../environments/environments.service';
import { ConnectorsService, Connector } from '../connectors/connectors.service';
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
    private readonly environmentsService: EnvironmentsService,
    private readonly connectorsService: ConnectorsService,
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

    // 3b. Resolve environments for deploy stages
    const resolvedEnvironments: Record<string, ResolvedEnvironment> = {};
    const selectedEnvIds = pipelineStagesState.selectedEnvironments || {};

    for (const [stageKey, envId] of Object.entries(selectedEnvIds)) {
      if (envId) {
        try {
          const env = await this.environmentsService.findOne(envId as string, accountId);
          resolvedEnvironments[stageKey] = this.mapEnvironment(env);
        } catch (err) {
          this.logger.warn(`Environment ${envId} for stage ${stageKey} not found: ${err.message}`);
        }
      }
    }

    // 3c. Resolve connectors (for repo URLs, etc.)
    const resolvedConnectorDetails: Record<string, Connector> = {};
    const connectorRepoUrls = pipelineStagesState.connectorRepositoryUrls || {};

    for (const [stageKey, connId] of Object.entries(selectedConnectors)) {
      if (connId && !resolvedCredentials[stageKey]) {
        // If it's a connector ID rather than a credential ID, try fetching as connector
        try {
          const connector = await this.connectorsService.findOne(connId as string, accountId);
          resolvedConnectorDetails[stageKey] = connector;
          // Also resolve the connector's credential if available
          if (connector.credentialId) {
            try {
              const cred = await this.credentialsService.findOne(connector.credentialId, accountId);
              resolvedCredentials[stageKey] = this.mapCredential(cred);
              // Inherit URL from connector if credential doesn't have one
              if (!resolvedCredentials[stageKey].url && connector.url) {
                resolvedCredentials[stageKey].url = connector.url;
              }
            } catch {}
          }
        } catch {
          // Already resolved as credential above
        }
      }
    }

    this.logger.log(`Resolved ${Object.keys(resolvedCredentials).length} credentials, ${Object.keys(resolvedEnvironments).length} environments for build YAML`);

    // 4. Construct build YAML
    const buildYaml = this.constructBuildYaml(
      pipeline,
      buildJob,
      buildVersion,
      pipelineStagesState,
      resolvedCredentials,
      resolvedEnvironments,
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
        selectedConnectors: pipelineStagesState.selectedConnectors || {},
        selectedEnvironments: pipelineStagesState.selectedEnvironments || {},
        connectorRepositoryUrls: pipelineStagesState.connectorRepositoryUrls || {},
        selectedBranches: pipelineStagesState.selectedBranches || {},
        selectedApprovers: pipelineStagesState.selectedApprovers || {},
        jiraNumbers: pipelineStagesState.jiraNumbers || {},
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
    resolvedEnvironments: Record<string, ResolvedEnvironment>,
  ): string {
    const pipelineName = pipeline.name || buildJob.connectorName || buildJob.connector_name;
    const nodes = pipeline.nodes || [];
    const selectedEnvs = stagesState.selectedEnvironments || {};
    const repoUrls = stagesState.connectorRepositoryUrls || {};
    const branches = stagesState.selectedBranches || {};
    const approvers = stagesState.selectedApprovers || {};
    const jiraNumbers = stagesState.jiraNumbers || {};

    // Collect selected artifacts from the build job for embedding in YAML
    const selectedArtifacts: any[] = buildJob.selectedArtifacts || [];

    let yaml = `pipelineName: "${this.esc(pipelineName)}"\n`;
    yaml += `buildVersion: "${this.esc(buildVersion)}"\n`;
    yaml += `\n`;

    // ── Selected artifacts section ──────────────────────────────────────────
    if (selectedArtifacts.length > 0) {
      yaml += `selectedArtifacts:\n`;

      // Group by package for readable YAML
      const byPackage = new Map<string, any[]>();
      for (const art of selectedArtifacts) {
        const pkgKey = art.packageId || 'unknown';
        if (!byPackage.has(pkgKey)) byPackage.set(pkgKey, []);
        byPackage.get(pkgKey)!.push(art);
      }

      for (const [pkgId, arts] of byPackage) {
        const pkgName = arts[0]?.packageName || pkgId;
        const pkgVersion = arts[0]?.packageVersion || 'latest';
        yaml += `  - package:\n`;
        yaml += `      id: "${this.esc(pkgId)}"\n`;
        yaml += `      name: "${this.esc(pkgName)}"\n`;
        yaml += `      version: "${this.esc(pkgVersion)}"\n`;
        yaml += `    artifacts:\n`;
        for (const a of arts) {
          yaml += `      - id: "${this.esc(a.artifactId || '')}"\n`;
          yaml += `        name: "${this.esc(a.artifactName || '')}"\n`;
          yaml += `        version: "${this.esc(a.artifactVersion || 'Active')}"\n`;
          yaml += `        type: "${this.esc(a.artifactType || '')}"\n`;
        }
      }
      yaml += `\n`;
    }

    yaml += `nodes:\n`;

    // Parse nodes from pipeline canvas data
    const envNodes = this.extractEnvironmentNodes(nodes);

    this.logger.debug(`[constructBuildYaml] envNodes: ${JSON.stringify(envNodes.map(e => ({ id: e.id, label: e.label, stages: e.stages.map(s => ({ id: s.id, label: s.label, tool: s.tool })) })))}`);
    this.logger.debug(`[constructBuildYaml] stagesState keys — connectors: ${JSON.stringify(Object.keys(stagesState.selectedConnectors || {}))}, envs: ${JSON.stringify(Object.keys(selectedEnvs))}, jira: ${JSON.stringify(Object.keys(jiraNumbers))}`);

    for (const envNode of envNodes) {
      const envName = envNode.label || envNode.id;
      yaml += `  - name: ${envName}\n`;
      yaml += `    stages:\n`;

      for (const stage of envNode.stages) {
        // Frontend uses double underscore separator: envId__stageId
        const stageKeyUnderscore = `${envNode.id}__${stage.id}`;
        // Also try double-colon for backward compat
        const stageKeyColon = `${envNode.id}::${stage.id}`;
        // Also try just the stage ID (for flat pipelines)
        const stageKeyDirect = stage.id;

        const cred = resolvedCredentials[stageKeyUnderscore] || resolvedCredentials[stageKeyColon] || resolvedCredentials[stageKeyDirect];
        const resolvedEnv = resolvedEnvironments[stageKeyUnderscore] || resolvedEnvironments[stageKeyColon] || resolvedEnvironments[stageKeyDirect];
        const repoUrl = repoUrls[stageKeyUnderscore] || repoUrls[stageKeyColon] || repoUrls[stageKeyDirect] || '';
        const branch = branches[stageKeyUnderscore] || branches[stageKeyColon] || branches[stageKeyDirect] || 'main';
        const stageApprovers = approvers[stageKeyUnderscore] || approvers[stageKeyColon] || approvers[stageKeyDirect] || [];
        const jiraKey = jiraNumbers[stageKeyUnderscore] || jiraNumbers[stageKeyColon] || jiraNumbers[stageKeyDirect] || '';

        // Infer tool type from stage label/tool or name
        const toolType = this.inferToolType(stage.tool, stage.label, stage.type);

        yaml += `      - name: ${stage.label || stage.type}\n`;

        if (!toolType) {
          yaml += `        tool: null\n`;
        } else {
          yaml += `        tool:\n`;
          yaml += `          type: ${toolType}\n`;

          if (toolType === 'JIRA') {
            if (cred) {
              yaml += `          connector:\n`;
              yaml += `            url: ${this.esc(cred.url || '')}\n`;
              yaml += `            authentication:\n`;
              yaml += `              type: ${this.esc(cred.authType || 'UsernameAndApiKey')}\n`;
              if (cred.username) yaml += `              username: ${this.esc(cred.username)}\n`;
              yaml += `              apiKey: ${this.esc(cred.apiKey || 'ENCRYPTED')}\n`;
            }
            if (jiraKey) {
              yaml += `          inputs:\n`;
              yaml += `            jiraKey: ${this.esc(jiraKey)}\n`;
            }
          } else if (toolType === 'GitHub' || toolType === 'GitLab') {
            yaml += `          connector:\n`;
            yaml += `            repoUrl: ${this.esc(repoUrl || cred?.url || '')}\n`;
            yaml += `            branch: ${branch}\n`;
            if (cred) {
              yaml += `            authentication:\n`;
              yaml += `              type: PersonalAccessToken\n`;
              yaml += `              token: ${this.esc(cred.token || 'ENCRYPTED')}\n`;
            }
          } else if (toolType === 'SAP_CPI' || toolType === 'CloudFoundry') {
            // Use resolved environment details
            if (resolvedEnv) {
              yaml += `          environment:\n`;
              yaml += `            apiUrl: ${this.esc(resolvedEnv.apiUrl)}\n`;
              yaml += `            authentication:\n`;
              yaml += `              clientId: ${this.esc(resolvedEnv.clientId || 'ENCRYPTED')}\n`;
              yaml += `              clientSecret: ${this.esc(resolvedEnv.clientSecret || 'ENCRYPTED')}\n`;
              if (resolvedEnv.tokenUrl) yaml += `              tokenUrl: ${this.esc(resolvedEnv.tokenUrl)}\n`;
            } else if (cred) {
              yaml += `          environment:\n`;
              yaml += `            apiUrl: ${this.esc(cred.url || '')}\n`;
              yaml += `            authentication:\n`;
              yaml += `              clientId: ${this.esc(cred.clientId || 'ENCRYPTED')}\n`;
              yaml += `              clientSecret: ${this.esc(cred.clientSecret || 'ENCRYPTED')}\n`;
              if (cred.tokenUrl) yaml += `              tokenUrl: ${this.esc(cred.tokenUrl)}\n`;
            }

            // Embed artifacts
            const allArtifacts: { name: string; type: string; packageId?: string }[] = [...(cred?.artifacts || [])].map(a => ({ name: a.name, type: a.type, packageId: (a as any).packageId }));
            for (const sa of selectedArtifacts) {
              const artName = sa.artifactId || sa.artifactName || sa.name || '';
              const artType = this.mapArtifactTypeForYaml(sa.artifactType || sa.type || '');
              const artPkgId = sa.packageId || '';
              if (artName) allArtifacts.push({ name: artName, type: artType, packageId: artPkgId });
            }
            if (allArtifacts.length > 0) {
              yaml += `          artifacts:\n`;
              for (const art of allArtifacts) {
                yaml += `            - name: ${this.esc(art.name)}\n`;
                yaml += `              type: ${this.esc(art.type)}\n`;
                if (art.packageId) yaml += `              packageId: ${this.esc(art.packageId)}\n`;
              }
            }
          } else {
            // Generic tool — include whatever credential data is available
            if (cred) {
              yaml += `          connector:\n`;
              if (cred.url) yaml += `            url: ${this.esc(cred.url)}\n`;
              yaml += `            authentication:\n`;
              yaml += `              type: ${this.esc(cred.authType)}\n`;
            }
          }
        }

        if (stageApprovers.length > 0) {
          yaml += `        approvers:\n`;
          for (const approver of stageApprovers) {
            yaml += `          - ${this.esc(approver)}\n`;
          }
        }
      }
    }

    return yaml;
  }

  /**
   * Infer the tool type from the stage's tool field, label, or type.
   */
  private inferToolType(tool: string, label: string, stageType: string): string | null {
    // If tool is explicitly set, normalize it
    if (tool) {
      const upper = tool.toUpperCase();
      if (upper.includes('JIRA')) return 'JIRA';
      if (upper.includes('GITHUB')) return 'GitHub';
      if (upper.includes('GITLAB')) return 'GitLab';
      if (upper.includes('SAP') || upper.includes('CPI')) return 'SAP_CPI';
      if (upper.includes('CLOUD') && upper.includes('FOUNDRY')) return 'CloudFoundry';
      if (upper.includes('JENKINS')) return 'Jenkins';
      return tool;
    }

    // Infer from stage label/name
    const name = (label || stageType || '').toUpperCase();
    if (name.includes('JIRA') || name.includes('PLAN')) return 'JIRA';
    if (name.includes('GITHUB') || name.includes('CODE')) return 'GitHub';
    if (name.includes('GITLAB')) return 'GitLab';
    if (name.includes('DEPLOY') || name.includes('SAP') || name.includes('CPI') || name.includes('CLOUD FOUNDRY')) return 'SAP_CPI';
    if (name.includes('JENKINS')) return 'Jenkins';

    // Build and Test stages typically have no tool
    if (name.includes('BUILD') || name.includes('TEST') || name.includes('RELEASE')) return null;

    return null;
  }

  // buildToolYaml removed — tool YAML is now generated inline in constructBuildYaml

  private mapArtifactTypeForYaml(type: string): string {
    const typeMap: Record<string, string> = {
      'Integration Flow': 'IntegrationFlow',
      'Value Mapping': 'ValueMapping',
      'Message Mapping': 'MessageMapping',
      'Script Collection': 'ScriptCollection',
      'IntegrationDesigntimeArtifacts': 'IntegrationFlow',
      'ValueMappingDesigntimeArtifacts': 'ValueMapping',
      'MessageMappingDesigntimeArtifacts': 'MessageMapping',
      'ScriptCollectionDesigntimeArtifacts': 'ScriptCollection',
    };
    return typeMap[type] || type;
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

  private mapEnvironment(env: Environment): ResolvedEnvironment {
    // Extract deploy connector details from the environment's connectors array
    const deployConnector = (env.connectors || []).find(
      (c) => c.category === 'deploy' || c.connector?.toLowerCase().includes('sap') || c.connector?.toLowerCase().includes('cloud foundry'),
    );
    const apiConnector = (env.connectors || []).find(
      (c) => c.category === 'deploy' || c.apiUrl,
    );

    return {
      id: env.id,
      name: env.name,
      apiUrl: deployConnector?.apiUrl || apiConnector?.apiUrl || '',
      clientId: deployConnector?.oauth2ClientId || apiConnector?.oauth2ClientId || '',
      clientSecret: deployConnector?.oauth2ClientSecret || apiConnector?.oauth2ClientSecret || '',
      tokenUrl: deployConnector?.oauth2TokenUrl || apiConnector?.oauth2TokenUrl || '',
      hostUrl: deployConnector?.hostUrl || '',
      iflowUrl: deployConnector?.iflowUrl || '',
      environmentType: deployConnector?.environmentType || '',
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

interface ResolvedEnvironment {
  id: string;
  name: string;
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  hostUrl: string;
  iflowUrl: string;
  environmentType: string;
}

interface EnvironmentNode {
  id: string;
  label: string;
  stages: { id: string; type: string; label: string; tool: string }[];
}
