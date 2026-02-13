import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface UserGroupAssignment {
  id: string;
  groupId: string;
  groupName: string;
}

// Fetch user's group assignments
export function useUserGroups(userId?: string | null) {
  return useQuery({
    queryKey: ["user-groups", userId],
    queryFn: async () => {
      if (!userId) return [];

      if (isExternalApi()) {
        const { data, error } = await httpClient.get<UserGroupAssignment[]>(`/api/users/${userId}/groups`);
        if (error) throw new Error(error.message);
        return data || [];
      }

      const { data, error } = await supabase
        .from("user_groups")
        .select(`
          id,
          group_id,
          groups (
            id,
            name
          )
        `)
        .eq("user_id", userId);

      if (error) throw error;

      return (data || []).map((ug: any) => ({
        id: ug.id,
        groupId: ug.group_id,
        groupName: ug.groups?.name || "",
      })) as UserGroupAssignment[];
    },
    enabled: !!userId,
  });
}

// Update user's group assignments (replace all)
export function useUpdateUserGroups() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, groupIds }: { userId: string; groupIds: string[] }) => {
      if (isExternalApi()) {
        const { error } = await httpClient.put(`/api/users/${userId}/groups`, { groupIds });
        if (error) throw new Error(error.message);
        return { userId, groupIds };
      }

      // Delete existing assignments
      const { error: deleteError } = await supabase
        .from("user_groups")
        .delete()
        .eq("user_id", userId);

      if (deleteError) throw deleteError;

      // Insert new assignments
      if (groupIds.length > 0) {
        const insertData = groupIds.map(groupId => ({
          user_id: userId,
          group_id: groupId,
        }));

        const { error: insertError } = await supabase
          .from("user_groups")
          .insert(insertData);

        if (insertError) throw insertError;
      }

      return { userId, groupIds };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["user-groups", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["access-control-users"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update user groups: ${error.message}`);
    },
  });
}
