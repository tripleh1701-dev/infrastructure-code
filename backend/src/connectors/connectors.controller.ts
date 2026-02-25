import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { CredentialsService } from '../credentials/credentials.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import { AccountGuard } from '../auth/guards/account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
// Uses native fetch (Node 18+)

@Controller('connectors')
@UseGuards(AccountGuard)
export class ConnectorsController {
  private readonly logger = new Logger(ConnectorsController.name);

  constructor(
    private readonly connectorsService: ConnectorsService,
    private readonly credentialsService: CredentialsService,
  ) {}

  /**
   * Test connector connectivity — validates credentials against the real tool API.
   * Must be declared before :id routes to avoid path conflicts.
   */
  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async testConnection(@Body() dto: TestConnectionDto) {
    return this.doTestConnection(dto);
  }

  /**
   * OAuth stub endpoints - called by the frontend credentials service.
   * These must be declared before :id routes to avoid path conflicts.
   */
  @Post('oauth/initiate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async oauthInitiate(
    @Body() body: { provider: string; credentialId: string; redirectUri: string },
  ) {
    return {
      authorizationUrl: `https://${body.provider}.example.com/oauth/authorize?client_id=stub&redirect_uri=${encodeURIComponent(body.redirectUri)}`,
      state: `state-${Date.now()}`,
    };
  }

  @Get('oauth/status/:credentialId')
  async oauthStatus(@Param('credentialId') credentialId: string) {
    return { status: 'pending' };
  }

  @Post('oauth/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async oauthRevoke(@Body() body: { credentialId: string }) {
    return { success: true };
  }

  @Get()
  async findAll(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.connectorsService.findAll(accountId, enterpriseId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.connectorsService.findOne(id, accountId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async create(@Body() dto: CreateConnectorDto) {
    return this.connectorsService.create(dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateConnectorDto,
    @Query('accountId') accountId?: string,
  ) {
    return this.connectorsService.update(id, dto, accountId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async remove(
    @Param('id') id: string,
    @Query('accountId') accountId?: string,
  ) {
    await this.connectorsService.remove(id, accountId);
  }

  // ─── Private: Connectivity test logic ──────────────────────────────────────

  private async doTestConnection(dto: TestConnectionDto) {
    const { connector, url, credentialId } = dto;
    const normalizedTool = connector.toLowerCase().replace(/[\s-]+/g, '_');

    // Fetch credential from DynamoDB if provided
    let cred: Record<string, any> | null = null;
    if (credentialId) {
      try {
        cred = await this.credentialsService.findOne(credentialId, dto.accountId);
      } catch {
        return { success: false, message: 'Credential not found' };
      }
    }

    const credFields = cred?.credentials || {};

    try {
      switch (normalizedTool) {
        case 'jira':
          return await this.testJira(url, credFields);
        case 'github':
          return await this.testGitHub(url, credFields);
        case 'gitlab':
          return await this.testGitLab(url, credFields);
        case 'bitbucket':
          return await this.testBitbucket(url, credFields);
        case 'jenkins':
          return await this.testJenkins(url, credFields);
        case 'azure_devops':
          return await this.testAzureDevOps(url, credFields);
        case 'servicenow':
          return await this.testServiceNow(url, credFields);
        case 'sonarqube':
          return await this.testSonarQube(url, credFields);
        case 'artifactory':
        case 'jfrog':
          return await this.testArtifactory(url, credFields);
        case 'sap_cpi':
        case 'sap_cloud_integration':
          return await this.testSapCpi(url, credFields);
        case 'slack':
          return await this.testSlack(credFields);
        case 'teams':
        case 'microsoft_teams':
          return await this.testTeams(credFields);
        case 'pagerduty':
          return await this.testPagerDuty(credFields);
        default:
          // Generic HTTP ping
          if (url) return await this.testGenericUrl(url, credFields);
          return { success: false, message: `Unsupported connector: ${connector}` };
      }
    } catch (error: any) {
      this.logger.error(`Test connection failed for ${normalizedTool}: ${error.message}`);
      return { success: false, message: error.message || 'Connection test failed' };
    }
  }

  // ── Tool-specific testers ──────────────────────────────────────────────────

  private async testJira(url: string | undefined, creds: Record<string, any>) {
    if (!url) return { success: false, message: 'Missing URL' };
    const baseUrl = this.normalizeUrl(url);
    const username = creds.username || creds.Username || creds.email || creds['Username/Email'];
    const apiToken = creds.apiToken || creds.api_token || creds['API Key'] || creds.password || creds.Password;
    const pat = creds.pat || creds['Personal Access Token'];

    let headers: Record<string, string>;
    if (pat) {
      // Jira Data Center PAT uses Bearer auth (no username needed)
      headers = { Authorization: `Bearer ${pat}`, Accept: 'application/json' };
    } else if (username && apiToken) {
      // Jira Cloud uses Basic auth with username:apiToken
      const base64 = Buffer.from(`${username}:${apiToken}`).toString('base64');
      headers = { Authorization: `Basic ${base64}`, Accept: 'application/json' };
    } else {
      return { success: false, message: 'Missing credentials: provide username + API key, or a Personal Access Token' };
    }

    const res = await this.fetchWithTimeout(`${baseUrl}/rest/api/3/myself`, { headers });
    if (!res.ok) return this.httpError(res);
    const data = await res.json();
    return {
      success: true,
      message: 'Successfully connected to JIRA',
      userInfo: { accountId: data.accountId, displayName: data.displayName, emailAddress: data.emailAddress },
    };
  }

  private async testGitHub(url: string | undefined, creds: Record<string, any>) {
    const token = creds.token || creds.apiToken || creds.api_token || creds['Personal Access Token'] || creds.password;
    if (!token) return { success: false, message: 'Missing token' };
    const apiUrl = url ? `${this.normalizeUrl(url)}/api/v3/user` : 'https://api.github.com/user';
    const res = await this.fetchWithTimeout(apiUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return this.httpError(res);
    const data = await res.json();
    return { success: true, message: `Connected as ${data.login}` };
  }

  private async testGitLab(url: string | undefined, creds: Record<string, any>) {
    const token = creds.token || creds.apiToken || creds.api_token || creds['Personal Access Token'] || creds.password;
    if (!token) return { success: false, message: 'Missing token' };
    const baseUrl = url ? this.normalizeUrl(url) : 'https://gitlab.com';
    const res = await this.fetchWithTimeout(`${baseUrl}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token },
    });
    if (!res.ok) return this.httpError(res);
    const data = await res.json();
    return { success: true, message: `Connected as ${data.username}` };
  }

  private async testBitbucket(url: string | undefined, creds: Record<string, any>) {
    const username = creds.username || creds.Username;
    const password = creds.password || creds.Password || creds.appPassword || creds['App Password'] || creds.apiToken;
    if (!username || !password) return { success: false, message: 'Missing username or app password' };
    const base64 = Buffer.from(`${username}:${password}`).toString('base64');
    const apiUrl = url ? `${this.normalizeUrl(url)}/2.0/user` : 'https://api.bitbucket.org/2.0/user';
    const res = await this.fetchWithTimeout(apiUrl, {
      headers: { Authorization: `Basic ${base64}` },
    });
    if (!res.ok) return this.httpError(res);
    const data = await res.json();
    return { success: true, message: `Connected as ${data.display_name}` };
  }

  private async testJenkins(url: string | undefined, creds: Record<string, any>) {
    if (!url) return { success: false, message: 'Missing URL' };
    const username = creds.username || creds.Username;
    const token = creds.apiToken || creds.api_token || creds['API Token'] || creds.token || creds.password;
    if (!username || !token) return { success: false, message: 'Missing username or API token' };
    const base64 = Buffer.from(`${username}:${token}`).toString('base64');
    const res = await this.fetchWithTimeout(`${this.normalizeUrl(url)}/api/json`, {
      headers: { Authorization: `Basic ${base64}` },
    });
    if (!res.ok) return this.httpError(res);
    return { success: true, message: 'Successfully connected to Jenkins' };
  }

  private async testAzureDevOps(url: string | undefined, creds: Record<string, any>) {
    if (!url) return { success: false, message: 'Missing URL' };
    const token = creds.pat || creds.token || creds.apiToken || creds['Personal Access Token'] || creds.password;
    if (!token) return { success: false, message: 'Missing PAT' };
    const base64 = Buffer.from(`:${token}`).toString('base64');
    const res = await this.fetchWithTimeout(`${this.normalizeUrl(url)}/_apis/projects?api-version=7.0`, {
      headers: { Authorization: `Basic ${base64}` },
    });
    if (!res.ok) return this.httpError(res);
    return { success: true, message: 'Successfully connected to Azure DevOps' };
  }

  private async testServiceNow(url: string | undefined, creds: Record<string, any>) {
    if (!url) return { success: false, message: 'Missing URL' };
    const username = creds.username || creds.Username;
    const password = creds.password || creds.Password;
    if (!username || !password) return { success: false, message: 'Missing username or password' };
    const base64 = Buffer.from(`${username}:${password}`).toString('base64');
    const res = await this.fetchWithTimeout(`${this.normalizeUrl(url)}/api/now/table/sys_user?sysparm_limit=1`, {
      headers: { Authorization: `Basic ${base64}`, Accept: 'application/json' },
    });
    if (!res.ok) return this.httpError(res);
    return { success: true, message: 'Successfully connected to ServiceNow' };
  }

  private async testSonarQube(url: string | undefined, creds: Record<string, any>) {
    if (!url) return { success: false, message: 'Missing URL' };
    const token = creds.token || creds.apiToken || creds.api_token;
    if (!token) return { success: false, message: 'Missing token' };
    const base64 = Buffer.from(`${token}:`).toString('base64');
    const res = await this.fetchWithTimeout(`${this.normalizeUrl(url)}/api/system/status`, {
      headers: { Authorization: `Basic ${base64}` },
    });
    if (!res.ok) return this.httpError(res);
    return { success: true, message: 'Successfully connected to SonarQube' };
  }

  private async testArtifactory(url: string | undefined, creds: Record<string, any>) {
    if (!url) return { success: false, message: 'Missing URL' };
    const token = creds.apiKey || creds['API Key'] || creds.apiToken || creds.api_token || creds.token;
    if (!token) return { success: false, message: 'Missing API key' };
    const res = await this.fetchWithTimeout(`${this.normalizeUrl(url)}/api/system/ping`, {
      headers: { 'X-JFrog-Art-Api': token },
    });
    if (!res.ok) return this.httpError(res);
    return { success: true, message: 'Successfully connected to Artifactory' };
  }

  private async testSapCpi(url: string | undefined, creds: Record<string, any>) {
    if (!url) return { success: false, message: 'Missing URL' };
    const tokenUrl = creds.tokenUrl || creds.token_url || creds['Token URL'];
    const clientId = creds.clientId || creds.client_id || creds['Client ID'];
    const clientSecret = creds.clientSecret || creds.client_secret || creds['Client Secret'];
    if (tokenUrl && clientId && clientSecret) {
      const tokenRes = await this.fetchWithTimeout(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
      });
      if (!tokenRes.ok) return this.httpError(tokenRes);
      const tokenData = await tokenRes.json();
      const res = await this.fetchWithTimeout(`${this.normalizeUrl(url)}/api/v1/IntegrationDesigntimeArtifacts`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
      });
      if (!res.ok) return this.httpError(res);
      return { success: true, message: 'Successfully connected to SAP CPI (OAuth)' };
    }
    const username = creds.username || creds.Username;
    const password = creds.password || creds.Password;
    if (!username || !password) return { success: false, message: 'Missing credentials (OAuth or Basic)' };
    const base64 = Buffer.from(`${username}:${password}`).toString('base64');
    const res = await this.fetchWithTimeout(`${this.normalizeUrl(url)}/api/v1/IntegrationDesigntimeArtifacts`, {
      headers: { Authorization: `Basic ${base64}`, Accept: 'application/json' },
    });
    if (!res.ok) return this.httpError(res);
    return { success: true, message: 'Successfully connected to SAP CPI' };
  }

  private async testSlack(creds: Record<string, any>) {
    const token = creds.token || creds.botToken || creds['Bot Token'] || creds.apiToken;
    if (!token) return { success: false, message: 'Missing token' };
    const res = await this.fetchWithTimeout('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.ok) return { success: true, message: `Connected as ${data.user}` };
    return { success: false, message: data.error || 'Slack auth failed' };
  }

  private async testTeams(creds: Record<string, any>) {
    const webhookUrl = creds.webhookUrl || creds.webhook_url || creds['Webhook URL'] || creds.url;
    if (!webhookUrl) return { success: false, message: 'Missing webhook URL' };
    await this.fetchWithTimeout(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Connectivity test from platform' }),
    });
    return { success: true, message: 'Successfully connected to Microsoft Teams' };
  }

  private async testPagerDuty(creds: Record<string, any>) {
    const token = creds.token || creds.apiToken || creds['API Token'] || creds.api_token;
    if (!token) return { success: false, message: 'Missing API token' };
    const res = await this.fetchWithTimeout('https://api.pagerduty.com/users/me', {
      headers: { Authorization: `Token token=${token}`, Accept: 'application/json' },
    });
    if (!res.ok) return this.httpError(res);
    const data = await res.json();
    return { success: true, message: `Connected as ${data.user?.name || 'PagerDuty user'}` };
  }

  private async testGenericUrl(url: string, creds: Record<string, any>) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = creds.token || creds.apiToken || creds['API Key'] || creds.api_token;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await this.fetchWithTimeout(this.normalizeUrl(url), { headers });
    if (!res.ok) return this.httpError(res);
    return { success: true, message: 'Connection successful' };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 10000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async httpError(res: Response) {
    let msg = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      if (text) msg += `: ${text.substring(0, 200)}`;
    } catch { /* ignore */ }
    if (res.status === 401) return { success: false, message: 'Authentication failed. Check your credentials.' };
    if (res.status === 403) return { success: false, message: 'Access forbidden. Check permissions.' };
    if (res.status === 404) return { success: false, message: 'Endpoint not found. Check the URL.' };
    return { success: false, message: msg };
  }

  private normalizeUrl(url: string): string {
    let normalized = url.trim();
    try {
      const u = new URL(normalized);
      normalized = `${u.protocol}//${u.host}`;
    } catch {
      normalized = normalized.replace(/\/rest\/.*$/, '');
    }
    return normalized.replace(/\/$/, '');
  }
}
