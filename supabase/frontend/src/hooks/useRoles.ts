import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface RoleGroup {
  id: string;
  name: string;
}

export interface RoleWorkstream {
  id: string;
  name: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: number;
  createdAt: string;
  updatedAt: string;
  userCount?: number;
  groupCount?: number;
  groups?: RoleGroup[];
  accountId?: string | null;
  enterpriseId?: string | null;
  workstreamId?: string | null;
  workstreamIds?: string[];
  productId?: string | null;
  serviceId?: string | null;
  workstream?: { id: string; name: string } | null;
  workstreams?: RoleWorkstream[];
  product?: { id: string; name: string } | null;
  service?: { id: string; name: string } | null;
}

export function useRoles(accountId?: string | null, enterpriseId?: string | null) {
  return useQuery({
    queryKey: ["roles", accountId, enterpriseId],
    enabled: !!accountId,
    queryFn: async () => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<Role[]>('/roles', {
          params: { accountId: accountId || undefined, enterpriseId: enterpriseId || undefined },
        });
        if (error) throw new Error(error.message);
        return data || [];
      }

      // Strategy: Show roles that either:
      // 1. Belong to the selected account/enterprise directly, OR
      // 2. Are assigned to groups that have members from the selected account

      // First, get all roles that match the account/enterprise filter
      let query = supabase
        .from("roles")
        .select(`
          *,
          workstream:workstreams(id, name),
          product:products(id, name),
          service:services(id, name)
        `)
        .order("name", { ascending: true });

      // Filter by account and enterprise if provided
      if (accountId) {
        query = query.or(`account_id.eq.${accountId},account_id.is.null`);
      }
      if (enterpriseId) {
        query = query.or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`);
      }

      const { data: directRoles, error } = await query;
      if (error) throw error;

      // Also get roles that are assigned to groups which have members from the selected account
      // Note: Users may have enterprise_id as null, so we query by account only
      let usedRoleIds: string[] = [];
      if (accountId) {
        // Get users in this account (enterprise_id can be null or match)
        const { data: usersInAccount } = await supabase
          .from("account_technical_users")
          .select("id")
          .eq("account_id", accountId);

        if (usersInAccount && usersInAccount.length > 0) {
          const userIds = usersInAccount.map(u => u.id);
          
          // Get groups these users belong to
          const { data: userGroupAssignments } = await supabase
            .from("user_groups")
            .select("group_id")
            .in("user_id", userIds);

          if (userGroupAssignments && userGroupAssignments.length > 0) {
            const groupIds = [...new Set(userGroupAssignments.map(ug => ug.group_id))];
            
            // Get roles assigned to these groups
            const { data: groupRoleAssignments } = await supabase
              .from("group_roles")
              .select("role_id")
              .in("group_id", groupIds);

            if (groupRoleAssignments) {
              usedRoleIds = [...new Set(groupRoleAssignments.map(gr => gr.role_id))];
            }
          }
        }
      }

      // Fetch the additional roles that are used by groups in this account
      const directRoleIds = new Set((directRoles || []).map(r => r.id));
      const additionalRoleIds = usedRoleIds.filter(id => !directRoleIds.has(id));
      
      let additionalRoles: any[] = [];
      if (additionalRoleIds.length > 0) {
        const { data: addlRoles } = await supabase
          .from("roles")
          .select(`
            *,
            workstream:workstreams(id, name),
            product:products(id, name),
            service:services(id, name)
          `)
          .in("id", additionalRoleIds);
        additionalRoles = addlRoles || [];
      }

      // Combine both sets of roles
      const allRoles = [...(directRoles || []), ...additionalRoles];

      // Fetch role workstreams from the junction table
      const { data: roleWorkstreams } = await supabase
        .from("role_workstreams")
        .select(`
          role_id,
          workstream:workstreams(id, name)
        `);

      // Build a map of role_id -> array of workstream info
      const roleWorkstreamsMap = (roleWorkstreams || []).reduce((acc, rw) => {
        if (!acc[rw.role_id]) {
          acc[rw.role_id] = [];
        }
        if (rw.workstream) {
          acc[rw.role_id].push({ id: rw.workstream.id, name: rw.workstream.name });
        }
        return acc;
      }, {} as Record<string, RoleWorkstream[]>);

      // Get user counts for each role by traversing: role -> group_roles -> user_groups -> users
      // First, get all group_roles to know which groups have which roles
      const { data: groupRoles } = await supabase
        .from("group_roles")
        .select(`
          role_id,
          group:groups(id, name)
        `);

      // Build a map of role_id -> array of group info
      const roleGroupsMap = (groupRoles || []).reduce((acc, gr) => {
        if (!acc[gr.role_id]) {
          acc[gr.role_id] = [];
        }
        if (gr.group) {
          acc[gr.role_id].push({ id: gr.group.id, name: gr.group.name });
        }
        return acc;
      }, {} as Record<string, RoleGroup[]>);

      // Get all group IDs that have roles assigned
      const allGroupIds = [...new Set((groupRoles || []).filter(gr => gr.group).map(gr => gr.group!.id))];

      // Fetch user_groups to count users per group, filtered by account if provided
      let userGroupsQuery = supabase
        .from("user_groups")
        .select("user_id, group_id");
      
      if (allGroupIds.length > 0) {
        userGroupsQuery = userGroupsQuery.in("group_id", allGroupIds);
      }

      const { data: userGroupsData } = await userGroupsQuery;

      // If filtering by account, only count users from that account
      // Note: Users may have enterprise_id as null, so we filter by account only
      let relevantUserIds: Set<string> | null = null;
      if (accountId) {
        const { data: usersInAccount } = await supabase
          .from("account_technical_users")
          .select("id")
          .eq("account_id", accountId);
        
        relevantUserIds = new Set((usersInAccount || []).map(u => u.id));
      }

      // Build a map of group_id -> set of user_ids (filtered by account if needed)
      const groupUsersMap = (userGroupsData || []).reduce((acc, ug) => {
        // If filtering by account, only include users from that account
        if (relevantUserIds && !relevantUserIds.has(ug.user_id)) {
          return acc;
        }
        if (!acc[ug.group_id]) {
          acc[ug.group_id] = new Set<string>();
        }
        acc[ug.group_id].add(ug.user_id);
        return acc;
      }, {} as Record<string, Set<string>>);

      // Now calculate user count for each role (distinct users across all groups with that role)
      const roleCounts: Record<string, number> = {};
      Object.entries(roleGroupsMap).forEach(([roleId, groups]) => {
        const userSet = new Set<string>();
        groups.forEach(group => {
          const usersInGroup = groupUsersMap[group.id];
          if (usersInGroup) {
            usersInGroup.forEach(userId => userSet.add(userId));
          }
        });
        roleCounts[roleId] = userSet.size;
      });

      // Calculate group count for each role (only groups that have members in this account)
      const roleGroupCountsFiltered: Record<string, { count: number; groups: RoleGroup[] }> = {};
      Object.entries(roleGroupsMap).forEach(([roleId, groups]) => {
        const relevantGroups = groups.filter(group => {
          // If filtering by account, only count groups that have users from this account
          if (relevantUserIds) {
            return groupUsersMap[group.id] && groupUsersMap[group.id].size > 0;
          }
          return true;
        });
        roleGroupCountsFiltered[roleId] = { count: relevantGroups.length, groups: relevantGroups };
      });

      // Filter roles to only show those that have users in the selected account
      const filteredRoles = allRoles.filter((role) => {
        // If role is in usedRoleIds (used by groups with members in this account), include it
        if (usedRoleIds.includes(role.id)) return true;
        
        // If role has no account_id, it's a global role - only show if it has users in this account
        if (!role.account_id && !role.enterprise_id) {
          // Check if this global role has any users in the current account context
          return roleCounts[role.id] > 0;
        }
        
        // If role matches the account/enterprise context, show it if it has users
        if (accountId && role.account_id === accountId) return roleCounts[role.id] > 0 || true;
        if (enterpriseId && role.enterprise_id === enterpriseId) return roleCounts[role.id] > 0 || true;
        
        return false;
      });

      return filteredRoles.map((role) => {
        const groupData = roleGroupCountsFiltered[role.id] || { count: 0, groups: [] };
        const workstreams = roleWorkstreamsMap[role.id] || [];
        return {
          id: role.id,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          createdAt: role.created_at,
          updatedAt: role.updated_at,
          userCount: roleCounts[role.id] || 0,
          groupCount: groupData.count,
          groups: groupData.groups,
          accountId: role.account_id,
          enterpriseId: role.enterprise_id,
          workstreamId: role.workstream_id,
          workstreamIds: workstreams.map(w => w.id),
          productId: role.product_id,
          serviceId: role.service_id,
          workstream: role.workstream,
          workstreams,
          product: role.product,
          service: role.service,
        };
      }).sort((a, b) => a.name.localeCompare(b.name)) as Role[];
    },
  });
}

export interface CreateRoleData {
  name: string;
  description?: string;
  permissions: number;
  accountId?: string;
  enterpriseId?: string;
  workstreamIds?: string[];
  productId?: string;
  serviceId?: string;
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRoleData) => {
      if (isExternalApi()) {
        const { data: result, error } = await httpClient.post<any>('/roles', data);
        if (error) throw new Error(error.message);
        return result;
      }

      const { data: result, error } = await supabase
        .from("roles")
        .insert({
          name: data.name,
          description: data.description || null,
          permissions: data.permissions,
          account_id: data.accountId || null,
          enterprise_id: data.enterpriseId || null,
          workstream_id: data.workstreamIds && data.workstreamIds.length > 0 ? data.workstreamIds[0] : null,
          product_id: data.productId || null,
          service_id: data.serviceId || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Insert workstream associations into junction table
      if (data.workstreamIds && data.workstreamIds.length > 0) {
        const { error: junctionError } = await supabase
          .from("role_workstreams")
          .insert(
            data.workstreamIds.map((workstreamId) => ({
              role_id: result.id,
              workstream_id: workstreamId,
            }))
          );

        if (junctionError) throw junctionError;
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role created successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create role: ${error.message}`);
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CreateRoleData }) => {
      if (isExternalApi()) {
        const { data: result, error } = await httpClient.put<any>(`/roles/${id}`, data);
        if (error) throw new Error(error.message);
        return result;
      }

      const { data: result, error } = await supabase
        .from("roles")
        .update({
          name: data.name,
          description: data.description || null,
          permissions: data.permissions,
          account_id: data.accountId || null,
          enterprise_id: data.enterpriseId || null,
          workstream_id: data.workstreamIds && data.workstreamIds.length > 0 ? data.workstreamIds[0] : null,
          product_id: data.productId || null,
          service_id: data.serviceId || null,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Delete existing workstream associations
      const { error: deleteError } = await supabase
        .from("role_workstreams")
        .delete()
        .eq("role_id", id);

      if (deleteError) throw deleteError;

      // Insert new workstream associations
      if (data.workstreamIds && data.workstreamIds.length > 0) {
        const { error: junctionError } = await supabase
          .from("role_workstreams")
          .insert(
            data.workstreamIds.map((workstreamId) => ({
              role_id: id,
              workstream_id: workstreamId,
            }))
          );

        if (junctionError) throw junctionError;
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update role: ${error.message}`);
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/roles/${id}`);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase
        .from("roles")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete role: ${error.message}`);
    },
  });
}

// Hook to check if a role name already exists within the same account + enterprise combination
export function useCheckRoleNameExists(
  name: string,
  accountId?: string | null,
  enterpriseId?: string | null,
  excludeRoleId?: string | null
) {
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const checkDuplicate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setIsDuplicate(false);
      return;
    }

    setIsChecking(true);
    try {
      let query = supabase
        .from("roles")
        .select("id, name, account_id, enterprise_id")
        .ilike("name", trimmedName);

      // Filter by account
      if (accountId) {
        query = query.eq("account_id", accountId);
      } else {
        query = query.is("account_id", null);
      }

      // Filter by enterprise
      if (enterpriseId) {
        query = query.eq("enterprise_id", enterpriseId);
      } else {
        query = query.is("enterprise_id", null);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error checking role name:", error);
        setIsDuplicate(false);
        return;
      }

      // Check if any returned role matches exactly (case-insensitive) and is not the excluded role
      const hasDuplicate = (data || []).some(
        (role) =>
          role.name.toLowerCase() === trimmedName.toLowerCase() &&
          role.id !== excludeRoleId
      );

      setIsDuplicate(hasDuplicate);
    } catch (err) {
      console.error("Error checking role name:", err);
      setIsDuplicate(false);
    } finally {
      setIsChecking(false);
    }
  }, [name, accountId, enterpriseId, excludeRoleId]);

  // Debounce the check
  useEffect(() => {
    const timer = setTimeout(() => {
      checkDuplicate();
    }, 300);

    return () => clearTimeout(timer);
  }, [checkDuplicate]);

  return { isDuplicate, isChecking };
}
