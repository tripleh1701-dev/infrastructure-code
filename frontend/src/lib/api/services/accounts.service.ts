/**
 * Accounts API Service
 * 
 * Provides account CRUD operations with automatic provider switching.
 * Currently uses Supabase; will route to external API when configured.
 */

import { supabase } from '@/integrations/supabase/client';
import { httpClient } from '../http-client';
import { isExternalApi } from '../config';
import type {
  Account,
  AccountWithDetails,
  AccountAddress,
  TechnicalUser,
  CreateAccountInput,
  UpdateAccountInput,
  ApiResponse,
} from '../types';

// ============= Type Transformers =============

function transformAccountFromSupabase(data: any): Account {
  return {
    id: data.id,
    name: data.name,
    masterAccountName: data.master_account_name,
    cloudType: data.cloud_type,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformAddressFromSupabase(data: any): AccountAddress {
  return {
    id: data.id,
    accountId: data.account_id,
    line1: data.line1,
    line2: data.line2,
    city: data.city,
    state: data.state,
    country: data.country,
    postalCode: data.postal_code,
    createdAt: data.created_at,
  };
}

function transformTechnicalUserFromSupabase(data: any): TechnicalUser {
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

async function getAccountsSupabase(): Promise<ApiResponse<AccountWithDetails[]>> {
  try {
    const { data: accountsData, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (accountsError) {
      return { data: null, error: { message: accountsError.message } };
    }

    const accountsWithDetails: AccountWithDetails[] = await Promise.all(
      (accountsData || []).map(async (account) => {
        const [addressesResult, technicalUsersResult, licensesResult] = await Promise.all([
          supabase.from('account_addresses').select('*').eq('account_id', account.id),
          supabase.from('account_technical_users').select('*').eq('account_id', account.id),
          supabase.from('account_licenses').select('id, end_date').eq('account_id', account.id),
        ]);

        const licenses = licensesResult.data || [];
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        const expiringCount = licenses.filter((l) => {
          const endDate = new Date(l.end_date);
          return endDate > now && endDate <= thirtyDaysFromNow;
        }).length;

        return {
          ...transformAccountFromSupabase(account),
          addresses: (addressesResult.data || []).map(transformAddressFromSupabase),
          technicalUsers: (technicalUsersResult.data || []).map(transformTechnicalUserFromSupabase),
          licenseCount: licenses.length,
          expiringLicenseCount: expiringCount,
        };
      })
    );

    return { data: accountsWithDetails, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function createAccountSupabase(input: CreateAccountInput): Promise<ApiResponse<Account>> {
  try {
    // Create the account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert({
        name: input.name,
        master_account_name: input.masterAccountName,
        cloud_type: input.cloudType,
      })
      .select()
      .single();

    if (accountError) {
      return { data: null, error: { message: accountError.message } };
    }

    // Create addresses
    const addressesToInsert = input.addresses.map((addr) => ({
      account_id: account.id,
      line1: addr.line1,
      line2: addr.line2 || null,
      city: addr.city,
      state: addr.state,
      country: addr.country,
      postal_code: addr.postalCode,
    }));

    const { error: addressError } = await supabase
      .from('account_addresses')
      .insert(addressesToInsert);

    if (addressError) {
      return { data: null, error: { message: addressError.message } };
    }

    // Create technical user
    const { error: userError } = await supabase
      .from('account_technical_users')
      .insert({
        account_id: account.id,
        first_name: input.technicalUser.firstName,
        middle_name: input.technicalUser.middleName || null,
        last_name: input.technicalUser.lastName,
        email: input.technicalUser.email,
        status: input.technicalUser.status,
        start_date: input.technicalUser.startDate,
        end_date: input.technicalUser.endDate || null,
        assigned_group: input.technicalUser.assignedGroup,
        assigned_role: input.technicalUser.assignedRole,
        is_technical_user: true,
      });

    if (userError) {
      return { data: null, error: { message: userError.message } };
    }

    return { data: transformAccountFromSupabase(account), error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function updateAccountSupabase(input: UpdateAccountInput): Promise<ApiResponse<Account>> {
  try {
    // Update the account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .update({
        name: input.name,
        master_account_name: input.masterAccountName,
        cloud_type: input.cloudType,
      })
      .eq('id', input.id)
      .select()
      .single();

    if (accountError) {
      return { data: null, error: { message: accountError.message } };
    }

    // Delete existing addresses and recreate
    await supabase.from('account_addresses').delete().eq('account_id', input.id);

    const addressesToInsert = input.addresses.map((addr) => ({
      account_id: input.id,
      line1: addr.line1,
      line2: addr.line2 || null,
      city: addr.city,
      state: addr.state,
      country: addr.country,
      postal_code: addr.postalCode,
    }));

    const { error: addressError } = await supabase
      .from('account_addresses')
      .insert(addressesToInsert);

    if (addressError) {
      return { data: null, error: { message: addressError.message } };
    }

    // Delete existing technical users and recreate
    await supabase.from('account_technical_users').delete().eq('account_id', input.id);

    const { error: userError } = await supabase
      .from('account_technical_users')
      .insert({
        account_id: input.id,
        first_name: input.technicalUser.firstName,
        middle_name: input.technicalUser.middleName || null,
        last_name: input.technicalUser.lastName,
        email: input.technicalUser.email,
        status: input.technicalUser.status,
        start_date: input.technicalUser.startDate,
        end_date: input.technicalUser.endDate || null,
        assigned_group: input.technicalUser.assignedGroup,
        assigned_role: input.technicalUser.assignedRole,
        is_technical_user: true,
      });

    if (userError) {
      return { data: null, error: { message: userError.message } };
    }

    return { data: transformAccountFromSupabase(account), error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function deleteAccountSupabase(accountId: string): Promise<ApiResponse<void>> {
  try {
    const { error } = await supabase.from('accounts').delete().eq('id', accountId);
    if (error) {
      return { data: null, error: { message: error.message } };
    }
    return { data: undefined, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

// ============= External API Implementation =============

async function getAccountsExternal(): Promise<ApiResponse<AccountWithDetails[]>> {
  return httpClient.get<AccountWithDetails[]>('/api/accounts');
}

async function createAccountExternal(input: CreateAccountInput): Promise<ApiResponse<Account>> {
  return httpClient.post<Account>('/api/accounts', input);
}

async function updateAccountExternal(input: UpdateAccountInput): Promise<ApiResponse<Account>> {
  return httpClient.put<Account>(`/api/accounts/${input.id}`, input);
}

async function deleteAccountExternal(accountId: string): Promise<ApiResponse<void>> {
  return httpClient.delete<void>(`/api/accounts/${accountId}`);
}

// ============= Public API =============

export const accountsService = {
  getAll: (): Promise<ApiResponse<AccountWithDetails[]>> => {
    return isExternalApi() ? getAccountsExternal() : getAccountsSupabase();
  },

  create: (input: CreateAccountInput): Promise<ApiResponse<Account>> => {
    return isExternalApi() ? createAccountExternal(input) : createAccountSupabase(input);
  },

  update: (input: UpdateAccountInput): Promise<ApiResponse<Account>> => {
    return isExternalApi() ? updateAccountExternal(input) : updateAccountSupabase(input);
  },

  delete: (accountId: string): Promise<ApiResponse<void>> => {
    return isExternalApi() ? deleteAccountExternal(accountId) : deleteAccountSupabase(accountId);
  },
};
