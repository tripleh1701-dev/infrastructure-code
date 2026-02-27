/**
 * Credentials API Service
 *
 * Provides credential CRUD, rotation, and OAuth operations with automatic
 * provider switching (Supabase ↔ NestJS/DynamoDB).
 */

import { httpClient } from "@/lib/api/http-client";
import { isExternalApi } from "@/lib/api/config";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Credential {
  id: string;
  name: string;
  description: string | null;
  account_id: string;
  enterprise_id: string;
  workstream_id: string | null;
  product_id: string | null;
  service_id: string | null;
  category: string;
  connector: string;
  auth_type: string;
  credentials: Record<string, unknown>;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_token_expires_at: string | null;
  oauth_scope: string | null;
  status: "pending" | "active" | "expired" | "revoked";
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  expiry_notice_days: number;
  expiry_notify: boolean;
  workstream?: { id: string; name: string };
  product?: { id: string; name: string };
  service?: { id: string; name: string };
  workstreams?: { id: string; name: string }[];
}

export interface CreateCredentialInput {
  name: string;
  description?: string;
  account_id: string;
  enterprise_id: string;
  workstream_ids: string[];
  product_id?: string;
  service_id?: string;
  category: string;
  connector: string;
  auth_type: string;
  credentials?: Record<string, unknown>;
  created_by?: string;
  expires_at?: string;
  expiry_notice_days?: number;
  expiry_notify?: boolean;
}

export interface UpdateCredentialInput {
  name?: string;
  description?: string;
  product_id?: string;
  service_id?: string;
  status?: "active" | "pending" | "expired" | "revoked";
  expires_at?: string | null;
  expiry_notice_days?: number;
  expiry_notify?: boolean;
  credentials?: Record<string, unknown>;
  workstream_ids?: string[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const credentialsService = {
  async getAll(accountId: string, enterpriseId: string): Promise<Credential[]> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.get<Credential[]>("/credentials", {
        params: { accountId, enterpriseId },
      });
      if (error) throw new Error(error.message);
      return data || [];
    }

    let query = supabase
      .from("credentials")
      .select(`
        *,
        workstream:workstreams(id, name),
        product:products(id, name),
        service:services(id, name),
        credential_workstreams(workstream:workstreams(id, name))
      `)
      .order("created_at", { ascending: false });

    if (accountId) query = query.eq("account_id", accountId);
    if (enterpriseId) query = query.eq("enterprise_id", enterpriseId);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((cred: Record<string, unknown>) => {
      const cws = cred.credential_workstreams as Array<{ workstream: { id: string; name: string } }> | null;
      return {
        ...cred,
        workstreams: cws?.map((cw) => cw.workstream).filter(Boolean) || [],
      };
    }) as Credential[];
  },

  async create(input: CreateCredentialInput): Promise<Credential> {
    if (isExternalApi()) {
      const payload = {
        name: input.name,
        description: input.description || undefined,
        accountId: input.account_id,
        enterpriseId: input.enterprise_id,
        workstreamIds: input.workstream_ids,
        productId: input.product_id || undefined,
        serviceId: input.service_id || undefined,
        category: input.category,
        connector: input.connector,
        authType: input.auth_type,
        credentials: input.credentials || undefined,
        createdBy: input.created_by || undefined,
        expiresAt: input.expires_at || undefined,
        expiryNoticeDays: input.expiry_notice_days,
        expiryNotify: input.expiry_notify,
      };
      const { data, error } = await httpClient.post<Credential>("/credentials", payload);
      if (error) throw new Error(error.message);
      return data!;
    }

    const insertData = {
      name: input.name,
      description: input.description || null,
      account_id: input.account_id,
      enterprise_id: input.enterprise_id,
      workstream_id: input.workstream_ids[0] || null,
      product_id: input.product_id || null,
      service_id: input.service_id || null,
      category: input.category,
      connector: input.connector,
      auth_type: input.auth_type,
      credentials: (input.credentials || {}) as Json,
      status: input.auth_type === "oauth" ? ("pending" as const) : ("active" as const),
      created_by: input.created_by || null,
    };

    const { data: credential, error } = await supabase
      .from("credentials")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    if (input.workstream_ids.length > 0) {
      const entries = input.workstream_ids.map((wsId) => ({
        credential_id: credential.id,
        workstream_id: wsId,
      }));
      const { error: wsErr } = await supabase
        .from("credential_workstreams")
        .insert(entries);
      if (wsErr) console.error("Failed to create credential workstreams:", wsErr);
    }

    return credential as unknown as Credential;
  },

  async update(id: string, updates: UpdateCredentialInput): Promise<void> {
    if (isExternalApi()) {
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.product_id !== undefined) payload.productId = updates.product_id;
      if (updates.service_id !== undefined) payload.serviceId = updates.service_id;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.credentials !== undefined) payload.credentials = updates.credentials;
      if (updates.expires_at !== undefined) payload.expiresAt = updates.expires_at;
      if (updates.expiry_notice_days !== undefined) payload.expiryNoticeDays = updates.expiry_notice_days;
      if (updates.expiry_notify !== undefined) payload.expiryNotify = updates.expiry_notify;
      if (updates.workstream_ids !== undefined) payload.workstreamIds = updates.workstream_ids;
      const { error } = await httpClient.patch(`/credentials/${id}`, payload);
      if (error) throw new Error(error.message);
      return;
    }

    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.product_id !== undefined) dbUpdates.product_id = updates.product_id;
    if (updates.service_id !== undefined) dbUpdates.service_id = updates.service_id;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.expires_at !== undefined) dbUpdates.expires_at = updates.expires_at;
    if (updates.expiry_notice_days !== undefined) dbUpdates.expiry_notice_days = updates.expiry_notice_days;
    if (updates.expiry_notify !== undefined) dbUpdates.expiry_notify = updates.expiry_notify;
    if (updates.credentials !== undefined) dbUpdates.credentials = updates.credentials as Json;
    if (updates.workstream_ids !== undefined && updates.workstream_ids.length > 0) {
      dbUpdates.workstream_id = updates.workstream_ids[0];
    }

    const { error } = await supabase.from("credentials").update(dbUpdates).eq("id", id);
    if (error) throw error;

    if (updates.workstream_ids !== undefined) {
      await supabase.from("credential_workstreams").delete().eq("credential_id", id);
      if (updates.workstream_ids.length > 0) {
        const entries = updates.workstream_ids.map((wsId) => ({
          credential_id: id,
          workstream_id: wsId,
        }));
        const { error: wsErr } = await supabase
          .from("credential_workstreams")
          .insert(entries);
        if (wsErr) console.error("Failed to update credential workstreams:", wsErr);
      }
    }
  },

  async rotate(id: string, credentials: Record<string, unknown>): Promise<void> {
    if (isExternalApi()) {
      const { error } = await httpClient.post(`/credentials/${id}/rotate`, { credentials });
      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await supabase
      .from("credentials")
      .update({
        credentials: credentials as Json,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    if (isExternalApi()) {
      const { error } = await httpClient.delete(`/credentials/${id}`);
      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await supabase.from("credentials").delete().eq("id", id);
    if (error) throw error;
  },

  async checkNameExists(
    name: string,
    accountId: string,
    enterpriseId: string
  ): Promise<{ id: string; name: string }[]> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.get<{ id: string; name: string }[]>(
        "/credentials/check-name",
        { params: { name, accountId, enterpriseId } }
      );
      if (error) throw new Error(error.message);
      return data || [];
    }

    const { data, error } = await supabase
      .from("credentials")
      .select("id, name")
      .eq("account_id", accountId)
      .eq("enterprise_id", enterpriseId)
      .ilike("name", name);

    if (error) throw error;
    return data || [];
  },

  // ── OAuth helpers ─────────────────────────────────────────────────────────

  async initiateOAuth(
    credentialId: string,
    provider: string,
    redirectUri: string
  ): Promise<{ authorizationUrl: string; state: string } | null> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.post<{ authorizationUrl: string; state: string }>(
        "/connectors/oauth/initiate",
        { provider, credentialId, redirectUri }
      );
      if (error) throw new Error(error.message);
      return data;
    }

    const { data, error } = await supabase.functions.invoke("connector-oauth/initiate", {
      body: { provider, credentialId, redirectUri },
    });
    if (error) throw error;
    return data;
  },

  async checkOAuthStatus(credentialId: string): Promise<{ status: string } | null> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.get<{ status: string }>(
        `/connectors/oauth/status/${credentialId}`
      );
      if (error) throw new Error(error.message);
      return data;
    }

    const { data, error } = await supabase.functions.invoke("connector-oauth/status", {
      body: { credentialId },
    });
    if (error) throw error;
    return data;
  },

  async revokeOAuth(credentialId: string): Promise<{ success: boolean } | null> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.post<{ success: boolean }>(
        "/connectors/oauth/revoke",
        { credentialId }
      );
      if (error) throw new Error(error.message);
      return data;
    }

    const { data, error } = await supabase.functions.invoke("connector-oauth/revoke", {
      body: { credentialId },
    });
    if (error) throw error;
    return data;
  },
};
