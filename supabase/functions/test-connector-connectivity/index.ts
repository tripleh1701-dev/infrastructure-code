import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ConnectivityRequest {
  connector: string;
  url: string;
  credentialId: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
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

    const { connector, url, credentialId }: ConnectivityRequest = await req.json();

    console.log(`Testing connectivity for ${connector} at ${url}`);

    if (!connector || !url || !credentialId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields: connector, url, or credentialId',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch the credential from the database
    const { data: credential, error: credError } = await supabase
      .from('credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (credError || !credential) {
      console.error('Failed to fetch credential:', credError);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Credential not found',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get credentials data
    const credData = credential.credentials as Record<string, string> | null;
    const authType = credential.auth_type;

    let testSuccess = false;
    let testMessage = '';

    // Test connectivity based on connector type
    switch (connector.toLowerCase()) {
      case 'jira': {
        testSuccess = await testJiraConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to JIRA' : 'Failed to connect to JIRA';
        break;
      }
      case 'github': {
        testSuccess = await testGitHubConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to GitHub' : 'Failed to connect to GitHub';
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
      case 'cloud foundry': {
        testSuccess = await testCloudFoundryConnectivity(url, authType, credData);
        testMessage = testSuccess ? 'Successfully connected to Cloud Foundry' : 'Failed to connect to Cloud Foundry';
        break;
      }
      default: {
        // Generic connectivity test - just try to reach the URL
        testSuccess = await testGenericConnectivity(url);
        testMessage = testSuccess ? `Successfully connected to ${connector}` : `Failed to connect to ${connector}`;
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

// JIRA connectivity test
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
    };

    if (authType === 'username_api_key' && credentials) {
      const username = credentials['Username'] || '';
      const apiKey = credentials['API Key'] || '';
      headers['Authorization'] = `Basic ${btoa(`${username}:${apiKey}`)}`;
    } else if (authType === 'personal_access_token' && credentials) {
      const pat = credentials['Personal Access Token'] || '';
      headers['Authorization'] = `Bearer ${pat}`;
    }

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers,
    });

    console.log(`JIRA test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('JIRA connectivity test failed:', error);
    return false;
  }
}

// GitHub connectivity test
async function testGitHubConnectivity(
  url: string, 
  authType: string, 
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    // Normalize URL - default to api.github.com for github.com
    let apiUrl = url;
    if (url.includes('github.com') && !url.includes('api.')) {
      apiUrl = 'https://api.github.com';
    }
    const testUrl = `${apiUrl.replace(/\/$/, '')}/user`;

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };

    if ((authType === 'username_token' || authType === 'personal_access_token') && credentials) {
      const token = credentials['Personal Access Token'] || credentials['Token'] || '';
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(testUrl, {
      method: 'GET',
      headers,
    });

    console.log(`GitHub test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('GitHub connectivity test failed:', error);
    return false;
  }
}

// GitLab connectivity test
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
      const token = credentials['Personal Access Token'] || '';
      headers['PRIVATE-TOKEN'] = token;
    }

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers,
    });

    console.log(`GitLab test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('GitLab connectivity test failed:', error);
    return false;
  }
}

// ServiceNow connectivity test
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

    if (authType === 'basic_auth' && credentials) {
      const username = credentials['Username'] || '';
      const password = credentials['Password'] || '';
      headers['Authorization'] = `Basic ${btoa(`${username}:${password}`)}`;
    } else if (authType === 'oauth2' && credentials) {
      // For OAuth2, we'd need to get a token first - simplified test
      const clientId = credentials['Client ID'] || '';
      const clientSecret = credentials['Client Secret'] || '';
      const tokenUrl = credentials['Token URL'] || '';
      
      if (tokenUrl && clientId && clientSecret) {
        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });
        
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          headers['Authorization'] = `Bearer ${tokenData.access_token}`;
        }
      }
    }

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers,
    });

    console.log(`ServiceNow test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('ServiceNow connectivity test failed:', error);
    return false;
  }
}

// Jenkins connectivity test
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

    if (authType === 'username_token' && credentials) {
      const username = credentials['Username'] || '';
      const token = credentials['API Token'] || '';
      headers['Authorization'] = `Basic ${btoa(`${username}:${token}`)}`;
    }

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers,
    });

    console.log(`Jenkins test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('Jenkins connectivity test failed:', error);
    return false;
  }
}

// Cloud Foundry connectivity test
async function testCloudFoundryConnectivity(
  url: string, 
  authType: string, 
  credentials: Record<string, string> | null
): Promise<boolean> {
  try {
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const apiUrl = `${baseUrl}/v3/info`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (authType === 'oauth2' && credentials) {
      const clientId = credentials['Client ID'] || '';
      const clientSecret = credentials['Client Secret'] || '';
      const tokenUrl = credentials['Token URL'] || '';
      
      if (tokenUrl && clientId && clientSecret) {
        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
          }),
        });
        
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          headers['Authorization'] = `Bearer ${tokenData.access_token}`;
        }
      }
    }

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers,
    });

    console.log(`Cloud Foundry test response status: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('Cloud Foundry connectivity test failed:', error);
    return false;
  }
}

// Generic connectivity test
async function testGenericConnectivity(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
    });
    console.log(`Generic test response status: ${response.status}`);
    return response.ok || response.status === 405; // Some servers don't support HEAD
  } catch (error) {
    console.error('Generic connectivity test failed:', error);
    return false;
  }
}
