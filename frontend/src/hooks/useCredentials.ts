import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface Credential {
  id: string;
  name: string;
  description: string | null;
  account_id: string;
  enterprise_id: string;
  workstream_id: string | null; // Deprecated - use workstreams array instead
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
  // Expiration tracking fields
  expires_at: string | null;
  expiry_notice_days: number;
  expiry_notify: boolean;
  // Joined data (deprecated single workstream)
  workstream?: { id: string; name: string };
  product?: { id: string; name: string };
  service?: { id: string; name: string };
  // New: multiple workstreams
  workstreams?: { id: string; name: string }[];
}

export interface CreateCredentialData {
  name: string;
  description?: string;
  account_id: string;
  enterprise_id: string;
  workstream_ids: string[]; // Changed from workstream_id to support multiple
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

export function useCredentials(accountId?: string, enterpriseId?: string) {
  const queryClient = useQueryClient();

  const { data: credentials = [], isLoading, refetch } = useQuery({
    queryKey: ["credentials", accountId, enterpriseId],
    queryFn: async () => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<Credential[]>('/api/credentials', {
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
          credential_workstreams(
            workstream:workstreams(id, name)
          )
        `)
        .order("created_at", { ascending: false });

      if (accountId) {
        query = query.eq("account_id", accountId);
      }
      if (enterpriseId) {
        query = query.eq("enterprise_id", enterpriseId);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Transform credential_workstreams to workstreams array
      return (data || []).map((cred: Record<string, unknown>) => {
        const credentialWorkstreams = cred.credential_workstreams as Array<{ workstream: { id: string; name: string } }> | null;
        return {
          ...cred,
          workstreams: credentialWorkstreams?.map(cw => cw.workstream).filter(Boolean) || [],
        };
      }) as Credential[];
    },
    enabled: !!accountId && !!enterpriseId,
  });

  const createCredential = useMutation({
    mutationFn: async (data: CreateCredentialData) => {
      if (isExternalApi()) {
        const { data: result, error } = await httpClient.post<Credential>('/api/credentials', data);
        if (error) throw new Error(error.message);
        return result;
      }

      // First, create the credential without workstream_id
      const insertData = {
        name: data.name,
        description: data.description || null,
        account_id: data.account_id,
        enterprise_id: data.enterprise_id,
        workstream_id: data.workstream_ids[0] || null, // Keep first for backward compatibility
        product_id: data.product_id || null,
        service_id: data.service_id || null,
        category: data.category,
        connector: data.connector,
        auth_type: data.auth_type,
        credentials: (data.credentials || {}) as Json,
        status: data.auth_type === "oauth" ? "pending" as const : "active" as const,
        created_by: data.created_by || null,
      };

      const { data: credential, error } = await supabase
        .from("credentials")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Create credential_workstreams entries
      if (data.workstream_ids.length > 0) {
        const workstreamEntries = data.workstream_ids.map(workstreamId => ({
          credential_id: credential.id,
          workstream_id: workstreamId,
        }));

        const { error: workstreamError } = await supabase
          .from("credential_workstreams")
          .insert(workstreamEntries);

        if (workstreamError) {
          console.error("Failed to create credential workstreams:", workstreamError);
          // Don't throw - credential was created successfully
        }
      }

      return credential;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to create credential: " + error.message);
    },
  });

  const updateCredential = useMutation({
    mutationFn: async ({
      id,
      credentials: credentialsData,
      status,
      name,
      description,
      product_id,
      service_id,
      expires_at,
      expiry_notice_days,
      expiry_notify,
      workstream_ids,
    }: Partial<CreateCredentialData> & { 
      id: string; 
      status?: "active" | "pending" | "expired" | "revoked";
      expires_at?: string | null;
    }) => {
      const updateData: Record<string, unknown> = {};
      
      // Only include fields that are explicitly provided (including null values)
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (product_id !== undefined) updateData.product_id = product_id;
      if (service_id !== undefined) updateData.service_id = service_id;
      if (status !== undefined) updateData.status = status;
      if (expires_at !== undefined) updateData.expires_at = expires_at;
      if (expiry_notice_days !== undefined) updateData.expiry_notice_days = expiry_notice_days;
      if (expiry_notify !== undefined) updateData.expiry_notify = expiry_notify;
      if (credentialsData !== undefined) updateData.credentials = credentialsData;
      if (workstream_ids !== undefined) updateData.workstream_ids = workstream_ids;

      if (isExternalApi()) {
        const { error } = await httpClient.patch(`/api/credentials/${id}`, updateData);
        if (error) throw new Error(error.message);
      } else {
        // Supabase-specific: handle workstream_id backward compat and credential_workstreams join table
        if (workstream_ids !== undefined && workstream_ids.length > 0) {
          updateData.workstream_id = workstream_ids[0];
        }
        delete updateData.workstream_ids;
        updateData.updated_at = new Date().toISOString();
        if (credentialsData !== undefined) updateData.credentials = credentialsData as Json;

        const { error } = await supabase
          .from("credentials")
          .update(updateData)
          .eq("id", id);

        if (error) throw error;

        // Update credential_workstreams if provided
        if (workstream_ids !== undefined) {
          await supabase
            .from("credential_workstreams")
            .delete()
            .eq("credential_id", id);

          if (workstream_ids.length > 0) {
            const workstreamEntries = workstream_ids.map(workstreamId => ({
              credential_id: id,
              workstream_id: workstreamId,
            }));

            const { error: workstreamError } = await supabase
              .from("credential_workstreams")
              .insert(workstreamEntries);

            if (workstreamError) {
              console.error("Failed to update credential workstreams:", workstreamError);
            }
          }
        }
      }
      
      // CRITICAL: Invalidate and refetch BEFORE returning so mutateAsync waits for fresh data
      await queryClient.invalidateQueries({ 
        queryKey: ["credentials"],
        exact: false,
        refetchType: 'all'
      });
      await queryClient.refetchQueries({ 
        queryKey: ["credentials"],
        exact: false,
        type: 'active'
      });
    },
    onSuccess: () => {
      toast.success("Credential updated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to update credential: " + error.message);
    },
  });

  // Rotate credential - updates credentials data and resets status to active
  const rotateCredential = useMutation({
    mutationFn: async ({
      id,
      credentials: credentialsData,
    }: { id: string; credentials: Record<string, unknown> }) => {
      if (isExternalApi()) {
        const { error } = await httpClient.post(`/api/credentials/${id}/rotate`, {
          credentials: credentialsData,
        });
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase
        .from("credentials")
        .update({
          credentials: credentialsData as Json,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      toast.success("Credential rotated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to rotate credential: " + error.message);
    },
  });

  const deleteCredential = useMutation({
    mutationFn: async (id: string) => {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/api/credentials/${id}`);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from("credentials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      toast.success("Credential deleted successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete credential: " + error.message);
    },
  });

  // Initiate OAuth flow
  const initiateOAuth = async (
    credentialId: string,
    provider: string,
    redirectUri: string
  ): Promise<{ authorizationUrl: string; state: string } | null> => {
    try {
      if (isExternalApi()) {
        const { data, error } = await httpClient.post<{ authorizationUrl: string; state: string }>(
          "/api/connectors/oauth/initiate",
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
    } catch (error) {
      console.error("Failed to initiate OAuth:", error);
      toast.error("Failed to initiate OAuth flow");
      return null;
    }
  };

  // Check OAuth status
  const checkOAuthStatus = async (credentialId: string) => {
    try {
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<{ status: string }>(`/api/connectors/oauth/status/${credentialId}`);
        if (error) throw new Error(error.message);
        return data;
      }

      const { data, error } = await supabase.functions.invoke("connector-oauth/status", {
        body: { credentialId },
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Failed to check OAuth status:", error);
      return null;
    }
  };

  // Revoke OAuth
  const revokeOAuth = async (credentialId: string) => {
    try {
      if (isExternalApi()) {
        const { data, error } = await httpClient.post<{ success: boolean }>("/api/connectors/oauth/revoke", { credentialId });
        if (error) throw new Error(error.message);
        queryClient.invalidateQueries({ queryKey: ["credentials"] });
        toast.success("OAuth access revoked");
        return data;
      }

      const { data, error } = await supabase.functions.invoke("connector-oauth/revoke", {
        body: { credentialId },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      toast.success("OAuth access revoked");
      return data;
    } catch (error) {
      console.error("Failed to revoke OAuth:", error);
      toast.error("Failed to revoke OAuth access");
      return null;
    }
  };

  return {
    credentials,
    isLoading,
    refetch,
    createCredential,
    updateCredential,
    rotateCredential,
    deleteCredential,
    initiateOAuth,
    checkOAuthStatus,
    revokeOAuth,
  };
}

// Hook to check if a credential name already exists within the same account + enterprise combination
export function useCheckCredentialNameExists(
  name: string,
  accountId?: string | null,
  enterpriseId?: string | null,
  excludeCredentialId?: string | null // For edit mode - exclude current credential
) {
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const checkDuplicate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName || !accountId || !enterpriseId) {
      setIsDuplicate(false);
      return;
    }

    setIsChecking(true);
    try {
      let data: { id: string; name: string }[] | null = null;

      if (isExternalApi()) {
        const { data: result, error } = await httpClient.get<{ id: string; name: string }[]>(
          '/api/credentials/check-name',
          { params: { name: trimmedName, accountId, enterpriseId } }
        );
        if (error) {
          console.error("Error checking credential name:", error);
          setIsDuplicate(false);
          return;
        }
        data = result;
      } else {
        const { data: result, error } = await supabase
          .from("credentials")
          .select("id, name")
          .eq("account_id", accountId)
          .eq("enterprise_id", enterpriseId)
          .ilike("name", trimmedName);

        if (error) {
          console.error("Error checking credential name:", error);
          setIsDuplicate(false);
          return;
        }
        data = result;
      }

      // Check for exact case-insensitive match, excluding current credential if editing
      const duplicate = (data || []).some(
        (cred) =>
          cred.name.toLowerCase() === trimmedName.toLowerCase() &&
          cred.id !== excludeCredentialId
      );

      setIsDuplicate(duplicate);
    } catch (error) {
      console.error("Error checking credential name:", error);
      setIsDuplicate(false);
    } finally {
      setIsChecking(false);
    }
  }, [name, accountId, enterpriseId, excludeCredentialId]);

  // Debounce the check
  useEffect(() => {
    const timer = setTimeout(() => {
      checkDuplicate();
    }, 300);

    return () => clearTimeout(timer);
  }, [checkDuplicate]);

  return { isDuplicate, isChecking };
}
