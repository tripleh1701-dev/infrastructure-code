import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface GroupRole {
  roleId: string;
  roleName: string;
  roleDescription: string | null;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  accountId: string | null;
  enterpriseId: string | null;
  workstreamId: string | null;
  workstreamName: string | null;
  productId: string | null;
  productName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  roles: GroupRole[];
}

export function useGroups(accountId?: string | null, enterpriseId?: string | null) {
  return useQuery({
    queryKey: ["groups", accountId, enterpriseId],
    queryFn: async () => {
      if (isExternalApi()) {
        // Fetch groups and roles in parallel since backend doesn't store group-role associations
        const [groupsRes, rolesRes] = await Promise.all([
          httpClient.get<any[]>('/api/groups', {
            params: { accountId: accountId || undefined, enterpriseId: enterpriseId || undefined },
          }),
          httpClient.get<any[]>('/api/roles'),
        ]);
        if (groupsRes.error) throw new Error(groupsRes.error.message);
        const groups = groupsRes.data || [];
        const allRoles: GroupRole[] = (rolesRes.data || []).map((r: any) => ({
          roleId: r.id,
          roleName: r.name,
          roleDescription: r.description || null,
        }));
        // Attach all available roles to each group (no group-role mapping in backend)
        return groups.map((g: any) => ({
          id: g.id,
          name: g.name,
          description: g.description || null,
          accountId: g.accountId || null,
          enterpriseId: g.enterpriseId || null,
          workstreamId: g.workstreamId || null,
          workstreamName: g.workstreamName || null,
          productId: g.productId || null,
          productName: g.productName || null,
          serviceId: g.serviceId || null,
          serviceName: g.serviceName || null,
          createdAt: g.createdAt || g.created_at || new Date().toISOString(),
          updatedAt: g.updatedAt || g.updated_at || new Date().toISOString(),
          memberCount: g.memberCount || 0,
          roles: allRoles,
        })) as Group[];
      }

      // Strategy: Show groups that either:
      // 1. Belong to the selected account/enterprise directly, OR
      // 2. Have members (users) from the selected account via user_groups junction table
      
      // First, get all groups that belong to the selected account/enterprise
      let directQuery = supabase
        .from("groups")
        .select("*")
        .order("name", { ascending: true });

      if (accountId) {
        directQuery = directQuery.eq("account_id", accountId);
      }
      if (enterpriseId) {
        directQuery = directQuery.eq("enterprise_id", enterpriseId);
      }

      const { data: directGroups, error: directError } = await directQuery;
      if (directError) throw directError;

      // Also get groups that users in this account belong to (via user_groups)
      // Note: Users may have enterprise_id as null, so we query by account only
      // and then filter the display based on the groups' enterprise context
      let usedGroupIds: string[] = [];
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

          if (userGroupAssignments) {
            usedGroupIds = [...new Set(userGroupAssignments.map(ug => ug.group_id))];
          }
        }
      }

      // Fetch the additional groups that users belong to (if not already in direct groups)
      const directGroupIds = new Set((directGroups || []).map(g => g.id));
      const additionalGroupIds = usedGroupIds.filter(id => !directGroupIds.has(id));
      
      let additionalGroups: any[] = [];
      if (additionalGroupIds.length > 0) {
        const { data: addlGroups } = await supabase
          .from("groups")
          .select("*")
          .in("id", additionalGroupIds);
        additionalGroups = addlGroups || [];
      }

      // Combine both sets of groups
      const allGroups = [...(directGroups || []), ...additionalGroups];

      // Fetch related data
      const [workstreamsRes, productsRes, servicesRes, groupRolesRes, rolesRes] = await Promise.all([
        supabase.from("workstreams").select("id, name"),
        supabase.from("products").select("id, name"),
        supabase.from("services").select("id, name"),
        supabase.from("group_roles").select("*"),
        supabase.from("roles").select("id, name, description"),
      ]);

      const workstreamsMap = new Map((workstreamsRes.data || []).map(w => [w.id, w.name]));
      const productsMap = new Map((productsRes.data || []).map(p => [p.id, p.name]));
      const servicesMap = new Map((servicesRes.data || []).map(s => [s.id, s.name]));
      const rolesMap = new Map((rolesRes.data || []).map(r => [r.id, { name: r.name, description: r.description }]));

      // Build group roles map
      const groupRolesMap = new Map<string, GroupRole[]>();
      (groupRolesRes.data || []).forEach(gr => {
        const role = rolesMap.get(gr.role_id);
        if (role) {
          const existing = groupRolesMap.get(gr.group_id) || [];
          existing.push({
            roleId: gr.role_id,
            roleName: role.name,
            roleDescription: role.description,
          });
          groupRolesMap.set(gr.group_id, existing);
        }
      });

      // Get member counts for each group, filtered by account context
      // Note: Users may have enterprise_id as null, so we filter by account only
      let userQuery = supabase
        .from("account_technical_users")
        .select("id, assigned_group");

      if (accountId) {
        userQuery = userQuery.eq("account_id", accountId);
      }

      const { data: users } = await userQuery;
      const userIds = (users || []).map(u => u.id);

      // Get user_groups for these users to count members per group
      let memberCountMap: Record<string, number> = {};
      if (userIds.length > 0) {
        const { data: userGroupData } = await supabase
          .from("user_groups")
          .select("group_id, user_id")
          .in("user_id", userIds);

        if (userGroupData) {
          userGroupData.forEach(ug => {
            memberCountMap[ug.group_id] = (memberCountMap[ug.group_id] || 0) + 1;
          });
        }
      }

      return allGroups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        accountId: group.account_id,
        enterpriseId: group.enterprise_id,
        workstreamId: group.workstream_id,
        workstreamName: group.workstream_id ? workstreamsMap.get(group.workstream_id) || null : null,
        productId: group.product_id,
        productName: group.product_id ? productsMap.get(group.product_id) || null : null,
        serviceId: group.service_id,
        serviceName: group.service_id ? servicesMap.get(group.service_id) || null : null,
        createdAt: group.created_at,
        updatedAt: group.updated_at,
        memberCount: memberCountMap[group.id] || 0,
        roles: groupRolesMap.get(group.id) || [],
      })).sort((a, b) => a.name.localeCompare(b.name)) as Group[];
    },
  });
}

export interface CreateGroupData {
  name: string;
  description?: string;
  accountId?: string;
  enterpriseId?: string;
  workstreamId?: string;
  productId?: string;
  serviceId?: string;
  roleIds?: string[];
}

export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateGroupData) => {
      if (isExternalApi()) {
        const { data: result, error } = await httpClient.post<any>('/api/groups', data);
        if (error) throw new Error(error.message);
        return result;
      }

      // Create the group
      const { data: result, error } = await supabase
        .from("groups")
        .insert({
          name: data.name,
          description: data.description || null,
          account_id: data.accountId || null,
          enterprise_id: data.enterpriseId || null,
          workstream_id: data.workstreamId || null,
          product_id: data.productId || null,
          service_id: data.serviceId || null,
        })
        .select()
        .single();

      if (error) throw error;

      // If roleIds provided, create group_roles entries
      if (data.roleIds && data.roleIds.length > 0) {
        const groupRoles = data.roleIds.map(roleId => ({
          group_id: result.id,
          role_id: roleId,
        }));

        const { error: rolesError } = await supabase
          .from("group_roles")
          .insert(groupRoles);

        if (rolesError) {
          console.error("Failed to add roles to group:", rolesError);
        }
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Group created successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create group: ${error.message}`);
    },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CreateGroupData }) => {
      if (isExternalApi()) {
        const { data: result, error } = await httpClient.put<any>(`/api/groups/${id}`, data);
        if (error) throw new Error(error.message);
        return result;
      }

      // Update the group
      const { data: result, error } = await supabase
        .from("groups")
        .update({
          name: data.name,
          description: data.description || null,
          workstream_id: data.workstreamId || null,
          product_id: data.productId || null,
          service_id: data.serviceId || null,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Update group_roles - delete existing and add new
      if (data.roleIds !== undefined) {
        // Delete existing roles
        await supabase.from("group_roles").delete().eq("group_id", id);

        // Add new roles
        if (data.roleIds.length > 0) {
          const groupRoles = data.roleIds.map(roleId => ({
            group_id: id,
            role_id: roleId,
          }));

          const { error: rolesError } = await supabase
            .from("group_roles")
            .insert(groupRoles);

          if (rolesError) {
            console.error("Failed to update group roles:", rolesError);
          }
        }
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Group updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update group: ${error.message}`);
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/api/groups/${id}`);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase
        .from("groups")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Group deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete group: ${error.message}`);
    },
  });
}

// Role with permissions for group selection
export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  permissions: {
    menuKey: string;
    menuLabel: string;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }[];
}

// Hook to fetch roles filtered by account, enterprise, and optionally workstream
// Also fetches role_permissions to show scopes
// Returns roles that match the selected workstream AND either:
// - Match the specific account/enterprise, OR
// - Have null account/enterprise (global roles available to all)
export function useGroupRoles(accountId?: string | null, enterpriseId?: string | null, workstreamId?: string | null) {
  return useQuery({
    queryKey: ["group-roles-filtered", accountId, enterpriseId, workstreamId],
    queryFn: async () => {
      // If no workstream selected, return empty - don't show any roles
      if (!workstreamId) {
        return [];
      }

      // Fetch all roles for the selected workstream
      const { data: rolesData, error } = await supabase
        .from("roles")
        .select("id, name, description, workstream_id, account_id, enterprise_id")
        .eq("workstream_id", workstreamId)
        .order("name", { ascending: true });

      if (error) throw error;

      if (!rolesData || rolesData.length === 0) return [];

      // Filter client-side: include roles that either:
      // 1. Match the specific account AND enterprise, OR
      // 2. Have null account_id (global roles available to all accounts within the workstream)
      const filteredRoles = rolesData.filter(role => {
        // If role has null account_id, it's available to all accounts within this workstream
        if (role.account_id === null) return true;
        
        // If role has a specific account, check if it matches
        if (accountId && role.account_id === accountId) {
          // Also check enterprise: either matches or is null (global)
          if (role.enterprise_id === null) return true;
          if (enterpriseId && role.enterprise_id === enterpriseId) return true;
        }
        
        return false;
      });

      if (filteredRoles.length === 0) return [];

      // Fetch permissions for filtered roles
      const roleIds = filteredRoles.map(r => r.id);
      const { data: permissionsData, error: permError } = await supabase
        .from("role_permissions")
        .select("role_id, menu_key, menu_label, can_view, can_create, can_edit, can_delete, is_visible")
        .in("role_id", roleIds)
        .eq("is_visible", true);

      if (permError) {
        console.error("Failed to fetch role permissions:", permError);
      }

      // Build permissions map by role_id
      const permissionsMap = new Map<string, RoleWithPermissions["permissions"]>();
      (permissionsData || []).forEach(p => {
        const existing = permissionsMap.get(p.role_id) || [];
        existing.push({
          menuKey: p.menu_key,
          menuLabel: p.menu_label,
          canView: p.can_view ?? false,
          canCreate: p.can_create ?? false,
          canEdit: p.can_edit ?? false,
          canDelete: p.can_delete ?? false,
        });
        permissionsMap.set(p.role_id, existing);
      });

      return filteredRoles.map(role => ({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: permissionsMap.get(role.id) || [],
      })) as RoleWithPermissions[];
    },
    enabled: !!accountId && !!enterpriseId,
  });
}

// Hook to check if a group name already exists within the same account + enterprise combination
// For global groups (null account_id/enterprise_id), checks uniqueness among all global groups
export function useCheckGroupNameExists(
  name: string,
  accountId?: string | null,
  enterpriseId?: string | null,
  excludeGroupId?: string | null // For edit mode - exclude current group
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
        .from("groups")
        .select("id, name, account_id, enterprise_id")
        .ilike("name", trimmedName);

      // Filter by account - if accountId provided, check within that account
      // If no accountId (global group), check among global groups only
      if (accountId) {
        query = query.eq("account_id", accountId);
      } else {
        query = query.is("account_id", null);
      }

      // Filter by enterprise - if enterpriseId provided, check within that enterprise
      // If no enterpriseId, check among groups with null enterprise
      if (enterpriseId) {
        query = query.eq("enterprise_id", enterpriseId);
      } else {
        query = query.is("enterprise_id", null);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error checking group name:", error);
        setIsDuplicate(false);
        return;
      }

      // Check for exact case-insensitive match, excluding current group if editing
      const duplicate = (data || []).some(
        (group) =>
          group.name.toLowerCase() === trimmedName.toLowerCase() &&
          group.id !== excludeGroupId
      );

      setIsDuplicate(duplicate);
    } catch (error) {
      console.error("Error checking group name:", error);
      setIsDuplicate(false);
    } finally {
      setIsChecking(false);
    }
  }, [name, accountId, enterpriseId, excludeGroupId]);

  // Debounce the check
  useEffect(() => {
    const timer = setTimeout(() => {
      checkDuplicate();
    }, 300);

    return () => clearTimeout(timer);
  }, [checkDuplicate]);

  return { isDuplicate, isChecking };
}

