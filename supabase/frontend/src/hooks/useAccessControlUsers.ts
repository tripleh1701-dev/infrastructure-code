import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ensureDefaultWorkstream } from "./useWorkstreams";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

const GLOBAL_ENTERPRISE_ID = "00000000-0000-0000-0000-000000000001";

export interface UserWorkstreamAssignment {
  id: string;
  workstreamId: string;
  workstreamName: string;
}

export interface UserGroupAssignment {
  id: string;
  groupId: string;
  groupName: string;
}

export interface AccessControlUser {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  status: "active" | "inactive";
  startDate: string;
  endDate?: string | null;
  assignedGroup: string;
  assignedRole: string;
  accountId?: string;
  accountName?: string;
  enterpriseId?: string | null;
  enterpriseName?: string | null;
  createdAt: string;
  isTechnicalUser: boolean;
  workstreams?: UserWorkstreamAssignment[];
  groups?: UserGroupAssignment[];
}

export function useAccessControlUsers(accountId?: string | null, enterpriseId?: string | null) {
  return useQuery({
    queryKey: ["access-control-users", accountId, enterpriseId],
    enabled: !!accountId,
    queryFn: async () => {
      // External API mode: NestJS handles relational joins, workstream defaults, and filtering server-side
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<AccessControlUser[]>('/users', {
          params: {
            accountId: accountId || undefined,
            enterpriseId: enterpriseId || undefined,
          },
        });
        if (error) throw new Error(error.message);
        return data || [];
      }

      let query = supabase
        .from("account_technical_users")
        .select(`
          id,
          first_name,
          middle_name,
          last_name,
          email,
          status,
          start_date,
          end_date,
          assigned_group,
          assigned_role,
          account_id,
          enterprise_id,
          created_at,
          is_technical_user,
          accounts!account_technical_users_account_id_fkey (
            name
          ),
          enterprises (
            name
          )
        `)
        .order("created_at", { ascending: false });

      // Filter by account if provided
      if (accountId) {
        query = query.eq("account_id", accountId);
      }

      // Filter by enterprise if provided
      if (enterpriseId) {
        if (enterpriseId === GLOBAL_ENTERPRISE_ID) {
          query = query.or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`);
        } else {
          query = query.or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`);
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch workstream assignments for all users
      const userIds = (data || []).map((u: any) => u.id);
      let workstreamMap: Record<string, UserWorkstreamAssignment[]> = {};
      let userGroupsMap: Record<string, UserGroupAssignment[]> = {};
      
      if (userIds.length > 0) {
        // Fetch workstream assignments
        const { data: userWorkstreams, error: wsError } = await supabase
          .from("user_workstreams")
          .select(`
            id,
            user_id,
            workstream_id,
            workstreams (
              id,
              name
            )
          `)
          .in("user_id", userIds);

        // Fetch group assignments
        const { data: userGroupsData, error: ugError } = await supabase
          .from("user_groups")
          .select(`
            id,
            user_id,
            group_id,
            groups (
              id,
              name
            )
          `)
          .in("user_id", userIds);
        
        if (wsError) {
          console.error("Error fetching user workstreams:", wsError);
        } else if (userWorkstreams) {
          // Group workstreams by user_id and deduplicate by workstream name
          userWorkstreams.forEach((uw: any) => {
            if (!workstreamMap[uw.user_id]) {
              workstreamMap[uw.user_id] = [];
            }
            if (uw.workstreams) {
              const existingNames = workstreamMap[uw.user_id].map(w => w.workstreamName);
              if (!existingNames.includes(uw.workstreams.name)) {
                workstreamMap[uw.user_id].push({
                  id: uw.id,
                  workstreamId: uw.workstreams.id,
                  workstreamName: uw.workstreams.name,
                });
              }
            }
          });
        }

        if (ugError) {
          console.error("Error fetching user groups:", ugError);
        } else if (userGroupsData) {
          userGroupsData.forEach((ug: any) => {
            if (!userGroupsMap[ug.user_id]) {
              userGroupsMap[ug.user_id] = [];
            }
            if (ug.groups) {
              const existingGroupIds = userGroupsMap[ug.user_id].map(g => g.groupId);
              if (!existingGroupIds.includes(ug.groups.id)) {
                userGroupsMap[ug.user_id].push({
                  id: ug.id,
                  groupId: ug.groups.id,
                  groupName: ug.groups.name,
                });
              }
            }
          });
        }

        // Auto-assign Default workstream to technical users without any workstreams
        if (accountId && enterpriseId) {
          const defaultWorkstreamId = await ensureDefaultWorkstream(accountId, enterpriseId);

          if (defaultWorkstreamId) {
            const { data: wsData } = await supabase
              .from("workstreams")
              .select("name")
              .eq("id", defaultWorkstreamId)
              .maybeSingle();
            
            const workstreamName = wsData?.name || "Default";

            for (const user of data || []) {
              if (user.is_technical_user && !workstreamMap[user.id]?.length) {
                const { data: inserted, error: insertErr } = await supabase
                  .from("user_workstreams")
                  .insert({
                    user_id: user.id,
                    workstream_id: defaultWorkstreamId,
                  })
                  .select()
                  .single();

                if (!insertErr && inserted) {
                  workstreamMap[user.id] = [{
                    id: inserted.id,
                    workstreamId: defaultWorkstreamId,
                    workstreamName: workstreamName,
                  }];
                }
              }
            }
          }
        }
      }

      return (data || []).map((user: any) => ({
        id: user.id,
        firstName: user.first_name,
        middleName: user.middle_name,
        lastName: user.last_name,
        email: user.email,
        status: user.status as "active" | "inactive",
        startDate: user.start_date,
        endDate: user.end_date,
        assignedGroup: user.assigned_group,
        assignedRole: user.assigned_role,
        accountId: user.account_id,
        accountName: user.accounts?.name,
        enterpriseId: user.enterprise_id,
        enterpriseName: user.enterprises?.name,
        createdAt: user.created_at,
        isTechnicalUser: user.is_technical_user,
        workstreams: workstreamMap[user.id] || [],
        groups: userGroupsMap[user.id] || [],
      })) as AccessControlUser[];
    },
  });
}

export interface CreateUserData {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  status: "active" | "inactive";
  startDate: string;
  endDate?: string;
  assignedGroup: string;
  assignedRole: string;
  accountId?: string;
  enterpriseId?: string;
  isTechnicalUser?: boolean;
}

export function useCreateAccessControlUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateUserData) => {
      if (isExternalApi()) {
        const { data: result, error } = await httpClient.post<any>('/users', {
          firstName: data.firstName,
          middleName: data.middleName,
          lastName: data.lastName,
          email: data.email,
          status: data.status,
          startDate: data.startDate,
          endDate: data.endDate,
          assignedGroup: data.assignedGroup,
          assignedRole: data.assignedRole,
          accountId: data.accountId,
          enterpriseId: data.enterpriseId,
          isTechnicalUser: data.isTechnicalUser,
        });
        if (error) throw new Error(error.message);
        return result;
      }

      const insertData: any = {
        first_name: data.firstName,
        middle_name: data.middleName || null,
        last_name: data.lastName,
        email: data.email,
        status: data.status,
        start_date: data.startDate,
        end_date: data.endDate || null,
        assigned_group: data.assignedGroup,
        assigned_role: data.assignedRole,
        is_technical_user: data.isTechnicalUser || false,
      };

      if (data.accountId) {
        insertData.account_id = data.accountId;
      }

      if (data.enterpriseId) {
        insertData.enterprise_id = data.enterpriseId;
      }

      const { data: result, error } = await supabase
        .from("account_technical_users")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-control-users"] });
      toast.success("User created successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create user: ${error.message}`);
    },
  });
}

export function useUpdateAccessControlUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateUserData> }) => {
      if (isExternalApi()) {
        const { data: result, error } = await httpClient.put<any>(`/users/${id}`, {
          firstName: data.firstName,
          middleName: data.middleName,
          lastName: data.lastName,
          email: data.email,
          status: data.status,
          startDate: data.startDate,
          endDate: data.endDate,
          assignedGroup: data.assignedGroup,
          assignedRole: data.assignedRole,
          isTechnicalUser: data.isTechnicalUser,
        });
        if (error) throw new Error(error.message);
        return result;
      }

      const updateData: any = {};
      
      if (data.firstName !== undefined) updateData.first_name = data.firstName;
      if (data.middleName !== undefined) updateData.middle_name = data.middleName || null;
      if (data.lastName !== undefined) updateData.last_name = data.lastName;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.startDate !== undefined) updateData.start_date = data.startDate;
      if (data.endDate !== undefined) updateData.end_date = data.endDate || null;
      if (data.assignedGroup !== undefined) updateData.assigned_group = data.assignedGroup;
      if (data.assignedRole !== undefined) updateData.assigned_role = data.assignedRole;
      if (data.isTechnicalUser !== undefined) updateData.is_technical_user = data.isTechnicalUser;

      const { data: result, error } = await supabase
        .from("account_technical_users")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-control-users"] });
      toast.success("User updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update user: ${error.message}`);
    },
  });
}

export function useDeleteAccessControlUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/users/${id}`);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase
        .from("account_technical_users")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-control-users"] });
      toast.success("User deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete user: ${error.message}`);
    },
  });
}

// Hook to check if a user email already exists within the same account + enterprise combination
export function useCheckUserEmailExists(
  email: string,
  accountId?: string | null,
  enterpriseId?: string | null,
  excludeUserId?: string | null
) {
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const checkDuplicate = useCallback(async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setIsDuplicate(false);
      return;
    }

    setIsChecking(true);
    try {
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<{ exists: boolean }>('/users/check-email', {
          params: {
            email: trimmedEmail,
            accountId: accountId || undefined,
            enterpriseId: enterpriseId || undefined,
            excludeUserId: excludeUserId || undefined,
          },
        });
        if (error) {
          console.error("Error checking user email:", error);
          setIsDuplicate(false);
          return;
        }
        setIsDuplicate(data?.exists || false);
        return;
      }

      let query = supabase
        .from("account_technical_users")
        .select("id, email, account_id, enterprise_id")
        .ilike("email", trimmedEmail);

      if (accountId) {
        query = query.eq("account_id", accountId);
      } else {
        query = query.is("account_id", null);
      }

      if (enterpriseId) {
        query = query.eq("enterprise_id", enterpriseId);
      } else {
        query = query.is("enterprise_id", null);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error checking user email:", error);
        setIsDuplicate(false);
        return;
      }

      const hasDuplicate = (data || []).some(
        (user) =>
          user.email.toLowerCase() === trimmedEmail.toLowerCase() &&
          user.id !== excludeUserId
      );

      setIsDuplicate(hasDuplicate);
    } catch (err) {
      console.error("Error checking user email:", err);
      setIsDuplicate(false);
    } finally {
      setIsChecking(false);
    }
  }, [email, accountId, enterpriseId, excludeUserId]);

  // Debounce the check
  useEffect(() => {
    const timer = setTimeout(() => {
      checkDuplicate();
    }, 300);

    return () => clearTimeout(timer);
  }, [checkDuplicate]);

  return { isDuplicate, isChecking };
}
