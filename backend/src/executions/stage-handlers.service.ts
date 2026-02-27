import { Injectable, Logger } from '@nestjs/common';
import { ParsedStage, ToolConfig, ConnectorAuth, ArtifactDescriptor } from './yaml-parser.service';
import { CredentialsService, Credential } from '../credentials/credentials.service';

/**
 * Cross-stage execution context — accumulated as the pipeline runs.
 * Allows later stages (e.g. Deploy) to reuse config from earlier stages (e.g. Code/GitHub).
 */
export interface ExecutionContext {
  /** GitHub configuration captured from the Code stage */
  githubConfig?: {
    repo: string;       // owner/repo
    branch: string;
    token: string;
    basePath: string;    // e.g. "pipelines"
  };
  /** Pipeline metadata */
  pipelineName?: string;
  buildVersion?: string;
  /** Current node name for path construction */
  currentNodeName?: string;
  /** Accumulated log lines for real-time streaming */
  logs: string[];
}

/**
 * Stage execution result
 */
export interface StageResult {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'WAITING_APPROVAL';
  message?: string;
  durationMs?: number;
  data?: Record<string, any>;
  /** Log lines generated during this stage */
  logLines?: string[];
}

/**
 * Stage Handlers Service
 *
 * Dispatches stage execution to the appropriate handler by type.
 * Makes real API calls to JIRA, GitHub, and SAP CPI using credentials
 * from DynamoDB (via CredentialsService) or embedded YAML authentication.
 *
 * Cross-stage context sharing: GitHub config from Code stage is stored
 * in the ExecutionContext and reused by the Deploy stage for artifact uploads.
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
    context?: ExecutionContext,
  ): Promise<StageResult> {
    const prefix = `[EXECUTION:${executionId}][NODE:${nodeId}]`;
    const logLines: string[] = [];
    const log = (msg: string) => {
      console.log(msg);
      logLines.push(msg);
      if (context) context.logs.push(msg);
    };

    log(`${prefix}[STAGE:${stage.id}][TYPE:${stage.type}] STARTED`);

    // Skip disabled stages
    if (!stage.executionEnabled) {
      log(`${prefix}[STAGE:${stage.id}] SKIPPED — execution.enabled=false`);
      return { status: 'SKIPPED', message: 'Execution disabled', logLines };
    }

    // Skip stages with unselected tools
    if (stage.toolId && !stage.toolSelected) {
      log(`${prefix}[STAGE:${stage.id}] SKIPPED — tool.selected=false`);
      return { status: 'SKIPPED', message: 'Tool not selected', logLines };
    }

    if (stage.toolId) {
      log(`${prefix}[STAGE:${stage.id}] Running tool: ${stage.toolId}`);
    }

    const start = Date.now();

    try {
      // Resolve credentials: YAML-embedded auth or DynamoDB credential
      const resolvedAuth = await this.resolveAuth(stage, accountId);

      switch (stage.type.toLowerCase()) {
        case 'plan':
          await this.handlePlan(executionId, nodeId, stage, resolvedAuth, log);
          break;
        case 'code':
          await this.handleCode(executionId, nodeId, stage, resolvedAuth, log, context);
          break;
        case 'build':
          await this.handleBuild(executionId, nodeId, stage, resolvedAuth, log);
          break;
        case 'deploy':
          await this.handleDeploy(executionId, nodeId, stage, resolvedAuth, log, context);
          break;
        case 'release':
          await this.handleRelease(executionId, nodeId, stage, resolvedAuth, log);
          break;
        case 'test':
          await this.handleTest(executionId, nodeId, stage, resolvedAuth, log);
          break;
        case 'approval':
          if (!approverEmails || approverEmails.length === 0) {
            log(`${prefix}[STAGE:${stage.id}] SKIPPED — no approvers configured`);
            return { status: 'SKIPPED', message: 'No approvers configured — skipping approval', logLines };
          }
          log(`${prefix}[STAGE:${stage.id}] WAITING_APPROVAL — manual approval required from: ${approverEmails.join(', ')}`);
          return { status: 'WAITING_APPROVAL', message: 'Awaiting manual approval', logLines };
        default:
          await this.handleGeneric(executionId, nodeId, stage, resolvedAuth, log);
      }

      const durationMs = Date.now() - start;
      log(`${prefix}[STAGE:${stage.id}] SUCCESS (${durationMs}ms)`);
      return { status: 'SUCCESS', durationMs, logLines };
    } catch (error) {
      const durationMs = Date.now() - start;
      log(`${prefix}[STAGE:${stage.id}] FAILED: ${error.message}`);
      return { status: 'FAILED', message: error.message, durationMs, logLines };
    }
  }

  // ---------------------------------------------------------------------------
  // Credential Resolution
  // ---------------------------------------------------------------------------

  private async resolveAuth(
    stage: ParsedStage,
    accountId?: string,
  ): Promise<{ auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null }> {
    const toolConfig = stage.toolConfig || null;

    // 1. YAML-embedded auth
    const embeddedAuth =
      toolConfig?.connector?.authentication ||
      toolConfig?.environment?.authentication ||
      null;

    if (embeddedAuth) {
      this.logger.log(`[STAGE:${stage.id}] Using embedded YAML authentication (${embeddedAuth.type})`);
      return { auth: embeddedAuth, credential: null, toolConfig };
    }

    // 2. DynamoDB credential
    if (stage.credentialId) {
      try {
        const credential = await this.credentialsService.findOne(stage.credentialId, accountId);
        this.logger.log(`[STAGE:${stage.id}] Using DynamoDB credential: ${credential.name} (${credential.authType})`);

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
    log: (msg: string) => void,
  ): Promise<void> {
    const { auth, toolConfig, credential } = resolved;
    const toolType = (toolConfig?.type || stage.toolId || '').toUpperCase();

    if (toolType === 'JIRA' && auth) {
      const jiraKey = toolConfig?.inputs?.jiraKey;
      const jiraUrl = toolConfig?.connector?.url || credential?.credentials?.url || '';

      if (!jiraUrl) throw new Error('JIRA URL not configured');

      log(`  🔎 JIRA: Validating issue ${jiraKey || '(no key)'} at ${jiraUrl}`);

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
        log(`  ✅ JIRA: Issue ${data.key} | Type: ${issueType} | Status: ${status} | Summary: ${summary}`);
      } else {
        log(`  ✅ JIRA: Authenticated as ${data.displayName} (${data.emailAddress})`);
      }
    } else {
      log(`  ⏭ Plan handler: No JIRA tool configured, skipping API call for ${stage.name}`);
    }
  }

  // ---------------------------------------------------------------------------
  // GitHub Handler (Code stage) — stores config in ExecutionContext
  // ---------------------------------------------------------------------------

  private async handleCode(
    _execId: string,
    _nodeId: string,
    stage: ParsedStage,
    resolved: { auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null },
    log: (msg: string) => void,
    context?: ExecutionContext,
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

      log(`  🔍 GitHub: Verifying repository ${repoPath} (branch: ${branch})`);

      // Verify repo access
      const res = await this.httpFetch(`https://api.github.com/repos/${repoPath}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      const data = await res.json();

      log(`  ✅ GitHub: Repository ${data.full_name} — ${data.default_branch} branch`);
      log(`  📊 GitHub: Visibility: ${data.private ? 'private' : 'public'}, Size: ${data.size}KB`);

      // Verify branch
      const branchRes = await this.httpFetch(`https://api.github.com/repos/${repoPath}/branches/${branch}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      const branchData = await branchRes.json();

      log(`  ✅ GitHub: Branch ${branch} — HEAD at ${branchData.commit?.sha?.substring(0, 8)}`);

      // Store GitHub config in execution context for Deploy stage
      if (context) {
        context.githubConfig = {
          repo: repoPath,
          branch,
          token,
          basePath: 'pipelines',
        };
        log(`  ✅ GitHub stage ready: ${repoPath} | branch: ${branch}`);
      }
    } else {
      log(`  ⏭ Code handler: No GitHub tool configured for ${stage.name}`);
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
    log: (msg: string) => void,
  ): Promise<void> {
    log(`  🔨 Build handler: Processing ${stage.name}`);
    log(`  ✅ Build: Stage completed (no external tool configured)`);
  }

  // ---------------------------------------------------------------------------
  // Deploy Handler (SAP CPI) — downloads artifacts & uploads to GitHub
  // ---------------------------------------------------------------------------

  private async handleDeploy(
    execId: string,
    _nodeId: string,
    stage: ParsedStage,
    resolved: { auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null },
    log: (msg: string) => void,
    context?: ExecutionContext,
  ): Promise<void> {
    const { auth, toolConfig, credential } = resolved;
    const toolType = (toolConfig?.type || stage.toolId || '').toUpperCase();

    if ((toolType === 'SAP_CPI' || toolType === 'SAP_CLOUD_INTEGRATION' || toolType === 'CLOUD_FOUNDRY') && auth) {
      const apiUrl = toolConfig?.environment?.apiUrl || toolConfig?.connector?.url || credential?.credentials?.url || '';
      if (!apiUrl) throw new Error('SAP CPI API URL not configured');

      const cpiAuth = toolConfig?.environment?.authentication || auth;

      log(`  🔗 SAP CPI: Connecting to ${apiUrl}`);

      // Get OAuth token
      const token = await this.getSapCpiToken(cpiAuth);
      log(`  🔑 SAP CPI: OAuth token acquired`);

      // Resolve GitHub config — either from context (Code stage) or from YAML
      let githubConfig = context?.githubConfig;
      if (!githubConfig) {
        log(`  ⚠️  No GitHub config from Code stage, skipping artifact upload to GitHub`);
      }

      // Process artifacts
      const artifacts = toolConfig?.artifacts || [];
      if (artifacts.length === 0) {
        log(`  📦 SAP CPI: No artifacts configured, verifying connectivity`);
        const res = await this.httpFetch(
          `${this.normalizeUrl(apiUrl)}/api/v1/IntegrationDesigntimeArtifacts`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
        );
        await res.json();
        log(`  ✅ SAP CPI: Connection verified`);
      } else {
        const pipelineName = context?.pipelineName || 'pipeline';
        const buildVersion = context?.buildVersion || '1.0.0';
        const nodeName = context?.currentNodeName || 'Development';
        const stageName = stage.name || 'Deploy';

        for (const artifact of artifacts) {
          // Step 1: Download artifact from SAP CPI
          const binary = await this.downloadCpiArtifact(apiUrl, token, artifact, execId, stage, log);

          // Step 2: Upload to GitHub if config is available
          if (githubConfig && binary) {
            const encoded = Buffer.from(binary).toString('base64');
            log(`  📊 Binary size: ${binary.length} bytes, Base64 length: ${encoded.length} chars`);

            const ghPath =
              `${githubConfig.basePath}/` +
              `${pipelineName}/builds/${buildVersion}/` +
              `${nodeName}/${stageName}/` +
              `${artifact.type}/${artifact.name}.zip`;

            await this.uploadToGitHub(
              githubConfig.repo,
              ghPath,
              encoded,
              githubConfig.token,
              githubConfig.branch,
              log,
            );

            // Step 3: Download from GitHub and deploy to Cloud Foundry
            log(`  🚀 CF Deploy: Downloading artifact from GitHub for CF deployment`);
            const ghBinary = await this.downloadFromGitHub(
              githubConfig.repo,
              ghPath,
              githubConfig.token,
              githubConfig.branch,
              log,
            );

            await this.deployToCloudFoundry(apiUrl, token, artifact, ghBinary, log);
          } else if (binary) {
            // No GitHub config — deploy directly from CPI binary
            log(`  🚀 CF Deploy: Deploying artifact directly (no GitHub stage)`);
            await this.deployToCloudFoundry(apiUrl, token, artifact, binary, log);
          }
        }
      }
    } else {
      log(`  ⏭ Deploy handler: No SAP CPI tool configured for ${stage.name}`);
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
    log: (msg: string) => void,
  ): Promise<void> {
    log(`  🚀 Release handler: Processing ${stage.name}`);
    log(`  ✅ Release: Stage completed (no external tool configured)`);
  }

  // ---------------------------------------------------------------------------
  // Test Handler
  // ---------------------------------------------------------------------------

  private async handleTest(
    _execId: string,
    _nodeId: string,
    stage: ParsedStage,
    _resolved: { auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null },
    log: (msg: string) => void,
  ): Promise<void> {
    log(`  🧪 Test handler: Processing ${stage.name}`);
    log(`  ✅ Test: Stage completed (no external tool configured)`);
  }

  // ---------------------------------------------------------------------------
  // Generic Handler
  // ---------------------------------------------------------------------------

  private async handleGeneric(
    _execId: string,
    _nodeId: string,
    stage: ParsedStage,
    _resolved: { auth: ConnectorAuth | null; credential: Credential | null; toolConfig: ToolConfig | null },
    log: (msg: string) => void,
  ): Promise<void> {
    log(`  ⚙️ Generic handler: Processing ${stage.name} (type: ${stage.type})`);
    log(`  ✅ Generic: Stage completed`);
  }

  // ---------------------------------------------------------------------------
  // GitHub Upload
  // ---------------------------------------------------------------------------

  private async uploadToGitHub(
    repoName: string,
    path: string,
    base64Content: string,
    token: string,
    branch: string,
    log: (msg: string) => void,
  ): Promise<void> {
    const apiUrl = `https://api.github.com/repos/${repoName}/contents/${path}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };

    log(`  📤 GitHub: Uploading to ${path}`);

    // Check if file exists to get SHA for update
    let sha: string | undefined;
    try {
      const existRes = await this.httpFetch(`${apiUrl}?ref=${branch}`, { headers });
      const existData = await existRes.json();
      sha = existData.sha;
      log(`  📝 GitHub: File exists (SHA: ${sha?.substring(0, 8)}...), will update`);
    } catch {
      log(`  📄 GitHub: Creating new file`);
    }

    // Upload/update file
    const payload: any = {
      message: sha
        ? `Update artifact ${path}`
        : `Upload artifact ${path}`,
      content: base64Content,
      branch,
    };
    if (sha) payload.sha = sha;

    const res = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new Error(`GitHub upload failed: HTTP ${res.status} ${res.statusText}: ${errorBody.substring(0, 500)}`);
    }

    const responseData = await res.json();
    const commitSha = responseData.commit?.sha?.substring(0, 8) || 'N/A';
    const fileSha = responseData.content?.sha?.substring(0, 8) || 'N/A';

    log(`  ✅ GitHub: ${sha ? 'Updated' : 'Created'}: ${path}`);
    log(`     Commit SHA: ${commitSha}...`);
    log(`     File SHA: ${fileSha}...`);

    // Verify uploaded file is valid ZIP
    try {
      await this.verifyGitHubUpload(repoName, path, token, branch, log);
    } catch (verifyErr) {
      log(`  ⚠️ GitHub: Verification warning: ${verifyErr.message}`);
    }
  }

  private async verifyGitHubUpload(
    repoName: string,
    path: string,
    token: string,
    branch: string,
    log: (msg: string) => void,
  ): Promise<void> {
    // Wait briefly for GitHub to process
    await new Promise((r) => setTimeout(r, 1000));

    const apiUrl = `https://api.github.com/repos/${repoName}/contents/${path}?ref=${branch}`;
    const res = await this.httpFetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    const fileData = await res.json();
    const storedEncoding = fileData.encoding || 'unknown';
    const storedSize = fileData.size || 0;

    log(`  📋 GitHub: File info — encoding=${storedEncoding}, size=${storedSize} bytes`);

    if (storedEncoding === 'base64' && fileData.content) {
      const contentStr = fileData.content.replace(/\n/g, '').trim();
      const binaryContent = Buffer.from(contentStr, 'base64');
      log(`  ✅ GitHub: Decoded binary — ${binaryContent.length} bytes`);

      // Verify ZIP signature (PK header)
      if (binaryContent.length >= 4 && binaryContent[0] === 0x50 && binaryContent[1] === 0x4B) {
        log(`  ✅ GitHub: ZIP file signature verified (PK header)`);
      } else {
        log(`  ⚠️ GitHub: File does not have ZIP signature — first bytes: ${binaryContent.subarray(0, 4).toString('hex')}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // JIRA Auth Helpers
  // ---------------------------------------------------------------------------

  private buildJiraHeaders(auth: ConnectorAuth): Record<string, string> {
    if (auth.token) {
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
    log: (msg: string) => void,
  ): Promise<Buffer> {
    const collection = StageHandlersService.ARTIFACT_API_MAP[artifact.type];
    if (!collection) {
      throw new Error(`Unsupported CPI artifact type: ${artifact.type}`);
    }

    const url = `${this.normalizeUrl(apiUrl)}/api/v1/${collection}(Id='${artifact.name}',Version='active')/$value`;

    log(`  📥 SAP CPI: Downloading ${artifact.type}/${artifact.name}`);

    const res = await this.httpFetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/zip' },
    });

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    log(`  ✅ SAP CPI: Downloaded ${artifact.name} (${buffer.length} bytes)`);

    return buffer;
  }

  // ---------------------------------------------------------------------------
  // GitHub Download (for CF deploy)
  // ---------------------------------------------------------------------------

  private async downloadFromGitHub(
    repoName: string,
    path: string,
    token: string,
    branch: string,
    log: (msg: string) => void,
  ): Promise<Buffer> {
    const apiUrl = `https://api.github.com/repos/${repoName}/contents/${path}?ref=${branch}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    };

    log(`  📥 GitHub: Downloading ${path} for CF deployment`);

    const res = await this.httpFetch(apiUrl, { headers });
    const fileData = await res.json();

    if (fileData.encoding !== 'base64' || !fileData.content) {
      throw new Error(`GitHub file ${path} has unexpected encoding: ${fileData.encoding}`);
    }

    const contentStr = fileData.content.replace(/\n/g, '').replace(/\r/g, '').trim();
    const binary = Buffer.from(contentStr, 'base64');

    log(`  ✅ GitHub: Downloaded ${binary.length} bytes from ${path}`);

    if (binary.length >= 2 && binary[0] === 0x50 && binary[1] === 0x4B) {
      log(`  ✅ GitHub: ZIP signature verified`);
    } else {
      log(`  ⚠️ GitHub: File may not be a valid ZIP (header: ${binary.subarray(0, 4).toString('hex')})`);
    }

    return binary;
  }

  // ---------------------------------------------------------------------------
  // Pre-deploy validation
  // ---------------------------------------------------------------------------

  /**
   * Validates that the artifact exists in CPI design-time before attempting
   * upload & deploy.  Catches typos, wrong package/artifact combos, and
   * unsupported types early — before wasting time on upload + poll cycles.
   */
  private async validateArtifactExists(
    baseUrl: string,
    token: string,
    artifact: ArtifactDescriptor,
    collection: string,
    log: (msg: string) => void,
  ): Promise<void> {
    const metadataUrl = `${baseUrl}/api/v1/${collection}(Id='${artifact.name}',Version='active')`;
    log(`  🔍 CF Pre-Check: Validating artifact metadata at ${metadataUrl}`);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(metadataUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      const body = await res.text().catch(() => '');

      if (res.status === 404) {
        log(`  ⚠️ CF Pre-Check: Artifact '${artifact.name}' (type: ${artifact.type}) not found in design-time (HTTP 404)`);
        log(`  📋 CF Pre-Check: This means the artifact ID is wrong, the package doesn't contain this artifact, or it hasn't been created yet`);
        log(`  📋 CF Pre-Check: Collection queried: ${collection}, response: ${body.substring(0, 500)}`);
        // Don't throw — let the upload step handle creation via POST fallback
        return;
      }

      if (!res.ok) {
        log(`  ⚠️ CF Pre-Check: Unexpected HTTP ${res.status} from metadata endpoint — ${body.substring(0, 500)}`);
        log(`  📋 CF Pre-Check: Proceeding with deploy anyway (validation non-blocking for non-404 errors)`);
        return;
      }

      // Parse and validate metadata
      const parsed = this.parseJsonSafely(body);
      const d = parsed?.d || parsed;
      const artifactId = d?.Id || d?.id || '';
      const artifactName = d?.Name || d?.name || '';
      const version = d?.Version || d?.version || '';
      const packageId = d?.PackageId || d?.packageId || '';
      const artifactType = d?.Type || d?.type || artifact.type;

      log(`  ✅ CF Pre-Check: Artifact validated — Id: ${artifactId}, Name: ${artifactName}, Version: ${version}, Package: ${packageId || 'N/A'}, Type: ${artifactType}`);

      // Warn on type mismatch
      if (artifactType && artifact.type && artifactType.toLowerCase() !== artifact.type.toLowerCase()) {
        log(`  ⚠️ CF Pre-Check: Type mismatch — YAML says '${artifact.type}' but CPI reports '${artifactType}'. Deploy may fail.`);
      }

      // Warn if packageId is present and differs from what we expect
      if (artifact.packageId && packageId && packageId !== artifact.packageId) {
        log(`  ⚠️ CF Pre-Check: Package mismatch — expected '${artifact.packageId}' but CPI reports '${packageId}'. Verify artifact belongs to the correct package.`);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        log(`  ⚠️ CF Pre-Check: Metadata request timed out after 20s — proceeding with deploy`);
      } else {
        log(`  ⚠️ CF Pre-Check: Validation failed (${err.message}) — proceeding with deploy anyway`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cloud Foundry / SAP CPI Deployment
  // ---------------------------------------------------------------------------

  private async deployToCloudFoundry(
    apiUrl: string,
    token: string,
    artifact: ArtifactDescriptor,
    binary: Buffer,
    log: (msg: string) => void,
  ): Promise<void> {
    const baseUrl = this.normalizeUrl(apiUrl);
    const collection = StageHandlersService.ARTIFACT_API_MAP[artifact.type];
    if (!collection) {
      throw new Error(`Unsupported artifact type for CF deploy: ${artifact.type}`);
    }

    log(`  🚀 CF Deploy: Deploying ${artifact.type}/${artifact.name} to ${baseUrl}`);

    // Step 0: Pre-deploy validation — verify artifact exists in design-time
    await this.validateArtifactExists(baseUrl, token, artifact, collection, log);

    // Step 1: Try to update existing artifact via PUT with base64 JSON body
    const entityUrl = `${baseUrl}/api/v1/${collection}(Id='${artifact.name}',Version='active')`;
    const updatePayload = JSON.stringify({
      Name: artifact.name,
      ArtifactContent: binary.toString('base64'),
    });
    log(`  📤 CF Deploy: Uploading artifact content to design-time API`);
    log(`  📋 CF Upload: PUT ${entityUrl}`);
    log(`  📋 CF Upload: Content-Type: application/json, payload size: ${updatePayload.length} bytes`);

    const uploadHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    log(`  📋 CF Upload: Request headers: ${JSON.stringify({ ...uploadHeaders, Authorization: 'Bearer ***' })}`);

    const uploadRes = await this.fetchWithRetry(entityUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: updatePayload,
    }, log, 'CF Upload');

    const uploadResBody = await uploadRes.text().catch(() => '');
    log(`  📋 CF Upload: Response ${uploadRes.status} ${uploadRes.statusText} — body: ${uploadResBody.substring(0, 1500)}`);

    if (!uploadRes.ok) {
      if (uploadRes.status === 404) {
        log(`  ⚠️ CF Deploy: Artifact not found, attempting to create via POST`);
        const createUrl = `${baseUrl}/api/v1/${collection}`;
        const createPayload = JSON.stringify({
          Id: artifact.name,
          Name: artifact.name,
          Version: 'active',
          ArtifactContent: binary.toString('base64'),
        });
        const createHeaders = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        };

        log(`  📋 CF Create: POST ${createUrl}`);
        log(`  📋 CF Create: Request headers: ${JSON.stringify({ ...createHeaders, Authorization: 'Bearer ***' })}`);

        const createRes = await this.fetchWithRetry(createUrl, {
          method: 'POST',
          headers: createHeaders,
          body: createPayload,
        }, log, 'CF Create');

        const createResBody = await createRes.text().catch(() => '');
        log(`  📋 CF Create: Response ${createRes.status} ${createRes.statusText} — body: ${createResBody.substring(0, 1500)}`);

        if (!createRes.ok) {
          throw new Error(`CF Deploy: Failed to create artifact ${artifact.name}: HTTP ${createRes.status} — ${createResBody.substring(0, 500)}`);
        }

        log(`  ✅ CF Deploy: Artifact created successfully`);
      } else {
        throw new Error(`CF Deploy: Failed to upload artifact ${artifact.name}: HTTP ${uploadRes.status} — ${uploadResBody.substring(0, 500)}`);
      }
    } else {
      log(`  ✅ CF Deploy: Artifact content uploaded successfully`);
    }

    // Step 2: Trigger deployment
    const deployUrl = `${baseUrl}/api/v1/DeployIntegrationDesigntimeArtifact?Id='${artifact.name}'&Version='active'`;
    log(`  🔄 CF Deploy: Triggering deployment for ${artifact.name}`);
    log(`  📋 CF Deploy Trigger: POST ${deployUrl}`);

    const deployHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    log(`  📋 CF Deploy Trigger: Request headers: ${JSON.stringify({ ...deployHeaders, Authorization: 'Bearer ***' })}`);

    const deployRes = await this.fetchWithRetry(deployUrl, {
      method: 'POST',
      headers: deployHeaders,
    }, log, 'CF Deploy Trigger');

    const deployResBody = await deployRes.text().catch(() => '');
    log(`  📋 CF Deploy Trigger: Response ${deployRes.status} ${deployRes.statusText} — body: ${deployResBody.substring(0, 1500)}`);

    if (!deployRes.ok) {
      if (deployRes.status === 409) {
        log(`  ⚠️ CF Deploy: Artifact ${artifact.name} already deployed (HTTP 409), continuing`);
      } else {
        throw new Error(`CF Deploy: Failed to trigger deployment for ${artifact.name}: HTTP ${deployRes.status} — ${deployResBody.substring(0, 500)}`);
      }
    } else {
      log(`  ✅ CF Deploy: Deployment triggered for ${artifact.name}`);
    }

    // Step 3: Poll deployment status
    const deployOperationId = deployResBody.trim();
    await this.pollDeploymentStatus(baseUrl, token, artifact, log, deployOperationId);
  }

  private async pollDeploymentStatus(
    baseUrl: string,
    token: string,
    artifact: ArtifactDescriptor,
    log: (msg: string) => void,
    deployOperationId?: string,
  ): Promise<void> {
    const statusUrl = `${baseUrl}/api/v1/IntegrationRuntimeArtifacts('${artifact.name}')`;
    const maxAttempts = 12;
    const pollIntervalMs = 10000;

    log(`  ⏳ CF Deploy: Polling status for ${artifact.name} (max ${maxAttempts * pollIntervalMs / 1000}s)`);
    if (deployOperationId) {
      log(`  🧾 CF Deploy: Operation ID: ${deployOperationId}`);
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      try {
        const res = await this.httpFetch(statusUrl, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          timeout: 15000,
        });

        const responseBody = await res.text().catch(() => '');
        const data = this.parseJsonSafely(responseBody) ?? {};
        const status = data?.d?.Status || data?.Status || 'UNKNOWN';

        log(`  ⏳ CF Deploy: [${attempt}/${maxAttempts}] ${artifact.name} — Status: ${status}`);

        if (status === 'STARTED') {
          log(`  🎉 CF Deploy: ${artifact.name} deployed and STARTED successfully`);
          return;
        }

        if (status === 'ERROR') {
          const errorInfo = await this.resolveCfErrorInformation(baseUrl, token, data, log);
          const isConcreteError = Boolean(errorInfo) && !errorInfo.includes('"__deferred"');

          log(`  ❌ CF Deploy: Error details — ${(errorInfo || 'No error details returned').substring(0, 1500)}`);

          // Some tenants briefly report ERROR before final STARTED and may return deferred placeholders.
          if (!isConcreteError && attempt < maxAttempts) {
            log(`  ⚠️ CF Deploy: ERROR reported without concrete details; retrying poll to avoid false negative`);
            continue;
          }

          throw new Error(`CF Deploy: ${artifact.name} deployment failed with ERROR: ${(errorInfo || 'No details').substring(0, 500)}`);
        }
      } catch (err) {
        if (err.message.includes('deployment failed')) throw err;
        log(`  ⚠️ CF Deploy: [${attempt}/${maxAttempts}] Poll error: ${err.message}`);
      }
    }

    log(`  ⚠️ CF Deploy: ${artifact.name} — status polling timed out (may still be deploying)`);
  }

  private parseJsonSafely(raw: string): any {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async resolveCfErrorInformation(
    baseUrl: string,
    token: string,
    runtimeData: any,
    log: (msg: string) => void,
  ): Promise<string> {
    const deferredUri =
      runtimeData?.d?.ErrorInformation?.__deferred?.uri ||
      runtimeData?.ErrorInformation?.__deferred?.uri ||
      runtimeData?.d?.ErrorInformation?.uri ||
      runtimeData?.ErrorInformation?.uri;

    if (deferredUri) {
      // SAP CPI OData requires /$value to get actual error content from deferred URIs
      const rawUrl = deferredUri.startsWith('http')
        ? deferredUri
        : `${baseUrl}${deferredUri.startsWith('/') ? '' : '/'}${deferredUri}`;
      const resolvedUrl = rawUrl.endsWith('/$value') ? rawUrl : `${rawUrl}/$value`;

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      };

      log(`  📋 CF ErrorDetails: GET ${resolvedUrl}`);
      log(`  📋 CF ErrorDetails: Request headers: ${JSON.stringify({ ...headers, Authorization: 'Bearer ***' })}`);

      try {
        const detailsRes = await this.fetchWithRetry(
          resolvedUrl,
          {
            method: 'GET',
            headers,
          },
          log,
          'CF ErrorDetails',
          1,
        );

        const detailsBody = await detailsRes.text().catch(() => '');
        log(`  📋 CF ErrorDetails: Response ${detailsRes.status} ${detailsRes.statusText} — body: ${detailsBody.substring(0, 1500)}`);

        if (!detailsRes.ok) {
          // A 404 means ErrorInformation hasn't propagated yet — return empty so polling continues
          if (detailsRes.status === 404) {
            log(`  ⚠️ CF ErrorDetails: ErrorInformation not available yet (404) — will retry poll`);
            return '';
          }
          return `HTTP ${detailsRes.status} ${detailsRes.statusText} while fetching ErrorInformation: ${detailsBody.substring(0, 500)}`;
        }

        const parsedDetails = this.parseJsonSafely(detailsBody);
        return this.stringifyCfError(parsedDetails ?? detailsBody);
      } catch (err) {
        log(`  ⚠️ CF ErrorDetails: Failed to resolve deferred error URI: ${err.message}`);
      }
    }

    const inlineError =
      runtimeData?.d?.ErrorInformation ||
      runtimeData?.ErrorInformation ||
      runtimeData?.d?.Error ||
      runtimeData?.Error ||
      runtimeData;

    return this.stringifyCfError(inlineError);
  }

  private stringifyCfError(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;

    if (Array.isArray(value)) {
      return value.map((entry) => this.stringifyCfError(entry)).filter(Boolean).join(' | ');
    }

    if (typeof value === 'object') {
      const obj = value as any;
      const extracted =
        obj?.d?.ErrorInformation?.ErrorMessage ||
        obj?.d?.ErrorInformation?.errorMessage ||
        obj?.d?.ErrorInformation?.message ||
        obj?.d?.ErrorInformation?.value ||
        obj?.d?.Message ||
        obj?.error?.message?.value ||
        obj?.message ||
        obj?.Message;

      if (extracted) return String(extracted);

      try {
        return JSON.stringify(obj);
      } catch {
        return String(obj);
      }
    }

    return String(value);
  }

  // ---------------------------------------------------------------------------
  // HTTP Helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch with exponential backoff retry for transient 5xx errors.
   * Retries up to `maxRetries` times with delays: 2s, 4s, 8s, …
   * Non-5xx responses (including 4xx) are returned immediately without retry.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    log: (msg: string) => void,
    label: string,
    maxRetries = 3,
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);

        const res = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timer);

        // Return immediately for non-5xx (success or client error)
        if (res.status < 500) return res;

        // 5xx — retry if attempts remain
        const body = await res.text().catch(() => '');
        lastError = new Error(`HTTP ${res.status}: ${body.substring(0, 300)}`);

        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
          log(`  🔄 ${label}: Transient ${res.status}, retrying in ${delayMs / 1000}s (${attempt + 1}/${maxRetries})`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (err.name === 'AbortError') {
          lastError = new Error(`${label}: Request timed out after 60s`);
        }

        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt + 1) * 1000;
          log(`  🔄 ${label}: Network error, retrying in ${delayMs / 1000}s (${attempt + 1}/${maxRetries}) — ${lastError.message}`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    throw lastError || new Error(`${label}: All ${maxRetries} retries exhausted`);
  }

  private normalizeUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

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
