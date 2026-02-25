import { Injectable, Logger } from '@nestjs/common';
import { ParsedStage, ToolConfig, ConnectorAuth, ArtifactDescriptor } from './yaml-parser.service';
import { CredentialsService, Credential } from '../credentials/credentials.service';

/**
 * Stage execution result
 */
export interface StageResult {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'WAITING_APPROVAL';
  message?: string;
  durationMs?: number;
  data?: Record<string, any>;
}

/**
 * Stage Handlers Service
 *
 * Dispatches stage execution to the appropriate handler by type.
 * Makes real API calls to JIRA, GitHub, and SAP CPI using credentials
 * from DynamoDB (via CredentialsService) or embedded YAML authentication.
 */
@Injectable()
export class StageHandlersService {
  private readonly logger = new Logger(StageHandlersService.name);

  constructor(private readonly credentialsService: CredentialsService) {}

  async executeStage(
    executionId: string,
    nodeId: string,
    stage: ParsedStage,
    approverEmails?: string[],
    accountId?: string,
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
      // Resolve credentials: YAML-embedded auth or DynamoDB credential
      const resolvedAuth = await this.resolveAuth(stage, accountId);

      switch (stage.type.toLowerCase()) {
        case 'plan':
          await this.handlePlan(executionId, nodeId, stage, resolvedAuth);
          break;
        case 'code':
          await this.handleCode(executionId, nodeId, stage, resolvedAuth);
          break;
        case 'build':
          await this.handleBuild(executionId, nodeId, stage, resolvedAuth);
          break;
        case 'deploy':
          await this.handleDeploy(executionId, nodeId, stage, resolvedAuth);
          break;
        case 'release':
          await this.handleRelease(executionId, nodeId, stage, resolvedAuth);
          break;
        case 'test':
          await this.handleTest(executionId, nodeId, stage, resolvedAuth);
          break;
        case 'approval':
          if (!approverEmails || approverEmails.length === 0) {
            console.log(`${prefix}[STAGE:${stage.id}] SKIPPED — no approvers configured`);
            return { status: 'SKIPPED', message: 'No approvers configured — skipping approval' };
          }
          console.log(`${prefix}[STAGE:${stage.id}] WAITING_APPROVAL — manual approval required from: ${approverEmails.join(', ')}`);
          return { status: 'WAITING_APPROVAL', message: 'Awaiting manual approval' };
        default:
          await this.handleGeneric(executionId, nodeId, stage, resolvedAuth);
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

  // ---------------------------------------------------------------------------
  // Credential Resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolves authentication for a stage:
   * 1. If toolConfig has embedded connector.authentication → use it directly
   * 2. If stage has credentialId → fetch from DynamoDB via CredentialsService
   * 3. Otherwise → null (stage has no auth, may still work for no-tool stages)
   */
  private async resolveAuth(
    stage: ParsedStage,
    accountId?: string,
  ): Promise<{ auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null }> {
    const toolConfig = stage.toolConfig || null;

    // 1. YAML-embedded auth (Python-style YAML)
    const embeddedAuth =
      toolConfig?.connector?.authentication ||
      toolConfig?.environment?.authentication ||
      null;

    if (embeddedAuth) {
      this.logger.log(`[STAGE:${stage.id}] Using embedded YAML authentication (${embeddedAuth.type})`);
      return { auth: embeddedAuth, credential: null, toolConfig };
    }

    // 2. DynamoDB credential (canvas pipeline with selectedConnectors)
    if (stage.credentialId) {
      try {
        const credential = await this.credentialsService.findOne(stage.credentialId, accountId);
        this.logger.log(`[STAGE:${stage.id}] Using DynamoDB credential: ${credential.name} (${credential.authType})`);

        // Map credential fields to ConnectorAuth
        const creds = credential.credentials || {};
        const auth: ConnectorAuth = {
          type: credential.authType,
          username: creds.username || creds.Username || creds.email,
          apiKey: creds.apiToken || creds.api_token || creds['API Key'] || creds.apiKey,
          token: creds.token || creds['Personal Access Token'] || creds.pat,
          clientId: creds.clientId || creds.client_id || creds['Client ID'],
          clientSecret: creds.clientSecret || creds.client_secret || creds['Client Secret'],
          tokenUrl: creds.tokenUrl || creds.token_url || creds['Token URL'],
        };

        return { auth, credential, toolConfig };
      } catch (err) {
        this.logger.warn(`[STAGE:${stage.id}] Credential ${stage.credentialId} not found: ${err.message}`);
      }
    }

    // 3. No auth
    return { auth: null, credential: null, toolConfig };
  }

  // ---------------------------------------------------------------------------
  // JIRA Handler (Plan stage)
  // ---------------------------------------------------------------------------

  private async handlePlan(
    _execId: string,
    _nodeId: string,
    stage: ParsedStage,
    resolved: { auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null },
  ): Promise<void> {
    const { auth, toolConfig, credential } = resolved;
    const toolType = (toolConfig?.type || stage.toolId || '').toUpperCase();

    if (toolType === 'JIRA' && auth) {
      const jiraKey = toolConfig?.inputs?.jiraKey;
      const jiraUrl = toolConfig?.connector?.url || credential?.credentials?.url || '';

      if (!jiraUrl) throw new Error('JIRA URL not configured');

      console.log(`  → JIRA: Validating issue ${jiraKey || '(no key)'} at ${jiraUrl}`);

      const headers = this.buildJiraHeaders(auth);
      const endpoint = jiraKey
        ? `${this.normalizeUrl(jiraUrl)}/rest/api/3/issue/${jiraKey}`
        : `${this.normalizeUrl(jiraUrl)}/rest/api/3/myself`;

      const res = await this.httpFetch(endpoint, { headers });
      const data = await res.json();

      if (jiraKey) {
        const summary = data.fields?.summary || 'N/A';
        const status = data.fields?.status?.name || 'N/A';
        const issueType = data.fields?.issuetype?.name || 'N/A';
        console.log(`  → JIRA: Issue ${data.key} | Type: ${issueType} | Status: ${status} | Summary: ${summary}`);
      } else {
        console.log(`  → JIRA: Authenticated as ${data.displayName} (${data.emailAddress})`);
      }
    } else {
      console.log(`  → Plan handler: No JIRA tool configured, skipping API call for ${stage.name}`);
    }
  }

  // ---------------------------------------------------------------------------
  // GitHub Handler (Code stage)
  // ---------------------------------------------------------------------------

  private async handleCode(
    _execId: string,
    _nodeId: string,
    stage: ParsedStage,
    resolved: { auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null },
  ): Promise<void> {
    const { auth, toolConfig, credential } = resolved;
    const toolType = (toolConfig?.type || stage.toolId || '').toUpperCase();

    if (toolType === 'GITHUB' && auth) {
      const token = auth.token || auth.apiKey;
      if (!token) throw new Error('GitHub token not configured');

      const repoUrl = toolConfig?.connector?.repoUrl || credential?.credentials?.url || '';
      const branch = toolConfig?.connector?.branch || 'main';

      // Extract owner/repo from URL
      const repoPath = repoUrl
        .replace('https://github.com/', '')
        .replace('.git', '')
        .replace(/\/$/, '');

      console.log(`  → GitHub: Verifying repository ${repoPath} (branch: ${branch})`);

      // Verify repo access
      const res = await this.httpFetch(`https://api.github.com/repos/${repoPath}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      const data = await res.json();

      console.log(`  → GitHub: Repository ${data.full_name} — ${data.default_branch} branch`);
      console.log(`  → GitHub: Visibility: ${data.private ? 'private' : 'public'}, Size: ${data.size}KB`);

      // Verify branch
      const branchRes = await this.httpFetch(`https://api.github.com/repos/${repoPath}/branches/${branch}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      const branchData = await branchRes.json();

      console.log(`  → GitHub: Branch ${branch} — HEAD at ${branchData.commit?.sha?.substring(0, 8)}`);
    } else {
      console.log(`  → Code handler: No GitHub tool configured for ${stage.name}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Build Handler
  // ---------------------------------------------------------------------------

  private async handleBuild(
    _execId: string,
    _nodeId: string,
    stage: ParsedStage,
    _resolved: { auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null },
  ): Promise<void> {
    // Build stages typically don't have external connectors
    // They can be extended for Jenkins, Azure Pipelines, etc.
    console.log(`  → Build handler: Processing ${stage.name}`);
    console.log(`  → Build: Stage completed (no external tool configured)`);
  }

  // ---------------------------------------------------------------------------
  // Deploy Handler (SAP CPI)
  // ---------------------------------------------------------------------------

  private async handleDeploy(
    execId: string,
    _nodeId: string,
    stage: ParsedStage,
    resolved: { auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null },
  ): Promise<void> {
    const { auth, toolConfig, credential } = resolved;
    const toolType = (toolConfig?.type || stage.toolId || '').toUpperCase();

    if ((toolType === 'SAP_CPI' || toolType === 'SAP_CLOUD_INTEGRATION') && auth) {
      const apiUrl = toolConfig?.environment?.apiUrl || toolConfig?.connector?.url || credential?.credentials?.url || '';
      if (!apiUrl) throw new Error('SAP CPI API URL not configured');

      // Resolve auth (may come from environment or connector)
      const cpiAuth = toolConfig?.environment?.authentication || auth;

      console.log(`  → SAP CPI: Connecting to ${apiUrl}`);

      // Get OAuth token
      const token = await this.getSapCpiToken(cpiAuth);
      console.log(`  → SAP CPI: OAuth token acquired`);

      // Process artifacts
      const artifacts = toolConfig?.artifacts || [];
      if (artifacts.length === 0) {
        console.log(`  → SAP CPI: No artifacts configured, verifying connectivity`);
        const res = await this.httpFetch(
          `${this.normalizeUrl(apiUrl)}/api/v1/IntegrationDesigntimeArtifacts`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
        );
        await res.json();
        console.log(`  → SAP CPI: Connection verified`);
      } else {
        for (const artifact of artifacts) {
          await this.downloadCpiArtifact(apiUrl, token, artifact, execId, stage);
        }
      }
    } else {
      console.log(`  → Deploy handler: No SAP CPI tool configured for ${stage.name}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Release Handler
  // ---------------------------------------------------------------------------

  private async handleRelease(
    _execId: string,
    _nodeId: string,
    stage: ParsedStage,
    _resolved: { auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null },
  ): Promise<void> {
    // ServiceNow integration can be wired here
    console.log(`  → Release handler: Processing ${stage.name}`);
    console.log(`  → Release: Stage completed (no external tool configured)`);
  }

  // ---------------------------------------------------------------------------
  // Test Handler
  // ---------------------------------------------------------------------------

  private async handleTest(
    _execId: string,
    _nodeId: string,
    stage: ParsedStage,
    _resolved: { auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null },
  ): Promise<void> {
    console.log(`  → Test handler: Processing ${stage.name}`);
    console.log(`  → Test: Stage completed (no external tool configured)`);
  }

  // ---------------------------------------------------------------------------
  // Generic Handler
  // ---------------------------------------------------------------------------

  private async handleGeneric(
    _execId: string,
    _nodeId: string,
    stage: ParsedStage,
    _resolved: { auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null },
  ): Promise<void> {
    console.log(`  → Generic handler: Processing ${stage.name} (type: ${stage.type})`);
    console.log(`  → Generic: Stage completed`);
  }

  // ---------------------------------------------------------------------------
  // JIRA Auth Helpers
  // ---------------------------------------------------------------------------

  private buildJiraHeaders(auth: ConnectorAuth): Record<string, string> {
    if (auth.token) {
      // PAT-based (Jira Data Center)
      return { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' };
    }

    const username = auth.username;
    const apiKey = auth.apiKey || auth.token;

    if (username && apiKey) {
      const base64 = Buffer.from(`${username}:${apiKey}`).toString('base64');
      return { Authorization: `Basic ${base64}`, Accept: 'application/json' };
    }

    throw new Error('JIRA credentials missing: provide username + apiKey or a Personal Access Token');
  }

  // ---------------------------------------------------------------------------
  // SAP CPI Helpers
  // ---------------------------------------------------------------------------

  private async getSapCpiToken(auth: ConnectorAuth): Promise<string> {
    const { clientId, clientSecret, tokenUrl } = auth;

    if (!tokenUrl || !clientId || !clientSecret) {
      throw new Error('SAP CPI OAuth credentials missing (clientId, clientSecret, tokenUrl)');
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await this.httpFetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json();
    if (!data.access_token) {
      throw new Error(`SAP CPI token response missing access_token: ${JSON.stringify(data)}`);
    }

    return data.access_token;
  }

  private static readonly ARTIFACT_API_MAP: Record<string, string> = {
    IntegrationFlow: 'IntegrationDesigntimeArtifacts',
    ValueMapping: 'ValueMappingDesigntimeArtifacts',
    MessageMapping: 'MessageMappingDesigntimeArtifacts',
    ScriptCollection: 'ScriptCollectionDesigntimeArtifacts',
    GroovyScript: 'ScriptCollectionDesigntimeArtifacts',
    MessageResource: 'MessageResourcesDesigntimeArtifacts',
  };

  private async downloadCpiArtifact(
    apiUrl: string,
    token: string,
    artifact: ArtifactDescriptor,
    executionId: string,
    stage: ParsedStage,
  ): Promise<Buffer> {
    const collection = StageHandlersService.ARTIFACT_API_MAP[artifact.type];
    if (!collection) {
      throw new Error(`Unsupported CPI artifact type: ${artifact.type}`);
    }

    const url = `${this.normalizeUrl(apiUrl)}/api/v1/${collection}(Id='${artifact.name}',Version='active')/$value`;

    console.log(`  → SAP CPI: Downloading ${artifact.type}/${artifact.name}`);

    const res = await this.httpFetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/zip' },
    });

    // Get the response as a buffer
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`  → SAP CPI: Downloaded ${artifact.name} (${buffer.length} bytes)`);

    return buffer;
  }

  // ---------------------------------------------------------------------------
  // HTTP Helpers
  // ---------------------------------------------------------------------------

  private normalizeUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  /**
   * Fetch with timeout and error handling
   */
  private async httpFetch(
    url: string,
    init?: RequestInit & { timeout?: number },
  ): Promise<Response> {
    const timeout = init?.timeout || 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorBody = '';
        try {
          errorBody = await res.text();
        } catch {
          // ignore
        }
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${errorBody.substring(0, 500)}`);
      }

      return res;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
