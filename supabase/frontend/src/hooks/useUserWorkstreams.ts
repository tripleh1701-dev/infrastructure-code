import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface UserWorkstream {
  id: string;
  user_id: string;
  workstream_id: string;
  created_at: string;
  workstream?: {
    id: string;
    name: string;
  };
}

// Hook to fetch workstreams assigned to a user
export function useUserWorkstreams(userId?: string) {
  return useQuery({
    queryKey: ["user-workstreams", userId],
    queryFn: async () => {
      if (!userId) return [];

      if (isExternalApi()) {
        const { data, error } = await httpClient.get<UserWorkstream[]>(`/users/${userId}/workstreams`);
        if (error) throw new Error(error.message);
        return data || [];
      }
      
      const { data, error } = await supabase
        .from("user_workstreams")
        .select(`
          id,
          user_id,
          workstream_id,
          created_at,
          workstreams (
            id,
            name
          )
        `)
        .eq("user_id", userId);
      
      if (error) throw error;
      
      return data.map((uw: any) => ({
        ...uw,
        workstream: uw.workstreams
      })) as UserWorkstream[];
    },
    enabled: !!userId,
  });
}

// Hook to manage user workstream assignments
export function useUpdateUserWorkstreams() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, workstreamIds }: { userId: string; workstreamIds: string[] }) => {
      if (isExternalApi()) {
        const { error } = await httpClient.put(`/users/${userId}/workstreams`, { workstreamIds });
        if (error) throw new Error(error.message);
        return;
      }

      // Delete existing assignments
      const { error: deleteError } = await supabase
        .from("user_workstreams")
        .delete()
        .eq("user_id", userId);
      
      if (deleteError) throw deleteError;
      
      // Insert new assignments
      if (workstreamIds.length > 0) {
        const assignmentsToInsert = workstreamIds.map((wsId) => ({
          user_id: userId,
          workstream_id: wsId,
        }));
        
        const { error: insertError } = await supabase
          .from("user_workstreams")
          .insert(assignmentsToInsert);
        
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-workstreams"] });
      queryClient.invalidateQueries({ queryKey: ["access-control-users"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to update workstream assignments: " + error.message);
    },
  });
}

// Hook to ensure a default workstream exists for the given account/enterprise
export function useEnsureDefaultWorkstream() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ accountId, enterpriseId }: { accountId: string; enterpriseId: string }) => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.post<{ id: string; name: string }>('/workstreams/ensure-default', {
          accountId,
          enterpriseId,
        });
        if (error) throw new Error(error.message);
        return data;
      }

      // Check if any workstream exists for this account/enterprise combination
      const { data: existingWorkstreams, error: fetchError } = await supabase
        .from("workstreams")
        .select("id, name")
        .eq("account_id", accountId)
        .eq("enterprise_id", enterpriseId)
        .limit(1);
      
      if (fetchError) throw fetchError;
      
      // If no workstreams exist, create a "Default" workstream
      if (!existingWorkstreams || existingWorkstreams.length === 0) {
        const { data: newWorkstream, error: createError } = await supabase
          .from("workstreams")
          .insert({
            name: "Default",
            account_id: accountId,
            enterprise_id: enterpriseId,
          })
          .select()
          .single();
        
        if (createError) throw createError;
        
        return newWorkstream;
      }
      
      return existingWorkstreams[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workstreams"] });
    },
    onError: (error: Error) => {
      console.error("Failed to ensure default workstream:", error.message);
    },
  });
}

// Hook to get the default workstream ID for an account/enterprise (or create one if it doesn't exist)
export function useDefaultWorkstream(accountId?: string, enterpriseId?: string) {
  return useQuery({
    queryKey: ["default-workstream", accountId, enterpriseId],
    queryFn: async () => {
      if (!accountId || !enterpriseId) return null;

      if (isExternalApi()) {
        // Use POST ensure-default endpoint (no GET /default exists on backend)
        const { data, error } = await httpClient.post<{ id: string; name: string }>('/workstreams/ensure-default', {
          accountId,
          enterpriseId,
        });
        if (error) throw new Error(error.message);
        return data;
      }
      
      // First, try to find a workstream explicitly named "Default"
      const { data: defaultNamed, error: defaultError } = await supabase
        .from("workstreams")
        .select("id, name")
        .eq("account_id", accountId)
        .eq("enterprise_id", enterpriseId)
        .ilike("name", "Default")
        .limit(1);
      
      if (defaultError) throw defaultError;
      
      if (defaultNamed && defaultNamed.length > 0) {
        return defaultNamed[0];
      }
      
      // Check if any other workstreams exist
      const { data: existingWorkstreams, error: fetchError } = await supabase
        .from("workstreams")
        .select("id, name")
        .eq("account_id", accountId)
        .eq("enterprise_id", enterpriseId)
        .order("created_at", { ascending: true })
        .limit(1);
      
      if (fetchError) throw fetchError;
      
      // If no workstreams exist, create a "Default" workstream
      if (!existingWorkstreams || existingWorkstreams.length === 0) {
        const { data: newWorkstream, error: createError } = await supabase
          .from("workstreams")
          .insert({
            name: "Default",
            account_id: accountId,
            enterprise_id: enterpriseId,
          })
          .select()
          .single();
        
        if (createError) throw createError;
        
        return newWorkstream;
      }
      
      return existingWorkstreams[0];
    },
    enabled: !!accountId && !!enterpriseId,
  });
}
