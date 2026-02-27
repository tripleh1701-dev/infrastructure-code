/**
 * Connectors API Service
 *
 * Provides connector CRUD operations with automatic provider switching
 * (Supabase ↔ NestJS/DynamoDB).
 */

import { httpClient } from "@/lib/api/http-client";
import { isExternalApi } from "@/lib/api/config";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Connector {
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

export interface UpdateConnectorInput {
  name?: string;
  description?: string;
  url?: string;
  status?: string;
  credential_id?: string | null;
  health?: string;
  last_sync_at?: string;
  sync_count?: number;
}

// ─── Category → Type Map ─────────────────────────────────────────────────────

const CATEGORY_TYPE_MAP: Record<string, string> = {
  Plan: "Project Management",
  Code: "Source Control",
  Build: "CI/CD",
  Test: "Testing",
  Deploy: "Integration Platform",
  Approval: "Communication",
  Release: "IT Service Management",
  Others: "Monitoring",
};

// ─── Service ──────────────────────────────────────────────────────────────────

// Map camelCase API response to snake_case frontend interface
function mapExternalConnector(c: any): Connector {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    connector_type: c.connectorType ?? c.connector_type ?? '',
    connector_tool: c.connectorTool ?? c.connector_tool ?? '',
    category: c.category ?? '',
    url: c.url ?? null,
    status: c.status ?? 'connected',
    health: c.health ?? 'healthy',
    last_sync_at: c.lastSyncAt ?? c.last_sync_at ?? null,
    sync_count: c.syncCount ?? c.sync_count ?? 0,
    account_id: c.accountId ?? c.account_id ?? '',
    enterprise_id: c.enterpriseId ?? c.enterprise_id ?? '',
    product_id: c.productId ?? c.product_id ?? null,
    service_id: c.serviceId ?? c.service_id ?? null,
    credential_id: c.credentialId ?? c.credential_id ?? null,
    created_at: c.createdAt ?? c.created_at ?? '',
    updated_at: c.updatedAt ?? c.updated_at ?? '',
    workstreams: (c.workstreams || []).map((w: any) => ({ id: w.id, name: w.name })),
  };
}

export const connectorsService = {
  async getAll(accountId: string, enterpriseId: string): Promise<Connector[]> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.get<any[]>("/connectors", {
        params: { accountId, enterpriseId },
      });
      if (error) throw new Error(error.message);
      return (data || []).map(mapExternalConnector);
    }

    let query = supabase
      .from("connectors" as any)
      .select(`*, connector_workstreams(workstream:workstreams(id, name))`)
      .order("created_at", { ascending: false });

    if (accountId) query = query.eq("account_id", accountId);
    if (enterpriseId) query = query.eq("enterprise_id", enterpriseId);

    const { data, error } = await query;
    if (error) throw error;

    return ((data as any[]) || []).map((conn: any) => ({
      ...conn,
      workstreams:
        conn.connector_workstreams
          ?.map((cw: any) => cw.workstream)
          .filter(Boolean) || [],
    })) as Connector[];
  },

  async create(input: CreateConnectorInput): Promise<Connector> {
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
      const { data, error } = await httpClient.post<any>("/connectors", payload);
      if (error) throw new Error(error.message);
      return mapExternalConnector(data);
    }

    const insertData = {
      name: input.name,
      description: input.description || null,
      connector_type: CATEGORY_TYPE_MAP[input.category] || input.category,
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

    if (input.workstream_ids.length > 0) {
      const entries = input.workstream_ids.map((wsId) => ({
        connector_id: connector.id,
        workstream_id: wsId,
      }));
      const { error: wsError } = await (supabase
        .from("connector_workstreams" as any)
        .insert(entries) as any);
      if (wsError) console.error("Failed to create connector workstreams:", wsError);
    }

    return connector as Connector;
  },

  async update(id: string, updates: UpdateConnectorInput): Promise<Connector> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.put<Connector>(`/connectors/${id}`, updates);
      if (error) throw new Error(error.message);
      return data!;
    }

    const { data, error } = await (supabase
      .from("connectors" as any)
      .update(updates)
      .eq("id", id)
      .select()
      .single() as any);

    if (error) throw error;
    return data as Connector;
  },

  async delete(id: string): Promise<void> {
    if (isExternalApi()) {
      const { error } = await httpClient.delete(`/connectors/${id}`);
      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await (supabase
      .from("connectors" as any)
      .delete()
      .eq("id", id) as any);
    if (error) throw error;
  },
};
