import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const OAUTH_PROVIDERS: Record<string, {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
}> = {
  GitHub: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:user", "user:email"],
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
  GitLab: {
    authUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    scopes: ["read_user", "read_api", "read_repository"],
    clientIdEnv: "GITLAB_CLIENT_ID",
    clientSecretEnv: "GITLAB_CLIENT_SECRET",
  },
  Slack: {
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["chat:write", "channels:read"],
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
};

function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  console.log(`[OAuth] Path: ${path}`);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (path === "initiate") {
      const body = await req.json();
      const { provider, credentialId, redirectUri } = body;

      console.log(`[OAuth] Initiate: ${provider}`);

      const config = OAUTH_PROVIDERS[provider];
      if (!config) {
        return new Response(
          JSON.stringify({ error: `Unsupported provider: ${provider}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const clientId = Deno.env.get(config.clientIdEnv);
      if (!clientId) {
        return new Response(
          JSON.stringify({ 
            error: `OAuth not configured. Add ${config.clientIdEnv} secret.`,
            missingSecrets: [config.clientIdEnv, config.clientSecretEnv]
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const state = generateState();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await supabase.from("oauth_states").insert({
        state,
        credential_id: credentialId,
        provider,
        redirect_uri: redirectUri,
        expires_at: expiresAt.toISOString(),
      });

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: config.scopes.join(" "),
        state,
        response_type: "code",
      });

      return new Response(
        JSON.stringify({ 
          authorizationUrl: `${config.authUrl}?${params}`,
          state,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (path === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error || !code || !state) {
        return createRedirect(false, error || "Missing params");
      }

      const { data: stateData } = await supabase
        .from("oauth_states")
        .select("*")
        .eq("state", state)
        .single();

      if (!stateData || new Date(stateData.expires_at) < new Date()) {
        return createRedirect(false, "Invalid state");
      }

      const config = OAUTH_PROVIDERS[stateData.provider];
      const clientId = Deno.env.get(config.clientIdEnv)!;
      const clientSecret = Deno.env.get(config.clientSecretEnv)!;

      const tokenRes = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: stateData.redirect_uri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        return createRedirect(false, "Token exchange failed");
      }

      await supabase
        .from("credentials")
        .update({
          oauth_access_token: tokenData.access_token,
          oauth_refresh_token: tokenData.refresh_token || null,
          oauth_token_expires_at: tokenData.expires_in 
            ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() 
            : null,
          status: "active",
        })
        .eq("id", stateData.credential_id);

      await supabase.from("oauth_states").delete().eq("state", state);

      return createRedirect(true, null, stateData.credential_id);
    }

    return new Response(
      JSON.stringify({ error: "Unknown endpoint" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[OAuth] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function createRedirect(success: boolean, error: string | null, credentialId?: string) {
  // Redirect to frontend OAuth callback page that will handle closing the window
  const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://id-preview--ed32265e-327c-4494-8dd8-578313d6d16a.lovable.app";
  const params = new URLSearchParams({
    oauth_status: success ? "success" : "error",
    ...(error && { oauth_error: error }),
    ...(credentialId && { credential_id: credentialId }),
  });

  return new Response(null, {
    status: 302,
    headers: { 
      "Location": `${frontendUrl}/oauth-callback?${params}`,
    },
  });
}
