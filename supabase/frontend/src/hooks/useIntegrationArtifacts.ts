import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { toast } from "sonner";
import type { EnvironmentRecord, EnvironmentConnectorRecord } from "@/hooks/useEnvironments";

export interface ArtifactItem {
  Name: string;
  Version: string;
  Id: string;
}

export interface IntegrationPackage {
  Name: string;
  Version: string;
  Id: string;
  IntegrationDesigntimeArtifacts: ArtifactItem[];
  ValueMappingDesigntimeArtifacts: ArtifactItem[];
  ScriptCollectionDesigntimeArtifacts: ArtifactItem[];
  MessageMappingDesigntimeArtifacts: ArtifactItem[];
  MessageResourcesDesigntimeArtifacts: ArtifactItem[];
}

export interface FetchPackagesResult {
  success: boolean;
  data: IntegrationPackage[];
  count: number;
  message?: string;
}

export function useIntegrationArtifacts() {
  const [packages, setPackages] = useState<IntegrationPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Given an environment and its Cloud Foundry connector, resolve credentials
   * and fetch integration packages from SAP CPI.
   */
  async function fetchPackages(
    environment: EnvironmentRecord,
    connector: EnvironmentConnectorRecord,
    accountId: string,
    enterpriseId: string,
  ) {
    setLoading(true);
    setError(null);
    setPackages([]);

    try {
      const apiUrl = connector.apiUrl;
      if (!apiUrl) throw new Error("Cloud Foundry connector is missing apiUrl");

      // Resolve credential details from the credential name
      let credentialData: Record<string, any> = {};
      const credName = connector.apiCredentialName || connector.credentialName;

      if (credName) {
        credentialData = await resolveCredential(credName, accountId);
      }

      const authenticationType = resolveAuthenticationType(connector, credentialData);
      if (!authenticationType) {
        throw new Error("Authentication type could not be resolved from environment connector or credential");
      }

      // Build request payload
      const payload: Record<string, any> = {
        apiUrl: apiUrl.replace(/\/$/, "") + (apiUrl.includes("/IntegrationPackages") ? "" : "/api/v1/IntegrationPackages"),
        authenticationType,
        accountId,
        enterpriseId,
        environmentName: environment.name,
        credentialName: credName || "",
      };

      // Attach auth-specific fields
      // Credential JSON stores values keyed by UI field labels (e.g. "Username", "API Key", "Client ID")
      // so we check both label-based keys and snake_case/camelCase variants
      if (authenticationType.toLowerCase() === "oauth2") {
        payload.oauth2ClientId = connector.oauth2ClientId || credentialData["Client ID"] || credentialData.client_id || credentialData.oauth2ClientId || "";
        payload.oauth2ClientSecret = connector.oauth2ClientSecret || credentialData["Client Secret"] || credentialData.client_secret || credentialData.oauth2ClientSecret || "";
        payload.oauth2TokenUrl = connector.oauth2TokenUrl || credentialData["Token URL"] || credentialData.token_url || credentialData.oauth2TokenUrl || "";
      } else {
        payload.username = connector.username || credentialData["Username"] || credentialData.username || "";
        payload.apiKey = connector.apiKey || credentialData["API Key"] || credentialData.api_key || credentialData.apiKey || credentialData["Password"] || credentialData.password || "";
      }

      let result: FetchPackagesResult;

      if (isExternalApi()) {
        const { data, error: httpErr } = await httpClient.post<FetchPackagesResult>(
          "/integration-artifacts/fetch-packages",
          payload,
        );
        if (httpErr) throw new Error(httpErr.message);
        result = data!;
      } else {
        const { data, error: fnErr } = await supabase.functions.invoke(
          "fetch-integration-artifacts",
          { body: payload },
        );
        if (fnErr) throw fnErr;
        result = data as FetchPackagesResult;
      }

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch packages");
      }

      setPackages(result.data);
      toast.success(`Fetched ${result.count} integration package(s)`);
    } catch (err: any) {
      const msg = err?.message || "Unknown error fetching artifacts";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPackages([]);
    setError(null);
    setLoading(false);
  }

  return { packages, loading, error, fetchPackages, reset };
}

/**
 * Resolve auth type from connector first, then credential metadata/shape.
 */
function resolveAuthenticationType(
  connector: EnvironmentConnectorRecord,
  credentialData: Record<string, any>,
): string {
  const explicitType = connector.authenticationType?.trim();
  if (explicitType) return explicitType;

  const credentialAuthType = (
    credentialData.__authType ||
    credentialData.authType ||
    credentialData.auth_type ||
    ""
  )
    .toString()
    .toLowerCase();

  if (credentialAuthType === "oauth" || credentialAuthType === "oauth2") return "OAuth2";
  if (
    credentialAuthType === "basic" ||
    credentialAuthType === "username_api_key" ||
    credentialAuthType === "username and api key"
  ) {
    return "Basic";
  }

  const hasOauthFields = Boolean(
    credentialData["Client ID"] ||
      credentialData.client_id ||
      credentialData.oauth2ClientId ||
      credentialData["Client Secret"] ||
      credentialData.client_secret ||
      credentialData.oauth2ClientSecret ||
      credentialData["Token URL"] ||
      credentialData.token_url ||
      credentialData.oauth2TokenUrl,
  );
  if (hasOauthFields) return "OAuth2";

  const hasBasicFields = Boolean(
    credentialData["Username"] ||
      credentialData.username ||
      credentialData["API Key"] ||
      credentialData.api_key ||
      credentialData.apiKey ||
      credentialData["Password"] ||
      credentialData.password,
  );
  if (hasBasicFields) return "Basic";

  return "";
}

/**
 * Resolve credential secrets by name from the credentials table / API.
 */
async function resolveCredential(
  credentialName: string,
  accountId: string,
): Promise<Record<string, any>> {
  try {
    if (isExternalApi()) {
      const { data, error } = await httpClient.get<any[]>("/credentials", {
        params: { accountId },
      });
      if (error || !data) return {};
      const cred = data.find(
        (c: any) => c.name === credentialName || c.credentialName === credentialName,
      );
      if (!cred) return {};
      return {
        ...(cred.credentials ?? {}),
        __authType: cred.authType ?? cred.auth_type ?? "",
      };
    }

    const { data, error } = await supabase
      .from("credentials")
      .select("*")
      .eq("account_id", accountId)
      .eq("name", credentialName)
      .maybeSingle();

    if (error || !data) return {};
    return {
      ...((data as any).credentials ?? {}),
      __authType: (data as any).auth_type ?? (data as any).authType ?? "",
    };
  } catch {
    return {};
  }
}
