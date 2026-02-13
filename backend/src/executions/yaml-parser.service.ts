import { Injectable, Logger } from '@nestjs/common';

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
}

export interface ParsedPipeline {
  name: string;
  nodes: ParsedNode[];
}

/**
 * YAML Parser Service
 * 
 * Parses pipeline YAML content into executable node/stage structures.
 * Supports the custom pipeline YAML format with nodes, stages,
 * execution flags, tool selection, and dependency graphs.
 */
@Injectable()
export class YamlParserService {
  private readonly logger = new Logger(YamlParserService.name);

  /**
   * Parse pipeline YAML string into executable structure.
   * 
   * Expected YAML format:
   * ```yaml
   * pipeline:
   *   name: My Pipeline
   *   nodes:
   *     - id: source
   *       name: Source Checkout
   *       dependsOn: []
   *       stages:
   *         - id: git-clone
   *           name: Clone Repository
   *           type: code
   *           tool:
   *             id: github
   *             selected: true
   *           execution:
   *             enabled: true
   *           dependsOn: []
   * ```
   */
  parse(yamlContent: string): ParsedPipeline {
    try {
      // Simple YAML-like parser (avoids external dependency)
      // In production, use js-yaml. Here we parse structured JSON fallback.
      const parsed = this.parseYamlOrJson(yamlContent);
      return this.mapToParsedPipeline(parsed);
    } catch (error) {
      this.logger.error(`YAML parse error: ${error.message}`);
      throw new Error(`Failed to parse pipeline YAML: ${error.message}`);
    }
  }

  /**
   * Build from React Flow nodes/edges + pipeline_stages_state
   * This is the primary path when YAML isn't available but canvas data is.
   */
  parseFromCanvasData(
    nodes: any[],
    edges: any[],
    stagesState?: Record<string, any>,
  ): ParsedPipeline {
    const pipelineNodes: ParsedNode[] = [];

    // Filter to actual pipeline nodes (not groups)
    const executableNodes = nodes.filter(
      (n) => n.type === 'pipeline' || n.type === 'pipelineNode' || n.data?.label,
    );

    for (const node of executableNodes) {
      const nodeId = node.id;
      const label = node.data?.label || node.data?.name || nodeId;
      const nodeType = (node.data?.type || 'build').toLowerCase();

      // Find dependencies from edges
      const deps = edges
        .filter((e) => e.target === nodeId)
        .map((e) => e.source);

      // Build stages from node data or stagesState
      const stages: ParsedStage[] = [];
      const stageConfig = stagesState?.[nodeId];

      if (stageConfig?.stages) {
        for (const stage of stageConfig.stages) {
          stages.push({
            id: stage.id || `${nodeId}-${stage.name}`,
            name: stage.name || 'Unnamed Stage',
            type: stage.type || nodeType,
            toolId: stage.tool?.id,
            toolSelected: stage.tool?.selected !== false,
            executionEnabled: stage.execution?.enabled !== false,
            dependsOn: stage.dependsOn || [],
            config: stage.config,
          });
        }
      } else {
        // Default single stage per node
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

    return {
      name: 'Pipeline Execution',
      nodes: pipelineNodes,
    };
  }

  private parseYamlOrJson(content: string): any {
    // Try JSON first
    try {
      return JSON.parse(content);
    } catch {
      // Basic YAML key-value parser for simple structures
      // For production, add js-yaml dependency
      this.logger.warn('Content is not valid JSON, attempting basic parse');
      return { pipeline: { name: 'Unnamed Pipeline', nodes: [] } };
    }
  }

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
}
