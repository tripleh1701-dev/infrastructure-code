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

      const authenticationType = connector.authenticationType || "Basic";

      // Resolve credential details from the credential name
      let credentialData: Record<string, any> = {};
      const credName = connector.apiCredentialName || connector.credentialName;

      if (credName) {
        credentialData = await resolveCredential(credName, accountId);
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
      if (authenticationType.toLowerCase() === "oauth2") {
        payload.oauth2ClientId = connector.oauth2ClientId || credentialData.client_id || credentialData.oauth2ClientId || "";
        payload.oauth2ClientSecret = connector.oauth2ClientSecret || credentialData.client_secret || credentialData.oauth2ClientSecret || "";
        payload.oauth2TokenUrl = connector.oauth2TokenUrl || credentialData.token_url || credentialData.oauth2TokenUrl || "";
      } else {
        payload.username = connector.username || credentialData.username || "";
        payload.apiKey = connector.apiKey || credentialData.api_key || credentialData.apiKey || credentialData.password || "";
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
      return cred?.credentials ?? cred ?? {};
    }

    const { data, error } = await supabase
      .from("credentials")
      .select("*")
      .eq("account_id", accountId)
      .eq("name", credentialName)
      .maybeSingle();

    if (error || !data) return {};
    return (data as any).credentials ?? {};
  } catch {
    return {};
  }
}
