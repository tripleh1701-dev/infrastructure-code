import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface RolePermissionTab {
  key: string;
  label: string;
  isVisible: boolean;
}

export interface RolePermission {
  id: string;
  roleId: string;
  menuKey: string;
  menuLabel: string;
  isVisible: boolean;
  tabs: RolePermissionTab[];
  canCreate: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRolePermissionData {
  roleId: string;
  menuKey: string;
  menuLabel: string;
  isVisible: boolean;
  tabs: RolePermissionTab[];
  canCreate: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function useRolePermissions(roleId?: string) {
  return useQuery({
    queryKey: ["rolePermissions", roleId],
    queryFn: async () => {
      if (!roleId) return [];

      if (isExternalApi()) {
        const { data, error } = await httpClient.get<RolePermission[]>(`/api/roles/${roleId}/permissions`);
        if (error) throw new Error(error.message);
        return data || [];
      }
      
      const { data, error } = await supabase
        .from("role_permissions")
        .select("*")
        .eq("role_id", roleId)
        .order("menu_label", { ascending: true });

      if (error) throw error;

      return (data || []).map((p) => ({
        id: p.id,
        roleId: p.role_id,
        menuKey: p.menu_key,
        menuLabel: p.menu_label,
        isVisible: p.is_visible,
        tabs: (p.tabs as unknown as RolePermissionTab[]) || [],
        canCreate: p.can_create,
        canView: p.can_view,
        canEdit: p.can_edit,
        canDelete: p.can_delete,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })) as RolePermission[];
    },
    enabled: !!roleId,
  });
}

export function useCreateRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (permissions: CreateRolePermissionData[]) => {
      if (permissions.length === 0) return [];

      if (isExternalApi()) {
        const { data, error } = await httpClient.post<any[]>('/api/role-permissions', permissions);
        if (error) throw new Error(error.message);
        return data || [];
      }

      const toInsert = permissions.map((p) => ({
        role_id: p.roleId,
        menu_key: p.menuKey,
        menu_label: p.menuLabel,
        is_visible: p.isVisible,
        tabs: JSON.parse(JSON.stringify(p.tabs)),
        can_create: p.canCreate,
        can_view: p.canView,
        can_edit: p.canEdit,
        can_delete: p.canDelete,
      }));

      const { data, error } = await supabase
        .from("role_permissions")
        .insert(toInsert)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rolePermissions"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create role permissions: ${error.message}`);
    },
  });
}

export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, permissions }: { roleId: string; permissions: CreateRolePermissionData[] }) => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.put<any[]>(`/api/roles/${roleId}/permissions`, permissions);
        if (error) throw new Error(error.message);
        return data || [];
      }

      // Delete existing permissions for this role
      const { error: deleteError } = await supabase
        .from("role_permissions")
        .delete()
        .eq("role_id", roleId);

      if (deleteError) throw deleteError;

      // Insert new permissions
      if (permissions.length === 0) return [];

      const toInsert = permissions.map((p) => ({
        role_id: roleId,
        menu_key: p.menuKey,
        menu_label: p.menuLabel,
        is_visible: p.isVisible,
        tabs: JSON.parse(JSON.stringify(p.tabs)),
        can_create: p.canCreate,
        can_view: p.canView,
        can_edit: p.canEdit,
        can_delete: p.canDelete,
      }));

      const { data, error } = await supabase
        .from("role_permissions")
        .insert(toInsert)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rolePermissions"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update role permissions: ${error.message}`);
    },
  });
}

export function useDeleteRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleId: string) => {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/api/roles/${roleId}/permissions`);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase
        .from("role_permissions")
        .delete()
        .eq("role_id", roleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rolePermissions"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete role permissions: ${error.message}`);
    },
  });
}
