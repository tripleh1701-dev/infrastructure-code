import { Injectable, Logger } from '@nestjs/common';
import * as yaml from 'js-yaml';

/**
 * Connector authentication embedded in YAML
 */
export interface ConnectorAuth {
  type: string; // UsernameAndApiKey | PersonalAccessToken | OAuth
  username?: string;
  apiKey?: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
}

/**
 * Connector config from YAML
 */
export interface ConnectorConfig {
  url?: string;
  repoUrl?: string;
  branch?: string;
  apiUrl?: string;
  authentication?: ConnectorAuth;
}

/**
 * SAP CPI artifact descriptor
 */
export interface ArtifactDescriptor {
  name: string;
  type: string; // IntegrationFlow | ValueMapping | ScriptCollection | MessageMapping
  packageId?: string; // SAP CPI package ID for pre-deploy validation
}

/**
 * Tool configuration from YAML
 */
export interface ToolConfig {
  type: string; // JIRA | GitHub | SAP_CPI | Jenkins | etc.
  connector?: ConnectorConfig;
  environment?: ConnectorConfig & { authentication?: ConnectorAuth };
  inputs?: Record<string, any>;
  artifacts?: ArtifactDescriptor[];
}

/**
 * Parsed pipeline node
 */
export interface ParsedNode {
  id: string;
  name: string;
  environment?: string;
  dependsOn: string[];
  stages: ParsedStage[];
}

export interface ParsedStage {
  id: string;
  name: string;
  type: string; // plan | code | build | deploy | release | approval
  toolId?: string;
  toolSelected?: boolean;
  executionEnabled: boolean;
  dependsOn: string[];
  config?: Record<string, any>;
  /** Tool configuration from YAML (type, connector, artifacts, etc.) */
  toolConfig?: ToolConfig;
  /** Credential ID from pipeline_stages_state (selectedConnectors) */
  credentialId?: string;
}

export interface ParsedPipeline {
  name: string;
  buildVersion?: string;
  nodes: ParsedNode[];
}

/**
 * YAML Parser Service
 *
 * Parses pipeline YAML content into executable node/stage structures.
 * Supports two formats:
 *   1. Python-style YAML (pipelineName, nodes[].stages[].tool.connector)
 *   2. Canvas-style JSON  (pipeline.nodes[].stages[].tool.id)
 */
@Injectable()
export class YamlParserService {
  private readonly logger = new Logger(YamlParserService.name);

  // ---------------------------------------------------------------------------
  // Parse YAML string (supports both Python-style and canvas-style)
  // ---------------------------------------------------------------------------

  parse(yamlContent: string): ParsedPipeline {
    try {
      const parsed = this.parseYamlOrJson(yamlContent);

      // Detect Python-style format (has pipelineName at root)
      if (parsed.pipelineName || (parsed.nodes && !parsed.pipeline)) {
        return this.mapFromPythonFormat(parsed);
      }

      // Canvas-style format
      return this.mapToParsedPipeline(parsed);
    } catch (error) {
      this.logger.error(`YAML parse error: ${error.message}`);
      throw new Error(`Failed to parse pipeline YAML: ${error.message}`);
    }
  }

  /**
   * Build from React Flow nodes/edges + pipeline_stages_state
   *
   * The UI stores:
   *   - nodes: [{id, type: 'environmentGroup'|'pipeline', parentId, data: {label, category, nodeType}}]
   *   - edges: [{source, target}]
   *   - stagesState (flat): {
   *       selectedConnectors:  { "envId__stageId": connectorId },
   *       selectedEnvironments: { "envId__stageId": envName },
   *       selectedBranches:    { "envId__stageId": branch },
   *       selectedApprovers:   { "envId__stageId": [emails] },
   *       connectorRepositoryUrls: { "envId__stageId": url },
   *     }
   */
  parseFromCanvasData(
    nodes: any[],
    edges: any[],
    stagesState?: Record<string, any>,
  ): ParsedPipeline {
    // 1. Separate environment groups from stage (pipeline) nodes
    const envGroups = new Map<string, { id: string; name: string; stages: any[] }>();
    const stageNodes: any[] = [];

    for (const node of nodes) {
      if (node.type === 'environmentGroup' || node.type === 'group') {
        envGroups.set(node.id, {
          id: node.id,
          name: node.data?.label || node.data?.name || node.id,
          stages: [],
        });
      } else {
        stageNodes.push(node);
      }
    }

    // Default group if none defined
    if (envGroups.size === 0) {
      envGroups.set('default', { id: 'default', name: 'Development', stages: [] });
    }

    // 2. Assign stage nodes to their parent environment group
    for (const node of stageNodes) {
      const parentId = node.parentId || node.parentNode || 'default';
      const group = envGroups.get(parentId) || [...envGroups.values()][0];
      if (group) {
        group.stages.push(node);
      }
    }

    // 3. Determine environment-level dependency order from edges
    const envEdges = edges
      .filter((e) => envGroups.has(e.source) && envGroups.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    // 4. Build parsed nodes
    const selectedConnectors = stagesState?.selectedConnectors || {};
    const selectedEnvironments = stagesState?.selectedEnvironments || {};
    const selectedBranches = stagesState?.selectedBranches || {};
    const selectedApprovers = stagesState?.selectedApprovers || {};
    const connectorRepoUrls = stagesState?.connectorRepositoryUrls || {};
    const jiraNumbers = stagesState?.jiraNumbers || {};

    const pipelineNodes: ParsedNode[] = [];

    for (const [envId, group] of envGroups) {
      const deps = envEdges
        .filter((e) => e.target === envId)
        .map((e) => e.source);

      // Sort stages by Y position for correct execution order
      const sortedStages = group.stages.sort(
        (a, b) => (a.position?.y || 0) - (b.position?.y || 0),
      );

      const stages: ParsedStage[] = sortedStages.map((stageNode) => {
        const stageId = stageNode.id;
        const stageKey = `${envId}__${stageId}`;
        const nodeType = stageNode.data?.nodeType || stageNode.data?.type || stageNode.type || '';
        const category = stageNode.data?.category || '';
        const label = stageNode.data?.label || stageNode.data?.name || stageId;

        // Derive stage type and tool ID from nodeType (e.g. plan_jira, code_github, deploy_cloud_foundry)
        const { stageType, toolId } = this.deriveStageAndTool(nodeType, category);

        return {
          id: stageId,
          name: label,
          type: stageType,
          toolId,
          toolSelected: true,
          executionEnabled: true,
          dependsOn: [],
          // Store the connector ID from pipelineStagesState (will be resolved to credential later)
          credentialId: selectedConnectors[stageKey] || undefined,
          // Store metadata for later resolution
          config: {
            _stageKey: stageKey,
            _envId: envId,
            _connectorId: selectedConnectors[stageKey] || undefined,
            _environmentName: selectedEnvironments[stageKey] || undefined,
            _branch: selectedBranches[stageKey] || undefined,
            _approvers: selectedApprovers[stageKey] || undefined,
            _repoUrl: connectorRepoUrls[stageKey] || undefined,
            _jiraKey: jiraNumbers[stageKey] || undefined,
          },
        } as ParsedStage;
      });

      pipelineNodes.push({
        id: envId,
        name: group.name,
        dependsOn: deps,
        stages,
      });
    }

    return { name: 'Pipeline Execution', nodes: pipelineNodes };
  }

  /**
   * Derive stage type and tool ID from React Flow node type identifiers.
   * E.g. "plan_jira" → { stageType: "plan", toolId: "JIRA" }
   *      "deploy_cloud_foundry" → { stageType: "deploy", toolId: "SAP_CPI" }
   */
  private deriveStageAndTool(
    nodeType: string,
    category: string,
  ): { stageType: string; toolId: string | undefined } {
    const lower = (nodeType || '').toLowerCase();

    // Map nodeType → stage type + tool
    const mappings: Record<string, { stageType: string; toolId: string | undefined }> = {
      plan_jira: { stageType: 'plan', toolId: 'JIRA' },
      plan_trello: { stageType: 'plan', toolId: 'TRELLO' },
      plan_asana: { stageType: 'plan', toolId: 'ASANA' },
      code_github: { stageType: 'code', toolId: 'GITHUB' },
      code_gitlab: { stageType: 'code', toolId: 'GITLAB' },
      code_bitbucket: { stageType: 'code', toolId: 'BITBUCKET' },
      code_azure_repos: { stageType: 'code', toolId: 'AZURE_REPOS' },
      build_github: { stageType: 'build', toolId: 'GITHUB' },
      build_jenkins: { stageType: 'build', toolId: 'JENKINS' },
      deploy_cloud_foundry: { stageType: 'deploy', toolId: 'SAP_CPI' },
      deploy_sap_cpi: { stageType: 'deploy', toolId: 'SAP_CPI' },
      approval_manual: { stageType: 'approval', toolId: undefined },
      release_servicenow: { stageType: 'release', toolId: 'SERVICENOW' },
      test_selenium: { stageType: 'test', toolId: 'SELENIUM' },
    };

    const match = mappings[lower];
    if (match) return match;

    // Fallback: try to parse from category
    if (category) {
      return { stageType: category.toLowerCase(), toolId: undefined };
    }

    // Extract type from prefix (e.g. "plan_unknown" → "plan")
    const parts = lower.split('_');
    if (parts.length > 1) {
      return { stageType: parts[0], toolId: parts.slice(1).join('_').toUpperCase() };
    }

    return { stageType: lower || 'generic', toolId: undefined };
  }

  // ---------------------------------------------------------------------------
  // Python-style YAML mapping
  // ---------------------------------------------------------------------------

  private mapFromPythonFormat(raw: any): ParsedPipeline {
    const name = raw.pipelineName || raw.pipeline_name || 'Unnamed Pipeline';
    const buildVersion = raw.buildVersion || raw.build_version;

    const nodes: ParsedNode[] = (raw.nodes || []).map((node: any, nodeIdx: number) => {
      const nodeId = node.id || `node-${nodeIdx}`;
      const nodeName = node.name || nodeId;

      const stages: ParsedStage[] = (node.stages || []).map((stage: any, stageIdx: number) => {
        const stageId = stage.id || `${nodeId}-stage-${stageIdx}`;
        const stageName = stage.name || stageId;
        const tool = stage.tool;

        let toolConfig: ToolConfig | undefined;
        let stageType = (stageName || '').toLowerCase();

        if (tool) {
          const toolType = tool.type || 'unknown';

          // Determine stage type from tool type
          switch (toolType.toUpperCase()) {
            case 'JIRA':
              stageType = 'plan';
              break;
            case 'GITHUB':
            case 'GITLAB':
            case 'BITBUCKET':
              stageType = 'code';
              break;
            case 'SAP_CPI':
            case 'SAP_CLOUD_INTEGRATION':
              stageType = 'deploy';
              break;
            case 'JENKINS':
              stageType = 'build';
              break;
          }

          toolConfig = {
            type: toolType,
            connector: tool.connector
              ? {
                  url: tool.connector.url,
                  repoUrl: tool.connector.repoUrl,
                  branch: tool.connector.branch,
                  authentication: tool.connector.authentication
                    ? {
                        type: tool.connector.authentication.type || 'unknown',
                        username: tool.connector.authentication.username,
                        apiKey: tool.connector.authentication.apiKey,
                        token: tool.connector.authentication.token,
                        clientId: tool.connector.authentication.clientId,
                        clientSecret: tool.connector.authentication.clientSecret,
                        tokenUrl: tool.connector.authentication.tokenUrl,
                      }
                    : undefined,
                }
              : undefined,
            environment: tool.environment
              ? {
                  apiUrl: tool.environment.apiUrl,
                  authentication: tool.environment.authentication
                    ? {
                        type: tool.environment.authentication.type || 'OAuth',
                        clientId: tool.environment.authentication.clientId,
                        clientSecret: tool.environment.authentication.clientSecret,
                        tokenUrl: tool.environment.authentication.tokenUrl,
                      }
                    : undefined,
                }
              : undefined,
            inputs: tool.inputs,
            artifacts: tool.artifacts?.map((a: any) => ({
              name: a.name,
              type: a.type,
              packageId: a.packageId || undefined,
            })),
          };
        }

        return {
          id: stageId,
          name: stageName,
          type: stage.type || stageType,
          toolId: tool?.type,
          toolSelected: tool != null,
          executionEnabled: tool != null, // skip stages with no tool
          dependsOn: stage.dependsOn || [],
          config: stage.config,
          toolConfig,
        } as ParsedStage;
      });

      return {
        id: nodeId,
        name: nodeName,
        environment: node.environment,
        dependsOn: node.dependsOn || [],
        stages,
      } as ParsedNode;
    });

    return { name, buildVersion, nodes };
  }

  // ---------------------------------------------------------------------------
  // Canvas-style JSON mapping
  // ---------------------------------------------------------------------------

  private mapToParsedPipeline(raw: any): ParsedPipeline {
    const pipeline = raw.pipeline || raw;

    const nodes: ParsedNode[] = (pipeline.nodes || []).map((node: any) => ({
      id: node.id,
      name: node.name || node.id,
      environment: node.environment,
      dependsOn: node.dependsOn || [],
      stages: (node.stages || []).map((stage: any) => ({
        id: stage.id,
        name: stage.name || stage.id,
        type: stage.type || 'build',
        toolId: stage.tool?.id,
        toolSelected: stage.tool?.selected !== false,
        executionEnabled: stage.execution?.enabled !== false,
        dependsOn: stage.dependsOn || [],
        config: stage.config,
      })),
    }));

    return {
      name: pipeline.name || 'Unnamed Pipeline',
      nodes,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private parseYamlOrJson(content: string): any {
    // Try JSON first
    try {
      return JSON.parse(content);
    } catch {
      // Fall through to YAML
    }

    // Try YAML
    try {
      const parsed = yaml.load(content);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (yamlErr) {
      this.logger.warn(`YAML parse failed: ${yamlErr.message}`);
    }

    throw new Error('Content is neither valid JSON nor valid YAML');
  }
}
