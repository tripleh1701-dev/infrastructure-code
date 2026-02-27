import { Injectable, Logger } from '@nestjs/common';
import { ParsedNode, ParsedStage } from './yaml-parser.service';

/**
 * Dependency Resolver Service
 * 
 * Implements topological sort for pipeline nodes and stages,
 * ensuring correct execution order based on `dependsOn` declarations.
 */
@Injectable()
export class DependencyResolverService {
  private readonly logger = new Logger(DependencyResolverService.name);

  /**
   * Sort nodes in topological order based on dependsOn relationships.
   * Returns nodes grouped into execution tiers (nodes in same tier can run in parallel).
   */
  resolveNodeOrder(nodes: ParsedNode[]): ParsedNode[][] {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const sorted: ParsedNode[] = [];

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) {
        throw new Error(`Circular dependency detected involving node: ${nodeId}`);
      }

      visiting.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node) {
        this.logger.warn(`Unknown dependency: ${nodeId}`);
        visiting.delete(nodeId);
        return;
      }

      for (const dep of node.dependsOn) {
        visit(dep);
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      sorted.push(node);
    };

    for (const node of nodes) {
      visit(node.id);
    }

    // Group into tiers for parallel execution
    return this.groupIntoTiers(sorted);
  }

  /**
   * Sort stages within a node in topological order.
   */
  resolveStageOrder(stages: ParsedStage[]): ParsedStage[] {
    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const sorted: ParsedStage[] = [];

    const visit = (stageId: string) => {
      if (visited.has(stageId)) return;
      if (visiting.has(stageId)) {
        throw new Error(`Circular dependency in stages: ${stageId}`);
      }

      visiting.add(stageId);
      const stage = stageMap.get(stageId);
      if (!stage) {
        visiting.delete(stageId);
        return;
      }

      for (const dep of stage.dependsOn) {
        visit(dep);
      }

      visiting.delete(stageId);
      visited.add(stageId);
      sorted.push(stage);
    };

    for (const stage of stages) {
      visit(stage.id);
    }

    return sorted;
  }

  private groupIntoTiers(sorted: ParsedNode[]): ParsedNode[][] {
    const tiers: ParsedNode[][] = [];
    const completed = new Set<string>();

    // Simple tier assignment: each node goes in first tier where all deps are done
    for (const node of sorted) {
      let tierIdx = 0;
      for (const dep of node.dependsOn) {
        for (let t = 0; t < tiers.length; t++) {
          if (tiers[t].some((n) => n.id === dep)) {
            tierIdx = Math.max(tierIdx, t + 1);
          }
        }
      }

      while (tiers.length <= tierIdx) tiers.push([]);
      tiers[tierIdx].push(node);
      completed.add(node.id);
    }

    return tiers.length > 0 ? tiers : [sorted];
  }
}
