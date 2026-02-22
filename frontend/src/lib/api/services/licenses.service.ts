/**
 * Licenses API Service
 * 
 * Provides license CRUD operations with automatic provider switching.
 */

import { supabase } from '@/integrations/supabase/client';
import { httpClient } from '../http-client';
import { isExternalApi } from '../config';
import type {
  License,
  LicenseWithDetails,
  CreateLicenseInput,
  ApiResponse,
} from '../types';

// ============= Type Transformers =============

function transformLicenseFromSupabase(data: any): LicenseWithDetails {
  return {
    id: data.id,
    accountId: data.account_id,
    enterpriseId: data.enterprise_id,
    productId: data.product_id,
    serviceId: data.service_id,
    startDate: data.start_date,
    endDate: data.end_date,
    numberOfUsers: data.number_of_users,
    contactFullName: data.contact_full_name,
    contactEmail: data.contact_email,
    contactPhone: data.contact_phone,
    contactDepartment: data.contact_department,
    contactDesignation: data.contact_designation,
    renewalNotify: data.renewal_notify,
    noticeDays: data.notice_days,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    enterprise: data.enterprises ? { id: data.enterprises.id, name: data.enterprises.name } : null,
    product: data.products ? { id: data.products.id, name: data.products.name } : null,
    service: data.services ? { id: data.services.id, name: data.services.name } : null,
  };
}

// ============= Supabase Implementation =============

async function getLicensesSupabase(accountId: string): Promise<ApiResponse<LicenseWithDetails[]>> {
  try {
    const { data, error } = await supabase
      .from('account_licenses')
      .select(`
        *,
        enterprises (id, name),
        products (id, name),
        services (id, name)
      `)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return {
      data: (data || []).map(transformLicenseFromSupabase),
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function createLicenseSupabase(input: CreateLicenseInput): Promise<ApiResponse<License>> {
  try {
    const { data, error } = await supabase
      .from('account_licenses')
      .insert({
        account_id: input.accountId,
        enterprise_id: input.enterpriseId,
        product_id: input.productId,
        service_id: input.serviceId,
        start_date: input.startDate,
        end_date: input.endDate,
        number_of_users: input.numberOfUsers,
        contact_full_name: input.contactFullName,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone || null,
        contact_department: input.contactDepartment || null,
        contact_designation: input.contactDesignation || null,
        renewal_notify: input.renewalNotify,
        notice_days: input.noticeDays,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return {
      data: {
        id: data.id,
        accountId: data.account_id,
        enterpriseId: data.enterprise_id,
        productId: data.product_id,
        serviceId: data.service_id,
        startDate: data.start_date,
        endDate: data.end_date,
        numberOfUsers: data.number_of_users,
        contactFullName: data.contact_full_name,
        contactEmail: data.contact_email,
        contactPhone: data.contact_phone,
        contactDepartment: data.contact_department,
        contactDesignation: data.contact_designation,
        renewalNotify: data.renewal_notify,
        noticeDays: data.notice_days,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function updateLicenseSupabase(
  id: string,
  input: Partial<CreateLicenseInput>
): Promise<ApiResponse<License>> {
  try {
    const updateData: any = {};
    
    if (input.enterpriseId !== undefined) updateData.enterprise_id = input.enterpriseId;
    if (input.productId !== undefined) updateData.product_id = input.productId;
    if (input.serviceId !== undefined) updateData.service_id = input.serviceId;
    if (input.startDate !== undefined) updateData.start_date = input.startDate;
    if (input.endDate !== undefined) updateData.end_date = input.endDate;
    if (input.numberOfUsers !== undefined) updateData.number_of_users = input.numberOfUsers;
    if (input.contactFullName !== undefined) updateData.contact_full_name = input.contactFullName;
    if (input.contactEmail !== undefined) updateData.contact_email = input.contactEmail;
    if (input.contactPhone !== undefined) updateData.contact_phone = input.contactPhone || null;
    if (input.contactDepartment !== undefined) updateData.contact_department = input.contactDepartment || null;
    if (input.contactDesignation !== undefined) updateData.contact_designation = input.contactDesignation || null;
    if (input.renewalNotify !== undefined) updateData.renewal_notify = input.renewalNotify;
    if (input.noticeDays !== undefined) updateData.notice_days = input.noticeDays;

    const { data, error } = await supabase
      .from('account_licenses')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return {
      data: {
        id: data.id,
        accountId: data.account_id,
        enterpriseId: data.enterprise_id,
        productId: data.product_id,
        serviceId: data.service_id,
        startDate: data.start_date,
        endDate: data.end_date,
        numberOfUsers: data.number_of_users,
        contactFullName: data.contact_full_name,
        contactEmail: data.contact_email,
        contactPhone: data.contact_phone,
        contactDepartment: data.contact_department,
        contactDesignation: data.contact_designation,
        renewalNotify: data.renewal_notify,
        noticeDays: data.notice_days,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function deleteLicenseSupabase(id: string): Promise<ApiResponse<void>> {
  try {
    const { error } = await supabase.from('account_licenses').delete().eq('id', id);
    if (error) {
      return { data: null, error: { message: error.message } };
    }
    return { data: undefined, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

// ============= External API Implementation =============

async function getLicensesExternal(accountId: string): Promise<ApiResponse<LicenseWithDetails[]>> {
  return httpClient.get<LicenseWithDetails[]>('/licenses', { params: { accountId } });
}

async function createLicenseExternal(input: CreateLicenseInput): Promise<ApiResponse<License>> {
  return httpClient.post<License>('/licenses', input);
}

async function updateLicenseExternal(
  id: string,
  input: Partial<CreateLicenseInput>
): Promise<ApiResponse<License>> {
  return httpClient.put<License>(`/licenses/${id}`, input);
}

async function deleteLicenseExternal(id: string): Promise<ApiResponse<void>> {
  return httpClient.delete<void>(`/licenses/${id}`);
}

// ============= Public API =============

export const licensesService = {
  getByAccount: (accountId: string): Promise<ApiResponse<LicenseWithDetails[]>> => {
    return isExternalApi() ? getLicensesExternal(accountId) : getLicensesSupabase(accountId);
  },

  create: (input: CreateLicenseInput): Promise<ApiResponse<License>> => {
    return isExternalApi() ? createLicenseExternal(input) : createLicenseSupabase(input);
  },

  update: (id: string, input: Partial<CreateLicenseInput>): Promise<ApiResponse<License>> => {
    return isExternalApi() ? updateLicenseExternal(id, input) : updateLicenseSupabase(id, input);
  },

  delete: (id: string): Promise<ApiResponse<void>> => {
    return isExternalApi() ? deleteLicenseExternal(id) : deleteLicenseSupabase(id);
  },
};
