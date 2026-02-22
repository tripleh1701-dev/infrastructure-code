import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useCallback } from "react";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

// Module-level lock to prevent duplicate Default workstream creation across all hook instances
const creatingDefaultLocks = new Map<string, boolean>();

export interface WorkstreamTool {
  id: string;
  workstream_id: string;
  category: string;
  tool_name: string;
  created_at: string;
}

export interface Workstream {
  id: string;
  name: string;
  account_id: string;
  enterprise_id: string;
  created_at: string;
  updated_at: string;
  tools?: WorkstreamTool[];
  account?: { id: string; name: string };
  enterprise?: { id: string; name: string };
}

export interface CreateWorkstreamData {
  name: string;
  account_id: string;
  enterprise_id: string;
  tools: { category: string; tool_name: string }[];
}

// ── External API: ensure default workstream via NestJS ────────────────────────
async function ensureDefaultWorkstreamExternal(accountId: string, enterpriseId: string): Promise<string | null> {
  const lockKey = `${accountId}-${enterpriseId}`;
  if (creatingDefaultLocks.get(lockKey)) return null;
  creatingDefaultLocks.set(lockKey, true);

  try {
    // NestJS endpoint handles idempotent creation of Default workstream
    // Returns { id } of the existing or newly created workstream
    const { data, error } = await httpClient.post<{ id: string }>('/workstreams/ensure-default', {
      accountId,
      enterpriseId,
    });

    if (error) {
      console.error("Error ensuring default workstream via API:", error);
      return null;
    }

    return data?.id || null;
  } finally {
    creatingDefaultLocks.set(lockKey, false);
  }
}

// ── Supabase: ensure default workstream via direct DB calls ──────────────────
async function ensureDefaultWorkstreamSupabase(accountId: string, enterpriseId: string): Promise<string | null> {
  const lockKey = `${accountId}-${enterpriseId}`;
  if (creatingDefaultLocks.get(lockKey)) return null;
  creatingDefaultLocks.set(lockKey, true);

  try {
    // Check if Default workstream already exists
    const { data: existing } = await supabase
      .from("workstreams")
      .select("id")
      .eq("account_id", accountId)
      .eq("enterprise_id", enterpriseId)
      .eq("name", "Default")
      .limit(1)
      .maybeSingle();

    if (existing) return existing.id;

    // Check if ANY workstream exists for this combination
    const { data: anyExisting } = await supabase
      .from("workstreams")
      .select("id")
      .eq("account_id", accountId)
      .eq("enterprise_id", enterpriseId)
      .limit(1);

    if (anyExisting && anyExisting.length > 0) {
      return anyExisting[0].id;
    }

    // Create Default workstream
    const { data: created, error } = await supabase
      .from("workstreams")
      .insert({
        name: "Default",
        account_id: accountId,
        enterprise_id: enterpriseId,
      })
      .select()
      .single();

    if (error) {
      // Race condition duplicate — try to fetch again
      const { data: refetch } = await supabase
        .from("workstreams")
        .select("id")
        .eq("account_id", accountId)
        .eq("enterprise_id", enterpriseId)
        .limit(1)
        .maybeSingle();

      return refetch?.id || null;
    }

    return created?.id || null;
  } finally {
    creatingDefaultLocks.set(lockKey, false);
  }
}

// Centralized dispatcher
export async function ensureDefaultWorkstream(accountId: string, enterpriseId: string): Promise<string | null> {
  if (isExternalApi()) {
    return ensureDefaultWorkstreamExternal(accountId, enterpriseId);
  }
  return ensureDefaultWorkstreamSupabase(accountId, enterpriseId);
}

export function useWorkstreams(accountId?: string, enterpriseId?: string) {
  const queryClient = useQueryClient();

  const { data: workstreams = [], isLoading, refetch, isFetched } = useQuery({
    queryKey: ["workstreams", accountId, enterpriseId],
    queryFn: async () => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<any[]>('/workstreams', {
          params: { accountId, enterpriseId },
        });
        if (error) throw new Error(error.message);
        // Map camelCase from API to snake_case for frontend
        return (data || []).map((ws: any) => ({
          id: ws.id,
          name: ws.name,
          account_id: ws.accountId,
          enterprise_id: ws.enterpriseId,
          created_at: ws.createdAt,
          updated_at: ws.updatedAt,
          tools: (ws.tools || []).map((t: any) => ({
            id: t.id,
            workstream_id: t.workstreamId,
            tool_name: t.toolName,
            category: t.category,
            created_at: t.createdAt,
          })),
        })) as Workstream[];
      }

      let query = supabase
        .from("workstreams")
        .select(`
          *,
          account:accounts(id, name),
          enterprise:enterprises(id, name)
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

      // Fetch tools for each workstream
      const workstreamIds = data.map((w) => w.id);
      if (workstreamIds.length > 0) {
        const { data: tools, error: toolsError } = await supabase
          .from("workstream_tools")
          .select("*")
          .in("workstream_id", workstreamIds);

        if (toolsError) throw toolsError;

        return data.map((w) => ({
          ...w,
          tools: tools?.filter((t) => t.workstream_id === w.id) || [],
        })) as Workstream[];
      }

      return data as Workstream[];
    },
    enabled: !!accountId && !!enterpriseId,
  });

  // Auto-create Default workstream if none exist
  const createDefaultIfNeeded = useCallback(async () => {
    if (!accountId || !enterpriseId || !isFetched || isLoading || workstreams.length > 0) {
      return;
    }

    const created = await ensureDefaultWorkstream(accountId, enterpriseId);
    if (created) {
      queryClient.invalidateQueries({ queryKey: ["workstreams", accountId, enterpriseId] });
    }
  }, [accountId, enterpriseId, isFetched, isLoading, workstreams.length, queryClient]);

  useEffect(() => {
    createDefaultIfNeeded();
  }, [createDefaultIfNeeded]);

  const createWorkstream = useMutation({
    mutationFn: async (data: CreateWorkstreamData) => {
      if (isExternalApi()) {
        // Transform snake_case to camelCase for NestJS backend
        const payload: Record<string, any> = {
          name: data.name,
          accountId: data.account_id,
          enterpriseId: data.enterprise_id,
        };
        // Only include tools if non-empty to avoid validation issues
        if (data.tools && data.tools.length > 0) {
          payload.tools = data.tools.map(t => ({ toolName: t.tool_name, category: t.category }));
        }
        const { data: result, error } = await httpClient.post<Workstream>('/workstreams', payload);
        if (error) throw new Error(error.message);
        return result;
      }

      // Create workstream
      const { data: workstream, error: wsError } = await supabase
        .from("workstreams")
        .insert({
          name: data.name,
          account_id: data.account_id,
          enterprise_id: data.enterprise_id,
        })
        .select()
        .single();

      if (wsError) throw wsError;

      // Create tools
      if (data.tools.length > 0) {
        const toolsToInsert = data.tools.map((t) => ({
          workstream_id: workstream.id,
          category: t.category,
          tool_name: t.tool_name,
        }));

        const { error: toolsError } = await supabase
          .from("workstream_tools")
          .insert(toolsToInsert);

        if (toolsError) throw toolsError;
      }

      return workstream;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workstreams"] });
      toast.success("Workstream created successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to create workstream: " + error.message);
    },
  });

  const updateWorkstream = useMutation({
    mutationFn: async ({
      id,
      name,
      tools,
    }: {
      id: string;
      name?: string;
      tools?: { category: string; tool_name: string }[];
    }) => {
      if (isExternalApi()) {
        const payload: Record<string, any> = {};
        if (name !== undefined) payload.name = name;
        if (tools !== undefined) {
          payload.tools = tools.map(t => ({ toolName: t.tool_name, category: t.category }));
        }
        const { error } = await httpClient.put(`/workstreams/${id}`, payload);
        if (error) throw new Error(error.message);
        return;
      }

      if (name) {
        const { error } = await supabase
          .from("workstreams")
          .update({ name })
          .eq("id", id);
        if (error) throw error;
      }

      if (tools) {
        // Delete existing tools
        const { error: deleteError } = await supabase
          .from("workstream_tools")
          .delete()
          .eq("workstream_id", id);
        if (deleteError) throw deleteError;

        // Insert new tools
        if (tools.length > 0) {
          const toolsToInsert = tools.map((t) => ({
            workstream_id: id,
            category: t.category,
            tool_name: t.tool_name,
          }));
          const { error: insertError } = await supabase
            .from("workstream_tools")
            .insert(toolsToInsert);
          if (insertError) throw insertError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workstreams"] });
      toast.success("Workstream updated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to update workstream: " + error.message);
    },
  });

  const deleteWorkstream = useMutation({
    mutationFn: async (id: string) => {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/workstreams/${id}`);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from("workstreams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workstreams"] });
      toast.success("Workstream deleted successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete workstream: " + error.message);
    },
  });

  const getWorkstreamTools = async (workstreamId: string) => {
    if (isExternalApi()) {
      const { data, error } = await httpClient.get<WorkstreamTool[]>(`/workstreams/${workstreamId}/tools`);
      if (error) throw new Error(error.message);
      return data || [];
    }

    const { data, error } = await supabase
      .from("workstream_tools")
      .select("*")
      .eq("workstream_id", workstreamId);
    if (error) throw error;
    return data as WorkstreamTool[];
  };

  return {
    workstreams,
    isLoading,
    refetch,
    createWorkstream,
    updateWorkstream,
    deleteWorkstream,
    getWorkstreamTools,
  };
}
