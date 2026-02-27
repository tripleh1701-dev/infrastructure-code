/**
 * Users API Service
 * 
 * Provides user CRUD operations with automatic provider switching.
 */

import { supabase } from '@/integrations/supabase/client';
import { httpClient } from '../http-client';
import { isExternalApi } from '../config';
import { workstreamsService } from './workstreams.service';
import type {
  TechnicalUser,
  CreateUserInput,
  UserWorkstream,
  ApiResponse,
} from '../types';

const GLOBAL_ENTERPRISE_ID = '00000000-0000-0000-0000-000000000001';

// Extended user type with workstreams
export interface UserWithWorkstreams extends TechnicalUser {
  accountName?: string;
  enterpriseName?: string;
  workstreams: { id: string; workstreamId: string; workstreamName: string }[];
}

// ============= Type Transformers =============

function transformUserFromSupabase(data: any): TechnicalUser {
  return {
    id: data.id,
    accountId: data.account_id,
    firstName: data.first_name,
    middleName: data.middle_name,
    lastName: data.last_name,
    email: data.email,
    status: data.status,
    startDate: data.start_date,
    endDate: data.end_date,
    assignedGroup: data.assigned_group,
    assignedRole: data.assigned_role,
    isTechnicalUser: data.is_technical_user,
    enterpriseId: data.enterprise_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ============= Supabase Implementation =============

async function getUsersSupabase(
  accountId?: string | null,
  enterpriseId?: string | null
): Promise<ApiResponse<UserWithWorkstreams[]>> {
  try {
    let query = supabase
      .from('account_technical_users')
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
        updated_at,
        accounts!account_technical_users_account_id_fkey (name),
        enterprises (name)
      `)
      .order('created_at', { ascending: false });

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    if (enterpriseId) {
      if (enterpriseId === GLOBAL_ENTERPRISE_ID) {
        query = query.or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`);
      } else {
        query = query.or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`);
      }
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    // Fetch workstream assignments
    const userIds = (data || []).map((u: any) => u.id);
    let workstreamMap: Record<string, { id: string; workstreamId: string; workstreamName: string }[]> = {};

    if (userIds.length > 0) {
      const { data: userWorkstreams } = await supabase
        .from('user_workstreams')
        .select(`
          id,
          user_id,
          workstream_id,
          workstreams (id, name)
        `)
        .in('user_id', userIds);

      if (userWorkstreams) {
        userWorkstreams.forEach((uw: any) => {
          if (!workstreamMap[uw.user_id]) {
            workstreamMap[uw.user_id] = [];
          }
          if (uw.workstreams) {
            const existingNames = workstreamMap[uw.user_id].map((w) => w.workstreamName);
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

      // Auto-assign Default workstream to technical users without workstreams
      if (accountId && enterpriseId) {
        const defaultResult = await workstreamsService.ensureDefault(accountId, enterpriseId);
        const defaultWorkstreamId = defaultResult.data;

        if (defaultWorkstreamId) {
          const { data: wsData } = await supabase
            .from('workstreams')
            .select('name')
            .eq('id', defaultWorkstreamId)
            .maybeSingle();

          const workstreamName = wsData?.name || 'Default';

          for (const user of data || []) {
            if ((user as any).is_technical_user && !workstreamMap[(user as any).id]?.length) {
              const { data: inserted } = await supabase
                .from('user_workstreams')
                .insert({
                  user_id: (user as any).id,
                  workstream_id: defaultWorkstreamId,
                })
                .select()
                .single();

              if (inserted) {
                workstreamMap[(user as any).id] = [
                  {
                    id: inserted.id,
                    workstreamId: defaultWorkstreamId,
                    workstreamName,
                  },
                ];
              }
            }
          }
        }
      }
    }

    const users: UserWithWorkstreams[] = (data || []).map((user: any) => ({
      ...transformUserFromSupabase(user),
      accountName: user.accounts?.name,
      enterpriseName: user.enterprises?.name,
      workstreams: workstreamMap[user.id] || [],
    }));

    return { data: users, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function createUserSupabase(input: CreateUserInput): Promise<ApiResponse<TechnicalUser>> {
  try {
    const insertData: any = {
      first_name: input.firstName,
      middle_name: input.middleName || null,
      last_name: input.lastName,
      email: input.email,
      status: input.status,
      start_date: input.startDate,
      end_date: input.endDate || null,
      assigned_group: input.assignedGroup,
      assigned_role: input.assignedRole,
      is_technical_user: input.isTechnicalUser || false,
    };

    if (input.accountId) insertData.account_id = input.accountId;
    if (input.enterpriseId) insertData.enterprise_id = input.enterpriseId;

    const { data, error } = await supabase
      .from('account_technical_users')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data: transformUserFromSupabase(data), error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function updateUserSupabase(
  id: string,
  input: Partial<CreateUserInput>
): Promise<ApiResponse<TechnicalUser>> {
  try {
    const updateData: any = {};

    if (input.firstName !== undefined) updateData.first_name = input.firstName;
    if (input.middleName !== undefined) updateData.middle_name = input.middleName || null;
    if (input.lastName !== undefined) updateData.last_name = input.lastName;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.startDate !== undefined) updateData.start_date = input.startDate;
    if (input.endDate !== undefined) updateData.end_date = input.endDate || null;
    if (input.assignedGroup !== undefined) updateData.assigned_group = input.assignedGroup;
    if (input.assignedRole !== undefined) updateData.assigned_role = input.assignedRole;
    if (input.isTechnicalUser !== undefined) updateData.is_technical_user = input.isTechnicalUser;

    const { data, error } = await supabase
      .from('account_technical_users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data: transformUserFromSupabase(data), error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function deleteUserSupabase(id: string): Promise<ApiResponse<void>> {
  try {
    const { error } = await supabase.from('account_technical_users').delete().eq('id', id);
    if (error) {
      return { data: null, error: { message: error.message } };
    }
    return { data: undefined, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function updateUserWorkstreamsSupabase(
  userId: string,
  workstreamIds: string[]
): Promise<ApiResponse<void>> {
  try {
    await supabase.from('user_workstreams').delete().eq('user_id', userId);

    if (workstreamIds.length > 0) {
      const assignments = workstreamIds.map((wsId) => ({
        user_id: userId,
        workstream_id: wsId,
      }));

      const { error } = await supabase.from('user_workstreams').insert(assignments);
      if (error) {
        return { data: null, error: { message: error.message } };
      }
    }

    return { data: undefined, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

// ============= External API Implementation =============

async function getUsersExternal(
  accountId?: string | null,
  enterpriseId?: string | null
): Promise<ApiResponse<UserWithWorkstreams[]>> {
  return httpClient.get<UserWithWorkstreams[]>('/users', {
    params: { accountId: accountId || undefined, enterpriseId: enterpriseId || undefined },
  });
}

async function createUserExternal(input: CreateUserInput): Promise<ApiResponse<TechnicalUser>> {
  return httpClient.post<TechnicalUser>('/users', input);
}

async function updateUserExternal(
  id: string,
  input: Partial<CreateUserInput>
): Promise<ApiResponse<TechnicalUser>> {
  return httpClient.put<TechnicalUser>(`/users/${id}`, input);
}

async function deleteUserExternal(id: string): Promise<ApiResponse<void>> {
  return httpClient.delete<void>(`/users/${id}`);
}

async function updateUserWorkstreamsExternal(
  userId: string,
  workstreamIds: string[]
): Promise<ApiResponse<void>> {
  return httpClient.put<void>(`/users/${userId}/workstreams`, { workstreamIds });
}

// ============= Public API =============

export const usersService = {
  getAll: (
    accountId?: string | null,
    enterpriseId?: string | null
  ): Promise<ApiResponse<UserWithWorkstreams[]>> => {
    return isExternalApi() ? getUsersExternal(accountId, enterpriseId) : getUsersSupabase(accountId, enterpriseId);
  },

  create: (input: CreateUserInput): Promise<ApiResponse<TechnicalUser>> => {
    return isExternalApi() ? createUserExternal(input) : createUserSupabase(input);
  },

  update: (id: string, input: Partial<CreateUserInput>): Promise<ApiResponse<TechnicalUser>> => {
    return isExternalApi() ? updateUserExternal(id, input) : updateUserSupabase(id, input);
  },

  delete: (id: string): Promise<ApiResponse<void>> => {
    return isExternalApi() ? deleteUserExternal(id) : deleteUserSupabase(id);
  },

  updateWorkstreams: (userId: string, workstreamIds: string[]): Promise<ApiResponse<void>> => {
    return isExternalApi()
      ? updateUserWorkstreamsExternal(userId, workstreamIds)
      : updateUserWorkstreamsSupabase(userId, workstreamIds);
  },
};
