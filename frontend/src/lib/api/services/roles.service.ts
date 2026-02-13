/**
 * Roles API Service
 * 
 * Provides role CRUD operations with automatic provider switching.
 */

import { supabase } from '@/integrations/supabase/client';
import { httpClient } from '../http-client';
import { isExternalApi } from '../config';
import type {
  Role,
  CreateRoleInput,
  RolePermission,
  CreateRolePermissionInput,
  ApiResponse,
} from '../types';

// ============= Type Transformers =============

function transformRoleFromSupabase(data: any, userCount: number = 0): Role {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    permissions: data.permissions,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    userCount,
    accountId: data.account_id,
    enterpriseId: data.enterprise_id,
    workstreamId: data.workstream_id,
    productId: data.product_id,
    serviceId: data.service_id,
    workstream: data.workstream,
    product: data.product,
    service: data.service,
  };
}

function transformPermissionFromSupabase(data: any): RolePermission {
  return {
    id: data.id,
    roleId: data.role_id,
    menuKey: data.menu_key,
    menuLabel: data.menu_label,
    isVisible: data.is_visible,
    tabs: data.tabs || [],
    canCreate: data.can_create,
    canView: data.can_view,
    canEdit: data.can_edit,
    canDelete: data.can_delete,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ============= Supabase Implementation =============

async function getRolesSupabase(
  accountId?: string | null,
  enterpriseId?: string | null
): Promise<ApiResponse<Role[]>> {
  try {
    let query = supabase
      .from('roles')
      .select(`
        *,
        workstream:workstreams(id, name),
        product:products(id, name),
        service:services(id, name)
      `)
      .order('name', { ascending: true });

    if (accountId) {
      query = query.or(`account_id.eq.${accountId},account_id.is.null`);
    }
    if (enterpriseId) {
      query = query.or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      return { data: null, error: { message: error.message } };
    }

    // Get user counts
    let userQuery = supabase.from('account_technical_users').select('assigned_role');
    if (accountId) userQuery = userQuery.eq('account_id', accountId);
    if (enterpriseId) userQuery = userQuery.eq('enterprise_id', enterpriseId);

    const { data: users } = await userQuery;
    const roleCounts = (users || []).reduce((acc, user) => {
      acc[user.assigned_role] = (acc[user.assigned_role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Filter roles
    const filteredData = (data || []).filter((role) => {
      if (!role.account_id && !role.enterprise_id) return true;
      if (accountId && role.account_id && role.account_id !== accountId) return false;
      if (enterpriseId && role.enterprise_id && role.enterprise_id !== enterpriseId) return false;
      return true;
    });

    return {
      data: filteredData.map((role) =>
        transformRoleFromSupabase(role, roleCounts[role.name] || 0)
      ),
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function createRoleSupabase(input: CreateRoleInput): Promise<ApiResponse<Role>> {
  try {
    const { data, error } = await supabase
      .from('roles')
      .insert({
        name: input.name,
        description: input.description || null,
        permissions: input.permissions,
        account_id: input.accountId || null,
        enterprise_id: input.enterpriseId || null,
        workstream_id: input.workstreamId || null,
        product_id: input.productId || null,
        service_id: input.serviceId || null,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data: transformRoleFromSupabase(data), error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function updateRoleSupabase(id: string, input: CreateRoleInput): Promise<ApiResponse<Role>> {
  try {
    const { data, error } = await supabase
      .from('roles')
      .update({
        name: input.name,
        description: input.description || null,
        permissions: input.permissions,
        account_id: input.accountId || null,
        enterprise_id: input.enterpriseId || null,
        workstream_id: input.workstreamId || null,
        product_id: input.productId || null,
        service_id: input.serviceId || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data: transformRoleFromSupabase(data), error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function deleteRoleSupabase(id: string): Promise<ApiResponse<void>> {
  try {
    const { error } = await supabase.from('roles').delete().eq('id', id);
    if (error) {
      return { data: null, error: { message: error.message } };
    }
    return { data: undefined, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

// Role Permissions
async function getRolePermissionsSupabase(roleId: string): Promise<ApiResponse<RolePermission[]>> {
  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role_id', roleId)
      .order('menu_label', { ascending: true });

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return {
      data: (data || []).map(transformPermissionFromSupabase),
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function updateRolePermissionsSupabase(
  roleId: string,
  permissions: CreateRolePermissionInput[]
): Promise<ApiResponse<RolePermission[]>> {
  try {
    // Delete existing permissions
    await supabase.from('role_permissions').delete().eq('role_id', roleId);

    if (permissions.length === 0) {
      return { data: [], error: null };
    }

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
      .from('role_permissions')
      .insert(toInsert)
      .select();

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return {
      data: (data || []).map(transformPermissionFromSupabase),
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

// ============= External API Implementation =============

async function getRolesExternal(
  accountId?: string | null,
  enterpriseId?: string | null
): Promise<ApiResponse<Role[]>> {
  return httpClient.get<Role[]>('/api/roles', {
    params: { accountId: accountId || undefined, enterpriseId: enterpriseId || undefined },
  });
}

async function createRoleExternal(input: CreateRoleInput): Promise<ApiResponse<Role>> {
  return httpClient.post<Role>('/api/roles', input);
}

async function updateRoleExternal(id: string, input: CreateRoleInput): Promise<ApiResponse<Role>> {
  return httpClient.put<Role>(`/api/roles/${id}`, input);
}

async function deleteRoleExternal(id: string): Promise<ApiResponse<void>> {
  return httpClient.delete<void>(`/api/roles/${id}`);
}

async function getRolePermissionsExternal(roleId: string): Promise<ApiResponse<RolePermission[]>> {
  return httpClient.get<RolePermission[]>(`/api/roles/${roleId}/permissions`);
}

async function updateRolePermissionsExternal(
  roleId: string,
  permissions: CreateRolePermissionInput[]
): Promise<ApiResponse<RolePermission[]>> {
  return httpClient.put<RolePermission[]>(`/api/roles/${roleId}/permissions`, { permissions });
}

// ============= Public API =============

export const rolesService = {
  getAll: (accountId?: string | null, enterpriseId?: string | null): Promise<ApiResponse<Role[]>> => {
    return isExternalApi() ? getRolesExternal(accountId, enterpriseId) : getRolesSupabase(accountId, enterpriseId);
  },

  create: (input: CreateRoleInput): Promise<ApiResponse<Role>> => {
    return isExternalApi() ? createRoleExternal(input) : createRoleSupabase(input);
  },

  update: (id: string, input: CreateRoleInput): Promise<ApiResponse<Role>> => {
    return isExternalApi() ? updateRoleExternal(id, input) : updateRoleSupabase(id, input);
  },

  delete: (id: string): Promise<ApiResponse<void>> => {
    return isExternalApi() ? deleteRoleExternal(id) : deleteRoleSupabase(id);
  },

  getPermissions: (roleId: string): Promise<ApiResponse<RolePermission[]>> => {
    return isExternalApi() ? getRolePermissionsExternal(roleId) : getRolePermissionsSupabase(roleId);
  },

  updatePermissions: (
    roleId: string,
    permissions: CreateRolePermissionInput[]
  ): Promise<ApiResponse<RolePermission[]>> => {
    return isExternalApi()
      ? updateRolePermissionsExternal(roleId, permissions)
      : updateRolePermissionsSupabase(roleId, permissions);
  },
};
