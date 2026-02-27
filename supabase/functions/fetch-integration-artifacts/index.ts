import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ARTIFACT_COLLECTIONS = [
  "IntegrationDesigntimeArtifacts",
  "ValueMappingDesigntimeArtifacts",
  "ScriptCollectionDesigntimeArtifacts",
  "MessageMappingDesigntimeArtifacts",
  "MessageResourcesDesigntimeArtifacts",
] as const;

async function resolveAuthHeader(body: any): Promise<string> {
  const authType = (body.authenticationType || "").toLowerCase();

  if (authType === "oauth2") {
    if (!body.oauth2TokenUrl || !body.oauth2ClientId || !body.oauth2ClientSecret) {
      throw new Error("OAuth2 requires oauth2TokenUrl, oauth2ClientId, oauth2ClientSecret");
    }
    const encoded = btoa(`${body.oauth2ClientId}:${body.oauth2ClientSecret}`);
    const resp = await fetch(body.oauth2TokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${encoded}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`OAuth2 token failed [${resp.status}]: ${text}`);
    }
    const json = await resp.json();
    return `Bearer ${json.access_token}`;
  }

  // Basic or Username+API Key
  if (!body.username || !body.apiKey) {
    throw new Error("Basic auth requires username and apiKey");
  }
  return `Basic ${btoa(`${body.username}:${body.apiKey}`)}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { apiUrl } = body;

    if (!apiUrl) {
      return new Response(
        JSON.stringify({ success: false, message: "apiUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = await resolveAuthHeader(body);
    const packagesUrl = apiUrl.replace(/\/$/, "");

    // 1. Fetch packages
    const pkgResp = await fetch(packagesUrl, {
      headers: { Authorization: authHeader, Accept: "application/json" },
    });

    if (!pkgResp.ok) {
      const text = await pkgResp.text();
      return new Response(
        JSON.stringify({ success: false, message: `CPI call failed [${pkgResp.status}]: ${text}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pkgJson = await pkgResp.json();
    const packages = pkgJson?.d?.results ?? pkgJson?.d ?? pkgJson?.results ?? [];

    // 2. Enrich each package with artifact collections
    const baseUrl = packagesUrl.replace(/\/IntegrationPackages$/i, "");

    const enriched = await Promise.all(
      packages.map(async (pkg: any) => {
        const artifactResults = await Promise.all(
          ARTIFACT_COLLECTIONS.map(async (collection) => {
            try {
              const url = `${baseUrl}/IntegrationPackages('${pkg.Id}')/${collection}`;
              const resp = await fetch(url, {
                headers: { Authorization: authHeader, Accept: "application/json" },
              });
              if (!resp.ok) return { collection, artifacts: [] };
              const json = await resp.json();
              const artifacts = json?.d?.results ?? json?.d ?? json?.results ?? [];
              return { collection, artifacts };
            } catch {
              return { collection, artifacts: [] };
            }
          })
        );

        const result: Record<string, any> = {
          Name: pkg.Name,
          Version: pkg.Version,
          Id: pkg.Id,
        };

        for (const { collection, artifacts } of artifactResults) {
          result[collection] = artifacts.map((a: any) => ({
            Name: a.Name,
            Version: a.Version,
            Id: a.Id,
          }));
        }

        return result;
      })
    );

    return new Response(
      JSON.stringify({ success: true, data: enriched, count: enriched.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("fetch-integration-artifacts error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
