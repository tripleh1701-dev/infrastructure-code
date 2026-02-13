/**
 * Groups API Service
 * 
 * Provides group CRUD operations with automatic provider switching.
 */

import { supabase } from '@/integrations/supabase/client';
import { httpClient } from '../http-client';
import { isExternalApi } from '../config';
import type { Group, CreateGroupInput, ApiResponse } from '../types';

// ============= Type Transformers =============

function transformGroupFromSupabase(data: any, memberCount: number = 0): Group {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    memberCount,
  };
}

// ============= Supabase Implementation =============

async function getGroupsSupabase(accountId?: string | null): Promise<ApiResponse<Group[]>> {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    // Get member counts
    let userQuery = supabase.from('account_technical_users').select('assigned_group');
    if (accountId) userQuery = userQuery.eq('account_id', accountId);

    const { data: users } = await userQuery;
    const groupCounts = (users || []).reduce((acc, user) => {
      acc[user.assigned_group] = (acc[user.assigned_group] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      data: (data || []).map((group) =>
        transformGroupFromSupabase(group, groupCounts[group.name] || 0)
      ),
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function createGroupSupabase(input: CreateGroupInput): Promise<ApiResponse<Group>> {
  try {
    const { data, error } = await supabase
      .from('groups')
      .insert({
        name: input.name,
        description: input.description || null,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data: transformGroupFromSupabase(data), error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function updateGroupSupabase(id: string, input: CreateGroupInput): Promise<ApiResponse<Group>> {
  try {
    const { data, error } = await supabase
      .from('groups')
      .update({
        name: input.name,
        description: input.description || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data: transformGroupFromSupabase(data), error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function deleteGroupSupabase(id: string): Promise<ApiResponse<void>> {
  try {
    const { error } = await supabase.from('groups').delete().eq('id', id);
    if (error) {
      return { data: null, error: { message: error.message } };
    }
    return { data: undefined, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

// ============= External API Implementation =============

async function getGroupsExternal(accountId?: string | null): Promise<ApiResponse<Group[]>> {
  return httpClient.get<Group[]>('/api/groups', {
    params: { accountId: accountId || undefined },
  });
}

async function createGroupExternal(input: CreateGroupInput): Promise<ApiResponse<Group>> {
  return httpClient.post<Group>('/api/groups', input);
}

async function updateGroupExternal(id: string, input: CreateGroupInput): Promise<ApiResponse<Group>> {
  return httpClient.put<Group>(`/api/groups/${id}`, input);
}

async function deleteGroupExternal(id: string): Promise<ApiResponse<void>> {
  return httpClient.delete<void>(`/api/groups/${id}`);
}

// ============= Public API =============

export const groupsService = {
  getAll: (accountId?: string | null): Promise<ApiResponse<Group[]>> => {
    return isExternalApi() ? getGroupsExternal(accountId) : getGroupsSupabase(accountId);
  },

  create: (input: CreateGroupInput): Promise<ApiResponse<Group>> => {
    return isExternalApi() ? createGroupExternal(input) : createGroupSupabase(input);
  },

  update: (id: string, input: CreateGroupInput): Promise<ApiResponse<Group>> => {
    return isExternalApi() ? updateGroupExternal(id, input) : updateGroupSupabase(id, input);
  },

  delete: (id: string): Promise<ApiResponse<void>> => {
    return isExternalApi() ? deleteGroupExternal(id) : deleteGroupSupabase(id);
  },
};
