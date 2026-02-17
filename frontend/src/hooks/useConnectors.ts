import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface ConnectorRecord {
  id: string;
  name: string;
  description: string | null;
  connector_type: string;
  connector_tool: string;
  category: string;
  url: string | null;
  status: "connected" | "disconnected";
  health: "healthy" | "warning" | "error";
  last_sync_at: string | null;
  sync_count: number;
  account_id: string;
  enterprise_id: string;
  product_id: string | null;
  service_id: string | null;
  credential_id: string | null;
  created_at: string;
  updated_at: string;
  workstreams?: { id: string; name: string }[];
}

export interface CreateConnectorInput {
  name: string;
  description?: string;
  connector_type: string;
  connector_tool: string;
  category: string;
  url?: string;
  account_id: string;
  enterprise_id: string;
  product_id?: string;
  service_id?: string;
  credential_id?: string;
  workstream_ids: string[];
}

function mapExternalConnector(c: any): ConnectorRecord {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    connector_type: c.connectorType ?? c.connector_type ?? "",
    connector_tool: c.connectorTool ?? c.connector_tool ?? "",
    category: c.category ?? "",
    url: c.url ?? null,
    status: c.status ?? "disconnected",
    health: c.health ?? "healthy",
    last_sync_at: c.lastSyncAt ?? c.last_sync_at ?? null,
    sync_count: c.syncCount ?? c.sync_count ?? 0,
    account_id: c.accountId ?? c.account_id ?? "",
    enterprise_id: c.enterpriseId ?? c.enterprise_id ?? "",
    product_id: c.productId ?? c.product_id ?? null,
    service_id: c.serviceId ?? c.service_id ?? null,
    credential_id: c.credentialId ?? c.credential_id ?? null,
    created_at: c.createdAt ?? c.created_at ?? "",
    updated_at: c.updatedAt ?? c.updated_at ?? "",
    workstreams: c.workstreams ?? [],
  };
}

export function useConnectors(accountId?: string, enterpriseId?: string) {
  const queryClient = useQueryClient();

  const { data: connectors = [], isLoading, refetch } = useQuery({
    queryKey: ["connectors", accountId, enterpriseId],
    queryFn: async () => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<any[]>("/api/connectors", {
          params: { accountId, enterpriseId },
        });
        if (error) throw new Error(error.message);
        return (data || []).map(mapExternalConnector) as ConnectorRecord[];
      }

      let query = supabase
        .from("connectors" as any)
        .select(`
          *,
          connector_workstreams(
            workstream:workstreams(id, name)
          )
        `)
        .order("created_at", { ascending: false });

      if (accountId) query = query.eq("account_id", accountId);
      if (enterpriseId) query = query.eq("enterprise_id", enterpriseId);

      const { data, error } = await query;
      if (error) throw error;

      return ((data as any[]) || []).map((conn: any) => ({
        ...conn,
        workstreams: conn.connector_workstreams
          ?.map((cw: any) => cw.workstream)
          .filter(Boolean) || [],
      })) as ConnectorRecord[];
    },
    enabled: !!accountId && !!enterpriseId,
  });

  const createConnector = useMutation({
    mutationFn: async (input: CreateConnectorInput) => {
      if (isExternalApi()) {
        const payload = {
          name: input.name,
          description: input.description,
          connectorType: input.connector_type,
          connectorTool: input.connector_tool,
          category: input.category,
          url: input.url,
          accountId: input.account_id,
          enterpriseId: input.enterprise_id,
          productId: input.product_id,
          serviceId: input.service_id,
          credentialId: input.credential_id,
          workstreamIds: input.workstream_ids,
        };
        const { data, error } = await httpClient.post<ConnectorRecord>("/api/connectors", payload);
        if (error) throw new Error(error.message);
        return data;
      }

      // Determine connector_type from category
      const categoryTypeMap: Record<string, string> = {
        Plan: "Project Management",
        Code: "Source Control",
        Build: "CI/CD",
        Test: "Testing",
        Deploy: "Integration Platform",
        Approval: "Communication",
        Release: "IT Service Management",
        Others: "Monitoring",
      };

      const insertData = {
        name: input.name,
        description: input.description || null,
        connector_type: categoryTypeMap[input.category] || input.category,
        connector_tool: input.connector_tool,
        category: input.category,
        url: input.url || null,
        account_id: input.account_id,
        enterprise_id: input.enterprise_id,
        product_id: input.product_id || null,
        service_id: input.service_id || null,
        credential_id: input.credential_id || null,
        status: "connected",
        health: "healthy",
      };

      const { data: connector, error } = await (supabase
        .from("connectors" as any)
        .insert(insertData)
        .select()
        .single() as any);

      if (error) throw error;

      // Create connector_workstreams
      if (input.workstream_ids.length > 0) {
        const entries = input.workstream_ids.map(wsId => ({
          connector_id: connector.id,
          workstream_id: wsId,
        }));

        const { error: wsError } = await (supabase
          .from("connector_workstreams" as any)
          .insert(entries) as any);

        if (wsError) console.error("Failed to create connector workstreams:", wsError);
      }

      return connector;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
      toast.success("Connector created successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to create connector: " + error.message);
    },
  });

  const deleteConnector = useMutation({
    mutationFn: async (id: string) => {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/api/connectors/${id}`);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await (supabase
        .from("connectors" as any)
        .delete()
        .eq("id", id) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
      toast.success("Connector deleted successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete connector: " + error.message);
    },
  });

  const updateConnector = useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; description?: string; url?: string; status?: string; credential_id?: string | null }) => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.put<ConnectorRecord>(`/api/connectors/${id}`, input);
        if (error) throw new Error(error.message);
        return data;
      }

      const { data, error } = await (supabase
        .from("connectors" as any)
        .update(input)
        .eq("id", id)
        .select()
        .single() as any);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
      toast.success("Connector updated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to update connector: " + error.message);
    },
  });

  return {
    connectors,
    isLoading,
    refetch,
    createConnector,
    deleteConnector,
    updateConnector,
  };
}
