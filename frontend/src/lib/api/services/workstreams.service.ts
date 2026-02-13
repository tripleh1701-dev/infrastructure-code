/**
 * Workstreams API Service
 * 
 * Provides workstream CRUD operations with automatic provider switching.
 */

import { supabase } from '@/integrations/supabase/client';
import { httpClient } from '../http-client';
import { isExternalApi } from '../config';
import type {
  Workstream,
  WorkstreamTool,
  CreateWorkstreamInput,
  ApiResponse,
} from '../types';

// Module-level lock to prevent duplicate Default workstream creation
const creatingDefaultLocks = new Map<string, boolean>();

// ============= Type Transformers =============

function transformWorkstreamFromSupabase(data: any): Workstream {
  return {
    id: data.id,
    name: data.name,
    accountId: data.account_id,
    enterpriseId: data.enterprise_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    account: data.account ? { id: data.account.id, name: data.account.name } : undefined,
    enterprise: data.enterprise ? { id: data.enterprise.id, name: data.enterprise.name } : undefined,
    tools: data.tools?.map((t: any) => ({
      id: t.id,
      workstreamId: t.workstream_id,
      category: t.category,
      toolName: t.tool_name,
      createdAt: t.created_at,
    })),
  };
}

// ============= Supabase Implementation =============

async function getWorkstreamsSupabase(
  accountId?: string,
  enterpriseId?: string
): Promise<ApiResponse<Workstream[]>> {
  try {
    let query = supabase
      .from('workstreams')
      .select(`
        *,
        account:accounts(id, name),
        enterprise:enterprises(id, name)
      `)
      .order('created_at', { ascending: false });

    if (accountId) query = query.eq('account_id', accountId);
    if (enterpriseId) query = query.eq('enterprise_id', enterpriseId);

    const { data, error } = await query;
    if (error) {
      return { data: null, error: { message: error.message } };
    }

    // Fetch tools for each workstream
    const workstreamIds = data.map((w) => w.id);
    let tools: any[] = [];
    
    if (workstreamIds.length > 0) {
      const { data: toolsData } = await supabase
        .from('workstream_tools')
        .select('*')
        .in('workstream_id', workstreamIds);
      tools = toolsData || [];
    }

    const workstreams = data.map((w) => ({
      ...transformWorkstreamFromSupabase(w),
      tools: tools
        .filter((t) => t.workstream_id === w.id)
        .map((t) => ({
          id: t.id,
          workstreamId: t.workstream_id,
          category: t.category,
          toolName: t.tool_name,
          createdAt: t.created_at,
        })),
    }));

    return { data: workstreams, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function createWorkstreamSupabase(input: CreateWorkstreamInput): Promise<ApiResponse<Workstream>> {
  try {
    const { data: workstream, error: wsError } = await supabase
      .from('workstreams')
      .insert({
        name: input.name,
        account_id: input.accountId,
        enterprise_id: input.enterpriseId,
      })
      .select()
      .single();

    if (wsError) {
      return { data: null, error: { message: wsError.message } };
    }

    // Create tools
    if (input.tools && input.tools.length > 0) {
      const toolsToInsert = input.tools.map((t) => ({
        workstream_id: workstream.id,
        category: t.category,
        tool_name: t.toolName,
      }));

      await supabase.from('workstream_tools').insert(toolsToInsert);
    }

    return {
      data: {
        id: workstream.id,
        name: workstream.name,
        accountId: workstream.account_id,
        enterpriseId: workstream.enterprise_id,
        createdAt: workstream.created_at,
        updatedAt: workstream.updated_at,
        tools: [],
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function updateWorkstreamSupabase(
  id: string,
  input: Partial<CreateWorkstreamInput>
): Promise<ApiResponse<Workstream>> {
  try {
    if (input.name) {
      const { error } = await supabase
        .from('workstreams')
        .update({ name: input.name })
        .eq('id', id);
      if (error) {
        return { data: null, error: { message: error.message } };
      }
    }

    if (input.tools !== undefined) {
      await supabase.from('workstream_tools').delete().eq('workstream_id', id);

      if (input.tools.length > 0) {
        const toolsToInsert = input.tools.map((t) => ({
          workstream_id: id,
          category: t.category,
          tool_name: t.toolName,
        }));
        await supabase.from('workstream_tools').insert(toolsToInsert);
      }
    }

    const { data: workstream } = await supabase
      .from('workstreams')
      .select('*')
      .eq('id', id)
      .single();

    return {
      data: workstream
        ? {
            id: workstream.id,
            name: workstream.name,
            accountId: workstream.account_id,
            enterpriseId: workstream.enterprise_id,
            createdAt: workstream.created_at,
            updatedAt: workstream.updated_at,
          }
        : null,
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function deleteWorkstreamSupabase(id: string): Promise<ApiResponse<void>> {
  try {
    const { error } = await supabase.from('workstreams').delete().eq('id', id);
    if (error) {
      return { data: null, error: { message: error.message } };
    }
    return { data: undefined, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function ensureDefaultWorkstreamSupabase(
  accountId: string,
  enterpriseId: string
): Promise<ApiResponse<string>> {
  const lockKey = `${accountId}-${enterpriseId}`;

  if (creatingDefaultLocks.get(lockKey)) {
    return { data: null, error: null };
  }

  creatingDefaultLocks.set(lockKey, true);

  try {
    // Check if Default workstream already exists
    const { data: existing } = await supabase
      .from('workstreams')
      .select('id')
      .eq('account_id', accountId)
      .eq('enterprise_id', enterpriseId)
      .eq('name', 'Default')
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { data: existing.id, error: null };
    }

    // Check if ANY workstream exists
    const { data: anyExisting } = await supabase
      .from('workstreams')
      .select('id')
      .eq('account_id', accountId)
      .eq('enterprise_id', enterpriseId)
      .limit(1);

    if (anyExisting && anyExisting.length > 0) {
      return { data: anyExisting[0].id, error: null };
    }

    // Create Default workstream
    const { data: created, error } = await supabase
      .from('workstreams')
      .insert({
        name: 'Default',
        account_id: accountId,
        enterprise_id: enterpriseId,
      })
      .select()
      .single();

    if (error) {
      const { data: refetch } = await supabase
        .from('workstreams')
        .select('id')
        .eq('account_id', accountId)
        .eq('enterprise_id', enterpriseId)
        .limit(1)
        .maybeSingle();

      return { data: refetch?.id || null, error: null };
    }

    return { data: created?.id || null, error: null };
  } finally {
    creatingDefaultLocks.set(lockKey, false);
  }
}

// ============= External API Implementation =============

async function getWorkstreamsExternal(
  accountId?: string,
  enterpriseId?: string
): Promise<ApiResponse<Workstream[]>> {
  return httpClient.get<Workstream[]>('/api/workstreams', { params: { accountId, enterpriseId } });
}

async function createWorkstreamExternal(input: CreateWorkstreamInput): Promise<ApiResponse<Workstream>> {
  return httpClient.post<Workstream>('/api/workstreams', input);
}

async function updateWorkstreamExternal(
  id: string,
  input: Partial<CreateWorkstreamInput>
): Promise<ApiResponse<Workstream>> {
  return httpClient.put<Workstream>(`/api/workstreams/${id}`, input);
}

async function deleteWorkstreamExternal(id: string): Promise<ApiResponse<void>> {
  return httpClient.delete<void>(`/api/workstreams/${id}`);
}

async function ensureDefaultWorkstreamExternal(
  accountId: string,
  enterpriseId: string
): Promise<ApiResponse<string>> {
  return httpClient.post<string>('/api/workstreams/ensure-default', { accountId, enterpriseId });
}

// ============= Public API =============

export const workstreamsService = {
  getAll: (accountId?: string, enterpriseId?: string): Promise<ApiResponse<Workstream[]>> => {
    return isExternalApi()
      ? getWorkstreamsExternal(accountId, enterpriseId)
      : getWorkstreamsSupabase(accountId, enterpriseId);
  },

  create: (input: CreateWorkstreamInput): Promise<ApiResponse<Workstream>> => {
    return isExternalApi() ? createWorkstreamExternal(input) : createWorkstreamSupabase(input);
  },

  update: (id: string, input: Partial<CreateWorkstreamInput>): Promise<ApiResponse<Workstream>> => {
    return isExternalApi() ? updateWorkstreamExternal(id, input) : updateWorkstreamSupabase(id, input);
  },

  delete: (id: string): Promise<ApiResponse<void>> => {
    return isExternalApi() ? deleteWorkstreamExternal(id) : deleteWorkstreamSupabase(id);
  },

  ensureDefault: (accountId: string, enterpriseId: string): Promise<ApiResponse<string>> => {
    return isExternalApi()
      ? ensureDefaultWorkstreamExternal(accountId, enterpriseId)
      : ensureDefaultWorkstreamSupabase(accountId, enterpriseId);
  },
};
