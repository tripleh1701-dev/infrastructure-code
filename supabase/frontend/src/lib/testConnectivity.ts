import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

interface TestConnectivityParams {
  connector: string;
  url: string;
  credentialId?: string;
  credentialName?: string;
  accountId?: string;
}

interface TestConnectivityResult {
  success: boolean;
  message?: string;
}

/**
 * Validate credential data before sending to the server.
 * Returns an error message if invalid, or null if valid.
 */
function validateCredentialFormat(
  connector: string,
  authType: string,
  credentialData: Record<string, string> | null
): string | null {
  if (!credentialData) return null;
  const key = connector.toLowerCase().replace(/[\s_-]+/g, "");

  // Helper to get a value from multiple possible field labels
  const get = (...keys: string[]) =>
    keys.reduce((v, k) => v || credentialData[k] || "", "");

  switch (key) {
    case "github": {
      if (authType === "personal_access_token") {
        const token = get("Personal Access Token", "Token", "token");
        if (!token) return "GitHub PAT token is empty.";
        if (!/^(ghp_|github_pat_).{27,}$/.test(token))
          return "Invalid GitHub PAT — must start with ghp_ or github_pat_ and be ≥ 30 characters.";
      }
      break;
    }
    case "gitlab": {
      if (authType === "personal_access_token") {
        const token = get("Personal Access Token", "Token", "token");
        if (!token) return "GitLab PAT token is empty.";
        if (token.length < 20)
          return "Invalid GitLab PAT — token must be at least 20 characters (typically starts with glpat-).";
      }
      break;
    }
    case "jira": {
      if (authType === "username_api_key" || authType === "basic_auth") {
        const username = get("Username", "username", "Email");
        const apiKey = get("API Key", "apiKey", "api_key", "API Token");
        if (!username) return "Jira username / email is empty.";
        if (!apiKey) return "Jira API token is empty.";
        if (apiKey.length < 10)
          return "Invalid Jira API token — must be at least 10 characters.";
      }
      break;
    }
    case "jenkins": {
      if (authType === "username_token" || authType === "username_api_key" || authType === "basic_auth") {
        const username = get("Username", "username");
        const token = get("API Token", "API Key", "token");
        if (!username) return "Jenkins username is empty.";
        if (!token) return "Jenkins API token is empty.";
      }
      break;
    }
    case "bitbucket": {
      if (authType === "app_password" || authType === "basic_auth") {
        const username = get("Username", "username");
        const password = get("App Password", "Password", "password");
        if (!username) return "Bitbucket username is empty.";
        if (!password) return "Bitbucket app password is empty.";
      }
      break;
    }
    case "azuredevops": {
      if (authType === "personal_access_token") {
        const token = get("Personal Access Token", "Token", "token");
        if (!token) return "Azure DevOps PAT is empty.";
        if (token.length < 30)
          return "Invalid Azure DevOps PAT — must be at least 30 characters.";
      }
      break;
    }
    case "servicenow": {
      if (authType === "basic_auth" || authType === "username_password") {
        const username = get("Username", "username");
        const password = get("Password", "password");
        if (!username) return "ServiceNow username is empty.";
        if (!password) return "ServiceNow password is empty.";
      } else if (authType === "oauth2") {
        const clientId = get("Client ID", "client_id");
        const clientSecret = get("Client Secret", "client_secret");
        if (!clientId) return "ServiceNow Client ID is empty.";
        if (!clientSecret) return "ServiceNow Client Secret is empty.";
      }
      break;
    }
    case "cloudfoundry": {
      if (authType === "oauth2") {
        const clientId = get("Client ID", "client_id");
        const clientSecret = get("Client Secret", "client_secret");
        const tokenUrl = get("Token URL", "token_url");
        if (!clientId) return "Cloud Foundry Client ID is empty.";
        if (!clientSecret) return "Cloud Foundry Client Secret is empty.";
        if (!tokenUrl) return "Cloud Foundry Token URL is empty.";
      }
      break;
    }
    case "sonarqube": {
      const token = get("Token", "token", "API Key", "apiKey");
      if (!token) return "SonarQube token is empty.";
      break;
    }
    case "slack": {
      const token = get("Bot Token", "Token", "token");
      if (!token) return "Slack bot token is empty.";
      if (!/^xoxb-/.test(token))
        return "Invalid Slack bot token — must start with xoxb-.";
      break;
    }
  }

  return null;
}

/**
 * Shared helper that tests connector connectivity.
 * For edge-function mode it fetches credential data client-side and passes it
 * directly so the edge function doesn't need to call back to the DB.
 */
export async function testConnectivity(params: TestConnectivityParams): Promise<TestConnectivityResult> {
  const { connector, url, credentialId, credentialName, accountId } = params;

  if (isExternalApi()) {
    const { data, error } = await httpClient.post<TestConnectivityResult>("/connectors/test-connection", {
      connector,
      url,
      credentialId,
      credentialName,
      accountId,
    });
    if (error) throw new Error(error.message);
    return data!;
  }

  // Edge function path: resolve credential data client-side first
  let authType = "";
  let credentialData: Record<string, string> | null = null;

  if (credentialId) {
    const { data: cred, error: credErr } = await (supabase as any)
      .from("credentials")
      .select("auth_type, credentials")
      .eq("id", credentialId)
      .single();

    if (!credErr && cred) {
      authType = cred.auth_type || "";
      credentialData = cred.credentials as Record<string, string> | null;
    }
  }

  // Client-side format validation before hitting the network
  const validationError = validateCredentialFormat(connector, authType, credentialData);
  if (validationError) {
    return { success: false, message: validationError };
  }

  const { data, error } = await supabase.functions.invoke("test-connector-connectivity", {
    body: {
      connector,
      url,
      credentialId,
      authType,
      credentialData,
    },
  });
  if (error) throw error;
  return data as TestConnectivityResult;
}
