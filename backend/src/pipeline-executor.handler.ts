/**
 * Pipeline Executor — Dedicated Lambda Handler
 *
 * Supports TWO invocation formats:
 *
 * 1. Full payload (from ExecutionsService.runPipeline):
 *    { executionId, accountId, parsedPipeline, ... }
 *
 * 2. DynamoDB-reference payload (from PipelineConfigsService):
 *    { customerId, pipelineName, buildVersion }
 *    → Fetches the build YAML from customer DynamoDB, parses it, and executes.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExecutionsService } from './executions/executions.service';
import { YamlParserService, ParsedPipeline, ConnectorAuth } from './executions/yaml-parser.service';
import { DynamoDBRouterService } from './common/dynamodb/dynamodb-router.service';
import { CredentialsService } from './credentials/credentials.service';
import { ConnectorsService } from './connectors/connectors.service';
import { EnvironmentsService } from './environments/environments.service';
import { Context } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { retryWithBackoff, isTransientAwsError } from './common/utils/retry';
import { CircuitBreaker } from './common/utils/circuit-breaker';

// Per-service circuit breakers (persisted across warm Lambda invocations)
const dynamoBreaker = new CircuitBreaker({ name: 'DynamoDB', failureThreshold: 5, resetTimeoutMs: 30_000 });
const credentialsBreaker = new CircuitBreaker({ name: 'Credentials', failureThreshold: 5, resetTimeoutMs: 30_000 });
const connectorsBreaker = new CircuitBreaker({ name: 'Connectors', failureThreshold: 5, resetTimeoutMs: 30_000 });

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
    customerId: event.customerId,
    pipelineName: event.pipelineName,
    buildVersion: event.buildVersion,
  }));

  let result: any;

  // ── Format 1: Full payload (from ExecutionsService.runPipeline) ──────────
  if (event.executionId && event.accountId && event.parsedPipeline) {
    result = await handleFullPayload(event);
  }
  // ── Format 2: DynamoDB reference (from PipelineConfigsService) ──────────
  else if (event.customerId && event.pipelineName && event.buildVersion) {
    result = await handleDynamoDbReference(event);
  } else {
    console.error('[PIPELINE-EXECUTOR] Unrecognized payload — missing required fields');
    result = { statusCode: 400, body: 'Missing required fields. Expected either {executionId, accountId, parsedPipeline} or {customerId, pipelineName, buildVersion}' };
  }

  // Emit circuit breaker metrics summary at the end of each invocation
  logAllBreakerMetrics();

  return result;
};

/** Emit a structured metrics summary for all circuit breakers. */
function logAllBreakerMetrics(): void {
  dynamoBreaker.logMetricsSummary();
  credentialsBreaker.logMetricsSummary();
  connectorsBreaker.logMetricsSummary();
}

// ---------------------------------------------------------------------------
// Format 1 — Full payload handler (existing flow)
// ---------------------------------------------------------------------------
async function handleFullPayload(event: any) {
  try {
    const app = await getApp();
    const executionsService = app.get(ExecutionsService);

    await executionsService.executePipeline(
      event.executionId,
      event.accountId,
      {
        ...event.parsedPipeline,
        buildVersion: event.buildVersion || event.parsedPipeline?.buildVersion,
      },
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
}

// ---------------------------------------------------------------------------
// Format 2 — DynamoDB reference handler (new flow for PipelineConfigsService)
// ---------------------------------------------------------------------------
async function handleDynamoDbReference(event: any) {
  const { customerId, pipelineName, buildVersion } = event;

  try {
    const app = await getApp();
    const dynamoDbRouter = app.get(DynamoDBRouterService);
    const yamlParser = app.get(YamlParserService);
    const executionsService = app.get(ExecutionsService);
    const credentialsService = app.get(CredentialsService);
    const connectorsService = app.get(ConnectorsService);
    const environmentsService = app.get(EnvironmentsService);

    // 1. Fetch the build YAML from customer DynamoDB
    console.log(`[PIPELINE-EXECUTOR] Fetching build YAML: customer=${customerId}, pipeline=${pipelineName}, version=${buildVersion}`);

    const result: any = await dynamoBreaker.execute(() =>
      retryWithBackoff(
        () => dynamoDbRouter.get(customerId, {
          Key: {
            PK: `CUSTOMER#${customerId}`,
            SK: `PIPELINE#${pipelineName}#VERSION#${buildVersion}`,
          },
        }),
        { maxAttempts: 3, label: 'FetchBuildYAML', retryIf: isTransientAwsError },
      ),
    );

    if (!result.Item) {
      console.error(`[PIPELINE-EXECUTOR] Build YAML not found in DynamoDB: ${pipelineName} v${buildVersion}`);
      return { statusCode: 404, body: `Build YAML not found: ${pipelineName} v${buildVersion}` };
    }

    const item = result.Item;
    const yamlContent = item.yamlContent;

    if (!yamlContent) {
      console.error(`[PIPELINE-EXECUTOR] Build YAML record has no yamlContent`);
      return { statusCode: 400, body: 'Build YAML record has no yamlContent' };
    }

    // 2. Parse the YAML into a ParsedPipeline
    console.log(`[PIPELINE-EXECUTOR] Parsing build YAML (${yamlContent.length} chars)`);
    const parsedPipeline = yamlParser.parse(yamlContent);

    if (!parsedPipeline.nodes || parsedPipeline.nodes.length === 0) {
      console.error(`[PIPELINE-EXECUTOR] Parsed YAML has no executable nodes`);
      return { statusCode: 400, body: 'Parsed YAML has no executable nodes' };
    }

    console.log(`[PIPELINE-EXECUTOR] Parsed ${parsedPipeline.nodes.length} nodes with ${parsedPipeline.nodes.reduce((sum: number, n: any) => sum + n.stages.length, 0)} total stages`);

    // 3. Re-resolve real credentials from DynamoDB for each stage
    //    The YAML has 'ENCRYPTED' placeholders — we need real auth data
    const stagesState = item.stagesState || {};
    const selectedConnectors = stagesState.selectedConnectors || item.pipelineStagesState?.selectedConnectors || {};
    const selectedEnvironments = stagesState.selectedEnvironments || item.pipelineStagesState?.selectedEnvironments || {};

    console.log(`[PIPELINE-EXECUTOR] Resolving credentials for ${Object.keys(selectedConnectors).length} connectors, ${Object.keys(selectedEnvironments).length} environments`);

    await resolveCredentialsForPipeline(
      parsedPipeline,
      customerId,
      selectedConnectors,
      selectedEnvironments,
      credentialsService,
      connectorsService,
      environmentsService,
    );

    // 4. Generate an execution ID and run
    const executionId = uuidv4();
    const accountId = customerId;

    // Update build record status to RUNNING
    try {
      await dynamoDbRouter.update(customerId, {
        Key: {
          PK: `CUSTOMER#${customerId}`,
          SK: `BUILD#${pipelineName}#VERSION#${buildVersion}`,
        },
        UpdateExpression: 'SET executionStatus = :status, executionId = :execId, startedAt = :now',
        ExpressionAttributeValues: {
          ':status': 'RUNNING',
          ':execId': executionId,
          ':now': new Date().toISOString(),
        },
      });
    } catch (updateErr: any) {
      console.warn(`[PIPELINE-EXECUTOR] Failed to update build record status: ${updateErr.message}`);
    }

    // 5. Execute the pipeline
    await executionsService.executePipeline(
      executionId,
      accountId,
      {
        ...parsedPipeline,
        buildVersion,
      },
      true,   // isCustomer
      false,  // isPrivate — router will determine
      item.createdBy,        // userId
      item.createdBy,        // userEmail
      [],                    // approverEmails
      item.pipelineId,       // pipelineId
      item.buildJobId,       // buildJobId
      'main',                // branch
      pipelineName,
    );

    // 6. Update build record status to SUCCESS
    try {
      await dynamoDbRouter.update(customerId, {
        Key: {
          PK: `CUSTOMER#${customerId}`,
          SK: `BUILD#${pipelineName}#VERSION#${buildVersion}`,
        },
        UpdateExpression: 'SET executionStatus = :status, completedAt = :now',
        ExpressionAttributeValues: {
          ':status': 'SUCCESS',
          ':now': new Date().toISOString(),
        },
      });
    } catch (updateErr: any) {
      console.warn(`[PIPELINE-EXECUTOR] Failed to update build record to SUCCESS: ${updateErr.message}`);
    }

    console.log(`[PIPELINE-EXECUTOR] Execution ${executionId} completed for ${pipelineName} v${buildVersion}`);
    return { statusCode: 200, body: 'OK' };
  } catch (error: any) {
    console.error(`[PIPELINE-EXECUTOR] Fatal error for ${pipelineName} v${buildVersion}:`, error.message, error.stack);

    // Update build record status to FAILED
    try {
      const app = await getApp();
      const dynamoDbRouter = app.get(DynamoDBRouterService);
      await dynamoDbRouter.update(customerId, {
        Key: {
          PK: `CUSTOMER#${customerId}`,
          SK: `BUILD#${pipelineName}#VERSION#${buildVersion}`,
        },
        UpdateExpression: 'SET executionStatus = :status, errorMessage = :err, completedAt = :now',
        ExpressionAttributeValues: {
          ':status': 'FAILED',
          ':err': error.message,
          ':now': new Date().toISOString(),
        },
      });
    } catch (updateErr: any) {
      console.warn(`[PIPELINE-EXECUTOR] Failed to update build record to FAILED: ${updateErr.message}`);
    }

    return { statusCode: 500, body: error.message };
  }
}

// ---------------------------------------------------------------------------
// Credential Resolution for Format 2 (DynamoDB reference)
// ---------------------------------------------------------------------------

/**
 * Re-resolves real credentials/environments from DynamoDB and injects them
 * into the parsed pipeline stages. The stored YAML has 'ENCRYPTED' placeholders —
 * this function replaces them with real auth data for execution.
 */
async function resolveCredentialsForPipeline(
  pipeline: ParsedPipeline,
  accountId: string,
  selectedConnectors: Record<string, string>,
  selectedEnvironments: Record<string, string>,
  credentialsService: CredentialsService,
  connectorsService: ConnectorsService,
  environmentsService: EnvironmentsService,
): Promise<void> {
  // Pre-fetch all environments
  let environments: any[] = [];
  try {
    environments = await environmentsService.findAll(accountId);
  } catch (err: any) {
    console.warn(`[PIPELINE-EXECUTOR] Could not fetch environments: ${err.message}`);
  }

  for (const node of pipeline.nodes) {
    for (const stage of node.stages) {
      const stageType = stage.type?.toLowerCase();
      const toolType = (stage.toolConfig?.type || stage.toolId || '').toUpperCase();

      // Try all key formats: envId__stageId, envId::stageId, stageId
      const stageKeys = [
        `${node.id}__${stage.id}`,
        `${node.id}::${stage.id}`,
        stage.id,
      ];

      // Find matching connector/env ID
      let connectorId: string | undefined;
      let envId: string | undefined;

      for (const key of stageKeys) {
        if (!connectorId && selectedConnectors[key]) connectorId = selectedConnectors[key];
        if (!envId && selectedEnvironments[key]) envId = selectedEnvironments[key];
      }

      try {
        // Resolve connector → credential for plan/code stages
        if (connectorId && (stageType === 'plan' || stageType === 'code')) {
          const auth = await resolveConnectorAuth(connectorId, accountId, credentialsService, connectorsService);
          if (auth && stage.toolConfig) {
            if (stage.toolConfig.connector) {
              stage.toolConfig.connector.authentication = auth;
            } else {
              stage.toolConfig.connector = { authentication: auth };
            }
            console.log(`[PIPELINE-EXECUTOR] Resolved auth for stage ${stage.id}: ${auth.type}`);
          }
        }

        // Resolve environment for deploy stages
        if (stageType === 'deploy' && envId) {
          const envAuth = await resolveEnvironmentAuth(envId, environments, accountId, credentialsService);
          if (envAuth && stage.toolConfig) {
            if (stage.toolConfig.environment) {
              stage.toolConfig.environment.authentication = envAuth;
            } else {
              stage.toolConfig.environment = { authentication: envAuth };
            }
            console.log(`[PIPELINE-EXECUTOR] Resolved env auth for deploy stage ${stage.id}: ${envAuth.type}`);
          }
        }

        // Fallback: resolve connector for deploy stages without env auth
        if (stageType === 'deploy' && connectorId && !stage.toolConfig?.environment?.authentication) {
          const auth = await resolveConnectorAuth(connectorId, accountId, credentialsService, connectorsService);
          if (auth && stage.toolConfig) {
            if (stage.toolConfig.environment) {
              stage.toolConfig.environment.authentication = auth;
            } else {
              stage.toolConfig.environment = { authentication: auth };
            }
          }
        }
      } catch (err: any) {
        console.warn(`[PIPELINE-EXECUTOR] Credential resolution failed for stage ${stage.id}: ${err.message}`);
      }
    }
  }
}

async function resolveConnectorAuth(
  connectorId: string,
  accountId: string,
  credentialsService: CredentialsService,
  connectorsService: ConnectorsService,
): Promise<ConnectorAuth | undefined> {
  try {
    // Try as connector first
    const connector = await connectorsBreaker.execute(() =>
      retryWithBackoff(
        () => connectorsService.findOne(connectorId, accountId),
        { maxAttempts: 3, label: 'ResolveConnector', retryIf: isTransientAwsError },
      ),
    );
    if (connector?.credentialId) {
      const credential = await credentialsBreaker.execute(() =>
        retryWithBackoff(
          () => credentialsService.findOne(connector.credentialId!, accountId),
          { maxAttempts: 3, label: 'ResolveConnectorCred', retryIf: isTransientAwsError },
        ),
      );
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
    }
  } catch {
    // Try as credential ID directly
    try {
      const credential = await credentialsBreaker.execute(() =>
        retryWithBackoff(
          () => credentialsService.findOne(connectorId, accountId),
          { maxAttempts: 3, label: 'ResolveCredDirect', retryIf: isTransientAwsError },
        ),
      );
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
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function resolveEnvironmentAuth(
  envId: string,
  environments: any[],
  accountId: string,
  credentialsService: CredentialsService,
): Promise<ConnectorAuth | undefined> {
  // Find env by ID or name
  const env = environments.find(
    (e) => e.id === envId || e.name?.toLowerCase() === envId.toLowerCase(),
  );

  if (!env) return undefined;

  const deployConnector = (env.connectors || []).find(
    (c: any) => c.category === 'deploy' || c.connector === 'Cloud Foundry' || c.connector === 'SAP CPI',
  );

  if (!deployConnector) return undefined;

  // Try resolving named credential
  if (deployConnector.apiCredentialName) {
    try {
      const allCreds = await credentialsBreaker.execute(() =>
        retryWithBackoff(
          () => credentialsService.findAll(accountId),
          { maxAttempts: 3, label: 'ResolveEnvCreds', retryIf: isTransientAwsError },
        ),
      );
      const cred = allCreds.find(
        (c) => c.name?.toLowerCase() === deployConnector.apiCredentialName.toLowerCase(),
      );
      if (cred) {
        const c = cred.credentials || {};
        return {
          type: cred.authType,
          clientId: c.clientId || c.client_id || c['Client ID'],
          clientSecret: c.clientSecret || c.client_secret || c['Client Secret'],
          tokenUrl: c.tokenUrl || c.token_url || c['Token URL'],
        };
      }
    } catch {}
  }

  // Inline auth from environment connector
  if (deployConnector.oauth2ClientId && deployConnector.oauth2ClientSecret) {
    return {
      type: 'OAuth2',
      clientId: deployConnector.oauth2ClientId,
      clientSecret: deployConnector.oauth2ClientSecret,
      tokenUrl: deployConnector.oauth2TokenUrl || '',
    };
  }

  return undefined;
}
