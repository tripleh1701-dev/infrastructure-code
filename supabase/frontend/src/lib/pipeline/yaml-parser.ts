/**
 * Pipeline YAML Parser
 * 
 * Parses the Python-style YAML format used by the pipeline executor Lambda.
 * This format embeds tool configs, connector credentials, and artifact definitions
 * directly in the YAML, matching the structure used by cicdpipeline.py.
 * 
 * YAML Structure:
 * ```yaml
 * pipelineName: Pipeline4
 * buildVersion: "1.0.0"
 * nodes:
 *   - name: Development
 *     stages:
 *       - name: Plan
 *         tool:
 *           type: JIRA
 *           connector:
 *             url: https://...
 *             authentication:
 *               type: UsernameAndApiKey
 *               username: user@example.com
 *               apiKey: ...
 *           inputs:
 *             jiraKey: SCRUM-1
 *       - name: Code
 *         tool:
 *           type: GitHub
 *           connector:
 *             repoUrl: https://github.com/owner/repo.git
 *             branch: main
 *             authentication:
 *               type: PersonalAccessToken
 *               token: ghp_...
 *       - name: Deploy
 *         tool:
 *           type: SAP_CPI
 *           environment:
 *             apiUrl: https://...
 *             authentication:
 *               clientId: ...
 *               clientSecret: ...
 *               tokenUrl: https://...
 *           artifacts:
 *             - name: IFLOW_HTTP_ECHO_DEMO
 *               type: IntegrationFlow
 * ```
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineYaml {
  pipelineName: string;
  buildVersion: string;
  nodes: PipelineYamlNode[];
}

export interface PipelineYamlNode {
  name: string;
  stages: PipelineYamlStage[];
}

export interface PipelineYamlStage {
  name: string;
  tool: PipelineYamlTool | null;
}

export type ToolType = 'JIRA' | 'GitHub' | 'SAP_CPI' | 'GitLab' | 'Jenkins' | 'CloudFoundry';

export interface PipelineYamlTool {
  type: ToolType;
  connector?: JiraConnector | GitHubConnector;
  environment?: SapCpiEnvironment;
  inputs?: Record<string, string>;
  artifacts?: CpiArtifact[];
}

export interface JiraConnector {
  url: string;
  authentication: {
    type: 'UsernameAndApiKey';
    username: string;
    apiKey: string;
  };
}

export interface GitHubConnector {
  repoUrl: string;
  branch: string;
  authentication: {
    type: 'PersonalAccessToken';
    token: string;
  };
}

export interface SapCpiEnvironment {
  apiUrl: string;
  authentication: {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
  };
}

export interface CpiArtifact {
  name: string;
  type: 'IntegrationFlow' | 'ValueMapping' | 'MessageMapping' | 'ScriptCollection' | 'GroovyScript' | 'MessageResource';
}

// ─── Validation ───────────────────────────────────────────────────────────────

export class YamlParseError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'YamlParseError';
  }
}

function validateString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new YamlParseError(`${fieldName} must be a non-empty string`, fieldName);
  }
  return value.trim();
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a raw YAML object (already deserialized from YAML string) into
 * a validated PipelineYaml structure matching the Python executor format.
 */
export function parsePipelineYaml(raw: Record<string, any>): PipelineYaml {
  const pipelineName = validateString(raw.pipelineName, 'pipelineName');
  const buildVersion = validateString(raw.buildVersion, 'buildVersion');

  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    throw new YamlParseError('nodes must be a non-empty array', 'nodes');
  }

  const nodes: PipelineYamlNode[] = raw.nodes.map((rawNode: any, nodeIdx: number) => {
    const nodeName = validateString(rawNode.name, `nodes[${nodeIdx}].name`);

    if (!Array.isArray(rawNode.stages) || rawNode.stages.length === 0) {
      throw new YamlParseError(`nodes[${nodeIdx}].stages must be a non-empty array`, `nodes[${nodeIdx}].stages`);
    }

    const stages: PipelineYamlStage[] = rawNode.stages.map((rawStage: any, stageIdx: number) => {
      const stageName = validateString(rawStage.name, `nodes[${nodeIdx}].stages[${stageIdx}].name`);
      const tool = parseToolConfig(rawStage.tool, `nodes[${nodeIdx}].stages[${stageIdx}].tool`);
      return { name: stageName, tool };
    });

    return { name: nodeName, stages };
  });

  return { pipelineName, buildVersion, nodes };
}

function parseToolConfig(raw: any, path: string): PipelineYamlTool | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') {
    throw new YamlParseError(`${path} must be an object or null`, path);
  }

  const type = validateString(raw.type, `${path}.type`) as ToolType;
  const tool: PipelineYamlTool = { type };

  // Parse connector (JIRA, GitHub)
  if (raw.connector) {
    tool.connector = raw.connector;
  }

  // Parse environment (SAP_CPI)
  if (raw.environment) {
    tool.environment = raw.environment;
  }

  // Parse inputs (e.g. jiraKey)
  if (raw.inputs && typeof raw.inputs === 'object') {
    tool.inputs = raw.inputs;
  }

  // Parse artifacts
  if (Array.isArray(raw.artifacts)) {
    tool.artifacts = raw.artifacts.map((a: any) => ({
      name: validateString(a.name, `${path}.artifacts[].name`),
      type: validateString(a.type, `${path}.artifacts[].type`),
    })) as CpiArtifact[];
  }

  return tool;
}

// ─── Stage Execution Order ────────────────────────────────────────────────────

export interface FlatStage {
  nodeIndex: number;
  nodeName: string;
  stageIndex: number;
  stageName: string;
  tool: PipelineYamlTool | null;
  stageId: string; // e.g. "node_0_stage_1"
}

/**
 * Flatten the node/stage hierarchy into an ordered execution list.
 * Stages with null tools are included but marked as skip-able.
 */
export function flattenStages(pipeline: PipelineYaml): FlatStage[] {
  const result: FlatStage[] = [];
  pipeline.nodes.forEach((node, nodeIdx) => {
    node.stages.forEach((stage, stageIdx) => {
      result.push({
        nodeIndex: nodeIdx,
        nodeName: node.name,
        stageIndex: stageIdx,
        stageName: stage.name,
        tool: stage.tool,
        stageId: `node_${nodeIdx}_stage_${stageIdx}`,
      });
    });
  });
  return result;
}

/**
 * Get the GitHub connector config from the pipeline (used by Deploy stages
 * to upload artifacts to the repository).
 */
export function findGitHubConfig(pipeline: PipelineYaml): GitHubConnector | null {
  for (const node of pipeline.nodes) {
    for (const stage of node.stages) {
      if (stage.tool?.type === 'GitHub' && stage.tool.connector) {
        return stage.tool.connector as GitHubConnector;
      }
    }
  }
  return null;
}
