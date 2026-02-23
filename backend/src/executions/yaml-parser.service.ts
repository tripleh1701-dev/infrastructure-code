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
   */
  parseFromCanvasData(
    nodes: any[],
    edges: any[],
    stagesState?: Record<string, any>,
  ): ParsedPipeline {
    const pipelineNodes: ParsedNode[] = [];

    const executableNodes = nodes.filter(
      (n) => n.type === 'pipeline' || n.type === 'pipelineNode' || n.data?.label,
    );

    for (const node of executableNodes) {
      const nodeId = node.id;
      const label = node.data?.label || node.data?.name || nodeId;
      const nodeType = (node.data?.type || 'build').toLowerCase();

      const deps = edges
        .filter((e) => e.target === nodeId)
        .map((e) => e.source);

      const stages: ParsedStage[] = [];
      const stageConfig = stagesState?.[nodeId];

      if (stageConfig?.stages) {
        for (const stage of stageConfig.stages) {
          const selectedConnectors = stageConfig.selectedConnectors || {};
          stages.push({
            id: stage.id || `${nodeId}-${stage.name}`,
            name: stage.name || 'Unnamed Stage',
            type: stage.type || nodeType,
            toolId: stage.tool?.id,
            toolSelected: stage.tool?.selected !== false,
            executionEnabled: stage.execution?.enabled !== false,
            dependsOn: stage.dependsOn || [],
            config: stage.config,
            credentialId: selectedConnectors[stage.id] || selectedConnectors[stage.type],
          });
        }
      } else {
        stages.push({
          id: `${nodeId}-main`,
          name: label,
          type: nodeType,
          executionEnabled: true,
          toolSelected: true,
          dependsOn: [],
        });
      }

      pipelineNodes.push({
        id: nodeId,
        name: label,
        environment: node.data?.environment,
        dependsOn: deps,
        stages,
      });
    }

    return { name: 'Pipeline Execution', nodes: pipelineNodes };
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
