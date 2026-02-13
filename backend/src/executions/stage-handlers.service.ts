import { Injectable, Logger } from '@nestjs/common';
import { ParsedStage } from './yaml-parser.service';

/**
 * Stage execution result
 */
export interface StageResult {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'WAITING_APPROVAL';
  message?: string;
  durationMs?: number;
}

/**
 * Stage Handlers Service
 * 
 * Dispatches stage execution to the appropriate handler by type.
 * Each handler simulates the tool integration (JIRA, GitHub, etc.)
 * and can be replaced with real SDK calls when connectors are wired.
 */
@Injectable()
export class StageHandlersService {
  private readonly logger = new Logger(StageHandlersService.name);

  async executeStage(
    executionId: string,
    nodeId: string,
    stage: ParsedStage,
  ): Promise<StageResult> {
    const prefix = `[EXECUTION:${executionId}][NODE:${nodeId}]`;

    console.log(`${prefix}[STAGE:${stage.id}][TYPE:${stage.type}] STARTED`);

    // Skip disabled stages
    if (!stage.executionEnabled) {
      console.log(`${prefix}[STAGE:${stage.id}] SKIPPED — execution.enabled=false`);
      return { status: 'SKIPPED', message: 'Execution disabled' };
    }

    // Skip stages with unselected tools
    if (stage.toolId && !stage.toolSelected) {
      console.log(`${prefix}[STAGE:${stage.id}] SKIPPED — tool.selected=false`);
      return { status: 'SKIPPED', message: 'Tool not selected' };
    }

    if (stage.toolId) {
      console.log(`${prefix}[STAGE:${stage.id}] Running tool: ${stage.toolId}`);
    }

    const start = Date.now();

    try {
      switch (stage.type.toLowerCase()) {
        case 'plan':
          await this.handlePlan(executionId, nodeId, stage);
          break;
        case 'code':
          await this.handleCode(executionId, nodeId, stage);
          break;
        case 'build':
          await this.handleBuild(executionId, nodeId, stage);
          break;
        case 'deploy':
          await this.handleDeploy(executionId, nodeId, stage);
          break;
        case 'release':
          await this.handleRelease(executionId, nodeId, stage);
          break;
        case 'test':
          await this.handleTest(executionId, nodeId, stage);
          break;
        case 'approval':
          console.log(`${prefix}[STAGE:${stage.id}] WAITING_APPROVAL — manual approval required`);
          return { status: 'WAITING_APPROVAL', message: 'Awaiting manual approval' };
        default:
          await this.handleGeneric(executionId, nodeId, stage);
      }

      const durationMs = Date.now() - start;
      console.log(`${prefix}[STAGE:${stage.id}] SUCCESS (${durationMs}ms)`);
      return { status: 'SUCCESS', durationMs };
    } catch (error) {
      const durationMs = Date.now() - start;
      console.log(`${prefix}[STAGE:${stage.id}] FAILED: ${error.message}`);
      return { status: 'FAILED', message: error.message, durationMs };
    }
  }

  // --- Handlers ---

  private async handlePlan(_execId: string, _nodeId: string, stage: ParsedStage): Promise<void> {
    // JIRA handler — create/update work items
    console.log(`  → JIRA handler: Creating work items for ${stage.name}`);
    await this.simulateWork(500, 1500);
    console.log(`  → JIRA: Work item created successfully`);
  }

  private async handleCode(_execId: string, _nodeId: string, stage: ParsedStage): Promise<void> {
    // GitHub handler — clone, checkout, merge
    console.log(`  → GitHub handler: Source checkout for ${stage.name}`);
    await this.simulateWork(300, 1000);
    console.log(`  → GitHub: Repository cloned, HEAD at latest commit`);
  }

  private async handleBuild(_execId: string, _nodeId: string, stage: ParsedStage): Promise<void> {
    // Build handler — compile, package
    console.log(`  → Build handler: Compiling ${stage.name}`);
    await this.simulateWork(1000, 3000);
    console.log(`  → Build: Compilation successful — 0 errors`);
  }

  private async handleDeploy(_execId: string, _nodeId: string, stage: ParsedStage): Promise<void> {
    // CloudFoundry handler — deploy application
    console.log(`  → CloudFoundry handler: Deploying ${stage.name}`);
    await this.simulateWork(1000, 4000);
    console.log(`  → CloudFoundry: Application deployed, health check passed`);
  }

  private async handleRelease(_execId: string, _nodeId: string, stage: ParsedStage): Promise<void> {
    // ServiceNow handler — create change record
    console.log(`  → ServiceNow handler: Creating change record for ${stage.name}`);
    await this.simulateWork(500, 1500);
    console.log(`  → ServiceNow: Change record CR-${Math.floor(Math.random() * 9999)} created`);
  }

  private async handleTest(_execId: string, _nodeId: string, stage: ParsedStage): Promise<void> {
    console.log(`  → Test handler: Running tests for ${stage.name}`);
    await this.simulateWork(800, 2000);
    console.log(`  → Tests: All tests passed`);
  }

  private async handleGeneric(_execId: string, _nodeId: string, stage: ParsedStage): Promise<void> {
    console.log(`  → Generic handler: Processing ${stage.name} (type: ${stage.type})`);
    await this.simulateWork(200, 800);
    console.log(`  → Generic: Stage completed`);
  }

  /**
   * Simulate work with random duration.
   * Replace with real tool SDK calls when wiring connectors.
   */
  private simulateWork(minMs: number, maxMs: number): Promise<void> {
    const duration = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, duration));
  }
}
