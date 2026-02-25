/**
 * Pipeline Executor — Dedicated Lambda Handler
 *
 * This handler is invoked asynchronously (InvocationType: Event) by the
 * API Lambda's ExecutionsService.runPipeline(). It receives a raw JSON
 * payload (not an API Gateway event) and calls executePipeline() directly
 * via the NestJS dependency injection container.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExecutionsService } from './executions/executions.service';
import { Context } from 'aws-lambda';

let cachedApp: any;

async function getApp() {
  if (!cachedApp) {
    cachedApp = await NestFactory.createApplicationContext(AppModule);
  }
  return cachedApp;
}

export const handler = async (event: any, context: Context) => {
  // Prevent Lambda from waiting for empty event loop (keeps connections alive)
  context.callbackWaitsForEmptyEventLoop = false;

  console.log('[PIPELINE-EXECUTOR] Received invocation', JSON.stringify({
    executionId: event.executionId,
    pipelineId: event.pipelineId,
    accountId: event.accountId,
    buildJobId: event.buildJobId,
  }));

  if (!event.executionId || !event.accountId || !event.parsedPipeline) {
    console.error('[PIPELINE-EXECUTOR] Missing required fields in payload');
    return { statusCode: 400, body: 'Missing required fields' };
  }

  try {
    const app = await getApp();
    const executionsService = app.get(ExecutionsService);

    await executionsService.executePipeline(
      event.executionId,
      event.accountId,
      event.parsedPipeline,       // { name, nodes }
      event.isCustomer ?? false,
      event.isPrivate ?? false,
      event.userId,
      event.userEmail,
      event.approverEmails ?? [],
      event.pipelineId,
      event.buildJobId,
      event.branch ?? 'main',
      event.pipelineName,
    );

    console.log(`[PIPELINE-EXECUTOR] Execution ${event.executionId} completed`);
    return { statusCode: 200, body: 'OK' };
  } catch (error: any) {
    console.error(`[PIPELINE-EXECUTOR] Fatal error for ${event.executionId}:`, error.message, error.stack);
    return { statusCode: 500, body: error.message };
  }
};

