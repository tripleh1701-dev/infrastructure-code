import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface EnvironmentConnectorRecord {
  id?: string;
  category?: string;
  connector?: string;
  connectorIconName?: string;
  environmentType?: string;
  apiUrl?: string;
  apiCredentialName?: string;
  iflowUrl?: string;
  iflowCredentialName?: string;
  hostUrl?: string;
  authenticationType?: string;
  credentialName?: string;
  oauth2ClientId?: string;
  oauth2ClientSecret?: string;
  oauth2TokenUrl?: string;
  username?: string;
  apiKey?: string;
  url?: string;
  personalAccessToken?: string;
  githubInstallationId?: string;
  githubApplicationId?: string;
  githubPrivateKey?: string;
  status?: boolean;
  description?: string;
}

export interface EnvironmentRecord {
  id: string;
  name: string;
  description: string | null;
  account_id: string;
  enterprise_id: string;
  workstream_id: string | null;
  product_id: string | null;
  service_id: string | null;
  connector_name: string | null;
  connectivity_status: string;
  scope: string | null;
  entity: string | null;
  connector_icon_name: string | null;
  connectors: EnvironmentConnectorRecord[];
  created_at: string;
  updated_at: string;
  // Resolved names for display
  workstream?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
  service?: { id: string; name: string } | null;
}

export interface CreateEnvironmentInput {
  name: string;
  description?: string;
  account_id: string;
  enterprise_id: string;
  workstream_id?: string;
  product_id?: string;
  service_id?: string;
  connector_name?: string;
  connectivity_status?: string;
  scope?: string;
  entity?: string;
  connector_icon_name?: string;
  connectors?: EnvironmentConnectorRecord[];
}

export interface UpdateEnvironmentInput {
  name?: string;
  description?: string;
  workstream_id?: string | null;
  product_id?: string | null;
  service_id?: string | null;
  connector_name?: string | null;
  connectivity_status?: string;
  scope?: string | null;
  entity?: string | null;
  connector_icon_name?: string | null;
  connectors?: EnvironmentConnectorRecord[];
}

function mapExternalEnvironment(e: any): EnvironmentRecord {
  return {
    id: e.id,
    name: e.name ?? "",
    description: e.description ?? null,
    account_id: e.accountId ?? e.account_id ?? "",
    enterprise_id: e.enterpriseId ?? e.enterprise_id ?? "",
    workstream_id: e.workstreamId ?? e.workstream_id ?? null,
    product_id: e.productId ?? e.product_id ?? null,
    service_id: e.serviceId ?? e.service_id ?? null,
    connector_name: e.connectorName ?? e.connector_name ?? null,
    connectivity_status: e.connectivityStatus ?? e.connectivity_status ?? "unknown",
    scope: e.scope ?? null,
    entity: e.entity ?? null,
    connector_icon_name: e.connectorIconName ?? e.connector_icon_name ?? null,
    connectors: e.connectors ?? [],
    created_at: e.createdAt ?? e.created_at ?? "",
    updated_at: e.updatedAt ?? e.updated_at ?? "",
    workstream: e.workstream ?? null,
    product: e.product ?? null,
    service: e.service ?? null,
  };
}

export function useEnvironments(accountId?: string, enterpriseId?: string) {
  const queryClient = useQueryClient();

  const { data: environments = [], isLoading, refetch } = useQuery({
    queryKey: ["environments", accountId, enterpriseId],
    queryFn: async () => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<any[]>("/environments", {
          params: { accountId, enterpriseId },
        });
        if (error) throw new Error(error.message);
        return (data || []).map(mapExternalEnvironment);
      }

      const { data, error } = await (supabase
        .from("environments" as any)
        .select("*")
        .eq("account_id", accountId)
        .eq("enterprise_id", enterpriseId)
        .order("created_at", { ascending: false }) as any);

      if (error) throw error;
      return (data || []) as EnvironmentRecord[];
    },
    enabled: !!accountId && !!enterpriseId,
  });

  const createEnvironment = useMutation({
    mutationFn: async (input: CreateEnvironmentInput) => {
      if (isExternalApi()) {
        const payload = {
          name: input.name,
          description: input.description,
          accountId: input.account_id,
          enterpriseId: input.enterprise_id,
          workstreamId: input.workstream_id,
          productId: input.product_id,
          serviceId: input.service_id,
          connectorName: input.connector_name,
          connectivityStatus: input.connectivity_status || "unknown",
          scope: input.scope,
          entity: input.entity,
          connectorIconName: input.connector_icon_name,
          connectors: input.connectors || [],
        };
        const { data, error } = await httpClient.post<any>("/environments", payload);
        if (error) throw new Error(error.message);
        return mapExternalEnvironment(data);
      }

      const insertData = {
        name: input.name,
        description: input.description || null,
        account_id: input.account_id,
        enterprise_id: input.enterprise_id,
        workstream_id: input.workstream_id || null,
        product_id: input.product_id || null,
        service_id: input.service_id || null,
        connector_name: input.connector_name || null,
        connectivity_status: input.connectivity_status || "unknown",
        scope: input.scope || null,
        entity: input.entity || null,
        connector_icon_name: input.connector_icon_name || null,
        connectors: input.connectors || [],
      };

      const { data, error } = await (supabase
        .from("environments" as any)
        .insert(insertData)
        .select()
        .single() as any);

      if (error) throw error;
      return data as EnvironmentRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["environments"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to create environment: " + error.message);
    },
  });

  const updateEnvironment = useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & UpdateEnvironmentInput) => {
      if (isExternalApi()) {
        const payload: Record<string, any> = {};
        if (input.name !== undefined) payload.name = input.name;
        if (input.description !== undefined) payload.description = input.description;
        if (input.workstream_id !== undefined) payload.workstreamId = input.workstream_id;
        if (input.product_id !== undefined) payload.productId = input.product_id;
        if (input.service_id !== undefined) payload.serviceId = input.service_id;
        if (input.connector_name !== undefined) payload.connectorName = input.connector_name;
        if (input.connectivity_status !== undefined) payload.connectivityStatus = input.connectivity_status;
        if (input.scope !== undefined) payload.scope = input.scope;
        if (input.entity !== undefined) payload.entity = input.entity;
        if (input.connector_icon_name !== undefined) payload.connectorIconName = input.connector_icon_name;
        if (input.connectors !== undefined) payload.connectors = input.connectors;
        const { data, error } = await httpClient.put<any>(`/environments/${id}`, payload);
        if (error) throw new Error(error.message);
        return mapExternalEnvironment(data);
      }

      const { data, error } = await (supabase
        .from("environments" as any)
        .update(input)
        .eq("id", id)
        .select()
        .single() as any);

      if (error) throw error;
      return data as EnvironmentRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["environments"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to update environment: " + error.message);
    },
  });

  const deleteEnvironment = useMutation({
    mutationFn: async (id: string) => {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/environments/${id}`);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await (supabase
        .from("environments" as any)
        .delete()
        .eq("id", id) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["environments"] });
      toast.success("Environment deleted successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete environment: " + error.message);
    },
  });

  return {
    environments,
    isLoading,
    refetch,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
  };
}
