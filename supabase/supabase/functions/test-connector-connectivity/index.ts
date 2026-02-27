import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ConnectivityRequest {
  connector: string;
  url: string;
  credentialId?: string;
  authType?: string;
  credentialData?: Record<string, string>;
}

/**
 * Normalize connector name to a canonical key for switching.
 * Handles variations like "Cloud Foundry", "cloud_foundry", "cloud foundry", "CloudFoundry".
 */
function normalizeConnectorKey(connector: string): string {
  return connector.toLowerCase().replace(/[_\s-]+/g, '');
}

/**
 * Server-side credential format validation.
 * Returns an error message if invalid, or null if valid.
 */
function validateCredentialFormat(
  connectorKey: string,
  authType: string,
  creds: Record<string, string> | null
): string | null {
  if (!creds) return null;
  const get = (...keys: string[]) => keys.reduce((v, k) => v || creds[k] || '', '');

  switch (connectorKey) {
    case 'github': {
      if (authType === 'personal_access_token') {
        const t = get('Personal Access Token', 'Token', 'token');
        if (!t) return 'GitHub PAT token is empty.';
        if (!/^(ghp_|github_pat_).{27,}$/.test(t)) return 'Invalid GitHub PAT — must start with ghp_ or github_pat_ and be ≥ 30 characters.';
      }
      break;
    }
    case 'gitlab': {
      if (authType === 'personal_access_token') {
        const t = get('Personal Access Token', 'Token', 'token');
        if (!t) return 'GitLab PAT token is empty.';
        if (t.length < 20) return 'Invalid GitLab PAT — token must be at least 20 characters.';
      }
      break;
    }
    case 'jira': {
      if (authType === 'username_api_key' || authType === 'basic_auth') {
        if (!get('Username', 'username', 'Email')) return 'Jira username / email is empty.';
        const k = get('API Key', 'apiKey', 'api_key', 'API Token');
        if (!k) return 'Jira API token is empty.';
        if (k.length < 10) return 'Invalid Jira API token — must be at least 10 characters.';
      }
      break;
    }
    case 'jenkins': {
      if (['username_token', 'username_api_key', 'basic_auth'].includes(authType)) {
        if (!get('Username', 'username')) return 'Jenkins username is empty.';
        if (!get('API Token', 'API Key', 'token')) return 'Jenkins API token is empty.';
      }
      break;
    }
    case 'bitbucket': {
      if (authType === 'app_password' || authType === 'basic_auth') {
        if (!get('Username', 'username')) return 'Bitbucket username is empty.';
        if (!get('App Password', 'Password', 'password')) return 'Bitbucket app password is empty.';
      }
      break;
    }
    case 'azuredevops': {
      if (authType === 'personal_access_token') {
        const t = get('Personal Access Token', 'Token', 'token');
        if (!t) return 'Azure DevOps PAT is empty.';
        if (t.length < 30) return 'Invalid Azure DevOps PAT — must be at least 30 characters.';
      }
      break;
    }
    case 'servicenow': {
      if (authType === 'basic_auth' || authType === 'username_password') {
        if (!get('Username', 'username')) return 'ServiceNow username is empty.';
        if (!get('Password', 'password')) return 'ServiceNow password is empty.';
      } else if (authType === 'oauth2') {
        if (!get('Client ID', 'client_id')) return 'ServiceNow Client ID is empty.';
        if (!get('Client Secret', 'client_secret')) return 'ServiceNow Client Secret is empty.';
      }
      break;
    }
    case 'cloudfoundry': {
      if (authType === 'oauth2') {
        if (!get('Client ID', 'client_id')) return 'Cloud Foundry Client ID is empty.';
        if (!get('Client Secret', 'client_secret')) return 'Cloud Foundry Client Secret is empty.';
        if (!get('Token URL', 'token_url')) return 'Cloud Foundry Token URL is empty.';
      }
      break;
    }
    case 'sonarqube': {
      if (!get('Token', 'token', 'API Key', 'apiKey')) return 'SonarQube token is empty.';
      break;
    }
    case 'slack': {
      const t = get('Bot Token', 'Token', 'token');
      if (!t) return 'Slack bot token is empty.';
      if (!/^xoxb-/.test(t)) return 'Invalid Slack bot token — must start with xoxb-.';
      break;
    }
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { connector, url, credentialId, authType: directAuthType, credentialData }: ConnectivityRequest = await req.json();

    console.log(`Testing connectivity for ${connector} at ${url}`);

    if (!connector || !url) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields: connector or url',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Use directly-provided credential data (preferred) or fall back to DB lookup
    let credData: Record<string, string> | null = credentialData || null;
    let authType = directAuthType || '';
    let resolvedCredentialId = credentialId || '';

    if (!credData && resolvedCredentialId) {
      // Legacy path: try fetching from DB (may fail due to SSL issues)
      try {
        const { data: credential, error: credError } = await supabase
          .from('credentials')
          .select('*')
          .eq('id', resolvedCredentialId)
          .single();

        if (credError || !credential) {
          console.error('Failed to fetch credential:', credError);
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Credential not found. Please try again.',
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        credData = credential.credentials as Record<string, string> | null;
        authType = credential.auth_type;
      } catch (dbErr) {
        console.error('DB lookup failed, credential data required in request body:', dbErr);
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Could not resolve credentials. Please update your client.',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    const connectorKey = normalizeConnectorKey(connector);

    // Server-side credential format validation
    const credValidationError = validateCredentialFormat(connectorKey, authType, credData);
    if (credValidationError) {
      return new Response(JSON.stringify({ success: false, message: credValidationError }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    let testSuccess = false;
    let testMessage = '';


    switch (connectorKey) {
      case 'jira': {
        testSuccess = await testJiraConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to Jira' : 'Failed to connect to Jira';
        break;
      }
      case 'github': {
        const ghResult = await testGitHubConnectivity(url, authType, credData);
        testSuccess = ghResult.success;
        testMessage = ghResult.message;
        break;
      }
      case 'gitlab': {
        testSuccess = await testGitLabConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to GitLab' : 'Failed to connect to GitLab';
        break;
      }
      case 'servicenow': {
        testSuccess = await testServiceNowConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to ServiceNow' : 'Failed to connect to ServiceNow';
        break;
      }
      case 'jenkins': {
        testSuccess = await testJenkinsConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to Jenkins' : 'Failed to connect to Jenkins';
        break;
      }
      case 'cloudfoundry': {
        testSuccess = await testCloudFoundryConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to Cloud Foundry' : 'Failed to connect to Cloud Foundry';
        break;
      }
      case 'azuredevops': {
        testSuccess = await testAzureDevOpsConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to Azure DevOps' : 'Failed to connect to Azure DevOps';
        break;
      }
      case 'bitbucket': {
        testSuccess = await testBitbucketConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to Bitbucket' : 'Failed to connect to Bitbucket';
        break;
      }
      case 'sonarqube': {
        testSuccess = await testSonarQubeConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to SonarQube' : 'Failed to connect to SonarQube';
        break;
      }
      case 'prometheus': {
        testSuccess = await testPrometheusConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to Prometheus' : 'Failed to connect to Prometheus';
        break;
      }
      case 'slack': {
        testSuccess = await testSlackConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to Slack' : 'Failed to connect to Slack';
        break;
      }
      case 'teams':
      case 'microsoftteams': {
        testSuccess = await testTeamsConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to Microsoft Teams' : 'Failed to connect to Microsoft Teams';
        break;
      }
      default: {
        testSuccess = await testGenericConnectivity(url);
        testMessage = testSuccess ? `Successfully connected to ${connector}` : `Failed to connect to ${connector}`;
      }
    }

    // Update last_used_at on the credential if test was successful
    if (testSuccess && resolvedCredentialId) {
      try {
        await supabase
          .from('credentials')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', resolvedCredentialId);
      } catch (e) {
        console.warn('Could not update last_used_at:', e);
      }
    }

    return new Response(
      JSON.stringify({
        success: testSuccess,
        message: testMessage,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Connectivity test error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({
        success: false,
        message: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ─── Jira ─────────────────────────────────────────────────────────────────────
// External API: GET {jiraBaseUrl}/rest/api/3/myself
// Auth: Basic (username:apiToken) or Bearer (PAT)
async function testJiraConnectivity(
  url: string, 
  authType: string, 
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const apiUrl = `${baseUrl}/rest/api/3/myself`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if ((authType === 'username_api_key' || authType === 'basic_auth') && credentials) {
      const username = credentials['Username'] || credentials['username'] || '';
      const apiKey = credentials['API Key'] || credentials['apiKey'] || credentials['api_key'] || '';
      headers['Authorization'] = `Basic ${btoa(`${username}:${apiKey}`)}`;
    } else if (authType === 'personal_access_token' && credentials) {
      const pat = credentials['Personal Access Token'] || credentials['token'] || '';
      headers['Authorization'] = `Bearer ${pat}`;
    }

    const response = await fetch(apiUrl, { method: 'GET', headers });
    await response.text(); // consume body
    console.log(`Jira test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('Jira connectivity test failed:', error);
    return false;
  }
}

// ─── GitHub ───────────────────────────────────────────────────────────────────
// External APIs:
//   Account URL: GET https://api.github.com/users/{username}
//   Repo URL:    GET https://api.github.com/user + GET https://api.github.com/repos/{owner}/{repo}
// Auth: Bearer (OAuth token or PAT)
async function testGitHubConnectivity(
  url: string, 
  authType: string, 
  credentials: Record<string, string> | null
): Promise<{ success: boolean; message: string }> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'DevOps-Automate-Backend',
    };

    if (credentials) {
      const token = credentials['Personal Access Token'] || credentials['Token'] || credentials['token'] || credentials['oauth_access_token'] || '';
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    // First verify user auth
    const userResponse = await fetch('https://api.github.com/user', { method: 'GET', headers });
    const userBody = await userResponse.text();
    console.log(`GitHub /user status: ${userResponse.status}`);
    
    if (!userResponse.ok) {
      if (userResponse.status === 401) {
        return { success: false, message: 'GitHub authentication failed — the Personal Access Token is invalid or expired. Please generate a new token at github.com/settings/tokens' };
      }
      return { success: false, message: `GitHub auth failed (HTTP ${userResponse.status})` };
    }

    const userData = JSON.parse(userBody);
    const login = userData.login || 'unknown';

    // Parse the GitHub URL to determine if it's a repo
    const ghMatch = url.match(/github\.com\/([^/]+)(?:\/([^/]+))?/);
    
    if (ghMatch && ghMatch[2]) {
      const owner = ghMatch[1];
      const repo = ghMatch[2].replace(/\.git$/, '');
      
      const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { method: 'GET', headers });
      await repoResponse.text();
      console.log(`GitHub /repos/${owner}/${repo} status: ${repoResponse.status}`);
      
      if (!repoResponse.ok) {
        return { success: false, message: `Authenticated as ${login}, but cannot access repo ${owner}/${repo} (HTTP ${repoResponse.status})` };
      }
      return { success: true, message: `Connected as ${login} — repo ${owner}/${repo} accessible` };
    } else if (ghMatch && ghMatch[1]) {
      return { success: true, message: `Connected as ${login}` };
    } else {
      return { success: true, message: `Connected as ${login}` };
    }
  } catch (error) {
    console.error('GitHub connectivity test failed:', error);
    return { success: false, message: `GitHub connection error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

// ─── GitLab ───────────────────────────────────────────────────────────────────
// External API: GET {gitlabBaseUrl}/api/v4/user
// Auth: PRIVATE-TOKEN header (PAT)
async function testGitLabConnectivity(
  url: string, 
  authType: string, 
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const apiUrl = `${baseUrl}/api/v4/user`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (authType === 'personal_access_token' && credentials) {
      const token = credentials['Personal Access Token'] || credentials['token'] || '';
      headers['PRIVATE-TOKEN'] = token;
    } else if (authType === 'oauth2' && credentials) {
      const token = credentials['Access Token'] || credentials['token'] || '';
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(apiUrl, { method: 'GET', headers });
    await response.text();
    console.log(`GitLab test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('GitLab connectivity test failed:', error);
    return false;
  }
}

// ─── ServiceNow ───────────────────────────────────────────────────────────────
// External API: GET {snBaseUrl}/api/now/table/sys_user?sysparm_limit=1
// Auth: Basic (username:password) or OAuth2 (client_credentials)
async function testServiceNowConnectivity(
  url: string, 
  authType: string, 
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const apiUrl = `${baseUrl}/api/now/table/sys_user?sysparm_limit=1`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if ((authType === 'basic_auth' || authType === 'username_password') && credentials) {
      const username = credentials['Username'] || credentials['username'] || '';
      const password = credentials['Password'] || credentials['password'] || '';
      headers['Authorization'] = `Basic ${btoa(`${username}:${password}`)}`;
    } else if (authType === 'oauth2' && credentials) {
      const clientId = credentials['Client ID'] || credentials['client_id'] || '';
      const clientSecret = credentials['Client Secret'] || credentials['client_secret'] || '';
      const tokenUrl = credentials['Token URL'] || credentials['token_url'] || `${baseUrl}/oauth_token.do`;
      
      if (clientId && clientSecret) {
        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });
        
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          headers['Authorization'] = `Bearer ${tokenData.access_token}`;
        } else {
          await tokenResponse.text();
          console.error('ServiceNow OAuth token request failed:', tokenResponse.status);
          return false;
        }
      }
    }

    const response = await fetch(apiUrl, { method: 'GET', headers });
    await response.text();
    console.log(`ServiceNow test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('ServiceNow connectivity test failed:', error);
    return false;
  }
}

// ─── Jenkins ──────────────────────────────────────────────────────────────────
// External API: GET {jenkinsBaseUrl}/api/json
// Auth: Basic (username:apiToken)
async function testJenkinsConnectivity(
  url: string, 
  authType: string, 
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const apiUrl = `${baseUrl}/api/json`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if ((authType === 'username_token' || authType === 'username_api_key' || authType === 'basic_auth') && credentials) {
      const username = credentials['Username'] || credentials['username'] || '';
      const token = credentials['API Token'] || credentials['API Key'] || credentials['token'] || '';
      headers['Authorization'] = `Basic ${btoa(`${username}:${token}`)}`;
    }

    const response = await fetch(apiUrl, { method: 'GET', headers });
    await response.text();
    console.log(`Jenkins test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('Jenkins connectivity test failed:', error);
    return false;
  }
}

// ─── Cloud Foundry ────────────────────────────────────────────────────────────
// External API: GET {cfBaseUrl}/v3/info (public) then GET /v3/organizations (authed)
// Auth: OAuth2 (client_credentials) via UAA token endpoint
async function testCloudFoundryConnectivity(
  url: string, 
  authType: string, 
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    
    // If we have OAuth2 credentials, try token acquisition first (works for SAP CPI and standard CF)
    if (authType === 'oauth2' && credentials) {
      const clientId = credentials['Client ID'] || credentials['client_id'] || '';
      const clientSecret = credentials['Client Secret'] || credentials['client_secret'] || '';
      const tokenUrl = credentials['Token URL'] || credentials['token_url'] || '';
      
      if (tokenUrl && clientId && clientSecret) {
        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          },
          body: new URLSearchParams({ grant_type: 'client_credentials' }),
        });
        
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          console.log(`Cloud Foundry OAuth token acquired successfully`);
          
          // Try CF API endpoint first
          const orgResponse = await fetch(`${baseUrl}/v3/organizations`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${tokenData.access_token}`,
            },
          });
          await orgResponse.text();
          console.log(`Cloud Foundry /v3/organizations status: ${orgResponse.status}`);
          
          if (orgResponse.ok) return true;
          
          // If CF API not available, try root URL with auth (SAP CPI or other CF-based platforms)
          const rootResponse = await fetch(baseUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${tokenData.access_token}`,
            },
          });
          await rootResponse.text();
          console.log(`Cloud Foundry root URL status: ${rootResponse.status}`);
          
          // Token was valid — consider connectivity successful even if root returns non-200
          // because token acquisition proves the credentials work
          return true;
        } else {
          const errBody = await tokenResponse.text();
          console.error(`Cloud Foundry OAuth token request failed: ${tokenResponse.status} - ${errBody}`);
          return false;
        }
      }
    }

    // Fallback: check if CF API is reachable via /v3/info (no auth needed)
    const infoUrl = `${baseUrl}/v3/info`;
    const infoResponse = await fetch(infoUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    await infoResponse.text();
    console.log(`Cloud Foundry /v3/info status: ${infoResponse.status}`);
    
    if (!infoResponse.ok) return false;

    if ((authType === 'basic_auth' || authType === 'username_password') && credentials) {
      const username = credentials['Username'] || credentials['username'] || '';
      console.log(`Cloud Foundry reachable with basic_auth user: ${username}`);
    }

    return true;
  } catch (error) {
    console.error('Cloud Foundry connectivity test failed:', error);
    return false;
  }
}

// ─── Azure DevOps ─────────────────────────────────────────────────────────────
// External API: GET {azureDevOpsUrl}/_apis/projects?api-version=7.0
// Auth: Basic (:PAT) or Bearer
async function testAzureDevOpsConnectivity(
  url: string,
  authType: string,
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const apiUrl = `${baseUrl}/_apis/projects?api-version=7.0`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (credentials) {
      const pat = credentials['Personal Access Token'] || credentials['token'] || '';
      if (pat) {
        headers['Authorization'] = `Basic ${btoa(`:${pat}`)}`;
      }
    }

    const response = await fetch(apiUrl, { method: 'GET', headers });
    await response.text();
    console.log(`Azure DevOps test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('Azure DevOps connectivity test failed:', error);
    return false;
  }
}

// ─── Bitbucket ────────────────────────────────────────────────────────────────
// External API: GET https://api.bitbucket.org/2.0/user
// Auth: Basic (username:app_password) or Bearer (OAuth)
async function testBitbucketConnectivity(
  url: string,
  authType: string,
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const apiUrl = 'https://api.bitbucket.org/2.0/user';

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if ((authType === 'basic_auth' || authType === 'username_password' || authType === 'username_api_key') && credentials) {
      const username = credentials['Username'] || credentials['username'] || '';
      const appPassword = credentials['App Password'] || credentials['Password'] || credentials['password'] || '';
      headers['Authorization'] = `Basic ${btoa(`${username}:${appPassword}`)}`;
    } else if ((authType === 'oauth2' || authType === 'personal_access_token') && credentials) {
      const token = credentials['Access Token'] || credentials['Personal Access Token'] || credentials['token'] || '';
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(apiUrl, { method: 'GET', headers });
    await response.text();
    console.log(`Bitbucket test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('Bitbucket connectivity test failed:', error);
    return false;
  }
}

// ─── SonarQube ────────────────────────────────────────────────────────────────
// External API: GET {sonarBaseUrl}/api/system/status
// Auth: Basic (token:) — SonarQube uses token as username, empty password
async function testSonarQubeConnectivity(
  url: string,
  authType: string,
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const apiUrl = `${baseUrl}/api/system/status`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (credentials) {
      const token = credentials['Token'] || credentials['token'] || credentials['API Key'] || '';
      if (token) {
        headers['Authorization'] = `Basic ${btoa(`${token}:`)}`;
      }
    }

    const response = await fetch(apiUrl, { method: 'GET', headers });
    await response.text();
    console.log(`SonarQube test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('SonarQube connectivity test failed:', error);
    return false;
  }
}

// ─── Prometheus ───────────────────────────────────────────────────────────────
// External API: GET {prometheusUrl}/api/v1/status/buildinfo
// Auth: Basic or Bearer (if configured)
async function testPrometheusConnectivity(
  url: string,
  authType: string,
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const apiUrl = `${baseUrl}/api/v1/status/buildinfo`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if ((authType === 'basic_auth' || authType === 'username_password') && credentials) {
      const username = credentials['Username'] || credentials['username'] || '';
      const password = credentials['Password'] || credentials['password'] || '';
      headers['Authorization'] = `Basic ${btoa(`${username}:${password}`)}`;
    } else if (authType === 'bearer_token' && credentials) {
      const token = credentials['Token'] || credentials['token'] || '';
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(apiUrl, { method: 'GET', headers });
    await response.text();
    console.log(`Prometheus test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('Prometheus connectivity test failed:', error);
    return false;
  }
}

// ─── Slack ────────────────────────────────────────────────────────────────────
// External API: POST https://slack.com/api/auth.test
// Auth: Bearer (Bot/User OAuth token)
async function testSlackConnectivity(
  _url: string,
  authType: string,
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (credentials) {
      const token = credentials['Bot Token'] || credentials['Token'] || credentials['token'] || credentials['OAuth Token'] || '';
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers,
    });
    const data = await response.json();
    console.log(`Slack auth.test ok: ${data.ok}`);
    return data.ok === true;
  } catch (error) {
    console.error('Slack connectivity test failed:', error);
    return false;
  }
}

// ─── Microsoft Teams ──────────────────────────────────────────────────────────
// External API: GET https://graph.microsoft.com/v1.0/me
// Auth: Bearer (OAuth2 token)
async function testTeamsConnectivity(
  _url: string,
  authType: string,
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (authType === 'oauth2' && credentials) {
      const clientId = credentials['Client ID'] || credentials['client_id'] || '';
      const clientSecret = credentials['Client Secret'] || credentials['client_secret'] || '';
      const tenantId = credentials['Tenant ID'] || credentials['tenant_id'] || '';

      if (clientId && clientSecret && tenantId) {
        const tokenResponse = await fetch(
          `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: clientId,
              client_secret: clientSecret,
              scope: 'https://graph.microsoft.com/.default',
            }),
          }
        );

        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          headers['Authorization'] = `Bearer ${tokenData.access_token}`;
        } else {
          await tokenResponse.text();
          console.error('Teams OAuth token request failed:', tokenResponse.status);
          return false;
        }
      }
    } else if (credentials) {
      const token = credentials['Access Token'] || credentials['token'] || '';
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    // For client_credentials flow, /me won't work — use /organization instead
    const endpoint = authType === 'oauth2'
      ? 'https://graph.microsoft.com/v1.0/organization'
      : 'https://graph.microsoft.com/v1.0/me';

    const response = await fetch(endpoint, { method: 'GET', headers });
    await response.text();
    console.log(`Teams test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('Teams connectivity test failed:', error);
    return false;
  }
}

// ─── Generic ──────────────────────────────────────────────────────────────────
async function testGenericConnectivity(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    await response.text();
    console.log(`Generic test response status: ${response.status}`);
    return response.ok || response.status === 405;
  } catch (error) {
    console.error('Generic connectivity test failed:', error);
    return false;
  }
}
