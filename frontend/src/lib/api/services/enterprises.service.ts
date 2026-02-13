/**
 * Enterprises API Service
 * 
 * Provides enterprise CRUD operations with automatic provider switching.
 */

import { supabase } from '@/integrations/supabase/client';
import { httpClient } from '../http-client';
import { isExternalApi } from '../config';
import type {
  Enterprise,
  EnterpriseWithDetails,
  CreateEnterpriseInput,
  ApiResponse,
} from '../types';

// ============= Supabase Implementation =============

async function getEnterprisesSupabase(): Promise<ApiResponse<EnterpriseWithDetails[]>> {
  try {
    // Fetch enterprises
    const { data: enterprisesData, error: enterprisesError } = await supabase
      .from('enterprises')
      .select('*')
      .order('created_at', { ascending: false });

    if (enterprisesError) {
      return { data: null, error: { message: enterprisesError.message } };
    }

    // Fetch product linkages
    const { data: productLinkages, error: productError } = await supabase
      .from('enterprise_products')
      .select(`
        enterprise_id,
        product_id,
        products (id, name)
      `);

    if (productError) {
      return { data: null, error: { message: productError.message } };
    }

    // Fetch service linkages
    const { data: serviceLinkages, error: serviceError } = await supabase
      .from('enterprise_services')
      .select(`
        enterprise_id,
        service_id,
        services (id, name)
      `);

    if (serviceError) {
      return { data: null, error: { message: serviceError.message } };
    }

    // Map enterprises with their product and services
    const enterprisesWithDetails: EnterpriseWithDetails[] = (enterprisesData || []).map((enterprise) => {
      const productLink = (productLinkages || []).find(
        (link) => link.enterprise_id === enterprise.id
      );
      const product = productLink?.products
        ? { id: (productLink.products as any).id, name: (productLink.products as any).name }
        : null;

      const linkedServices = (serviceLinkages || [])
        .filter((link) => link.enterprise_id === enterprise.id)
        .map((link) => ({
          id: (link.services as any).id,
          name: (link.services as any).name,
        }));

      return {
        id: enterprise.id,
        name: enterprise.name,
        createdAt: enterprise.created_at,
        updatedAt: enterprise.updated_at,
        product,
        services: linkedServices,
      };
    });

    return { data: enterprisesWithDetails, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function createEnterpriseSupabase(input: CreateEnterpriseInput): Promise<ApiResponse<Enterprise>> {
  try {
    const { data: enterprise, error: enterpriseError } = await supabase
      .from('enterprises')
      .insert({ name: input.name })
      .select()
      .single();

    if (enterpriseError) {
      return { data: null, error: { message: enterpriseError.message } };
    }

    // Link product if provided
    if (input.productId) {
      await supabase.from('enterprise_products').insert({
        enterprise_id: enterprise.id,
        product_id: input.productId,
      });
    }

    // Link services if provided
    if (input.serviceIds && input.serviceIds.length > 0) {
      const serviceLinks = input.serviceIds.map((serviceId) => ({
        enterprise_id: enterprise.id,
        service_id: serviceId,
      }));
      await supabase.from('enterprise_services').insert(serviceLinks);
    }

    return {
      data: {
        id: enterprise.id,
        name: enterprise.name,
        createdAt: enterprise.created_at,
        updatedAt: enterprise.updated_at,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function updateEnterpriseSupabase(
  id: string,
  input: Partial<CreateEnterpriseInput>
): Promise<ApiResponse<Enterprise>> {
  try {
    const updates: any = {};
    if (input.name) updates.name = input.name;

    const { data: enterprise, error: enterpriseError } = await supabase
      .from('enterprises')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (enterpriseError) {
      return { data: null, error: { message: enterpriseError.message } };
    }

    // Update product linkage if provided
    if (input.productId !== undefined) {
      await supabase.from('enterprise_products').delete().eq('enterprise_id', id);
      if (input.productId) {
        await supabase.from('enterprise_products').insert({
          enterprise_id: id,
          product_id: input.productId,
        });
      }
    }

    // Update service linkages if provided
    if (input.serviceIds !== undefined) {
      await supabase.from('enterprise_services').delete().eq('enterprise_id', id);
      if (input.serviceIds.length > 0) {
        const serviceLinks = input.serviceIds.map((serviceId) => ({
          enterprise_id: id,
          service_id: serviceId,
        }));
        await supabase.from('enterprise_services').insert(serviceLinks);
      }
    }

    return {
      data: {
        id: enterprise.id,
        name: enterprise.name,
        createdAt: enterprise.created_at,
        updatedAt: enterprise.updated_at,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function deleteEnterpriseSupabase(id: string): Promise<ApiResponse<void>> {
  try {
    // Delete linkages first
    await supabase.from('enterprise_products').delete().eq('enterprise_id', id);
    await supabase.from('enterprise_services').delete().eq('enterprise_id', id);

    const { error } = await supabase.from('enterprises').delete().eq('id', id);
    if (error) {
      return { data: null, error: { message: error.message } };
    }
    return { data: undefined, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

// ============= External API Implementation =============

async function getEnterprisesExternal(): Promise<ApiResponse<EnterpriseWithDetails[]>> {
  return httpClient.get<EnterpriseWithDetails[]>('/api/enterprises');
}

async function createEnterpriseExternal(input: CreateEnterpriseInput): Promise<ApiResponse<Enterprise>> {
  // Transform frontend shape to backend DTO shape: productId -> products[], serviceIds -> services[]
  const payload: any = { name: input.name };
  if (input.productId) payload.products = [input.productId];
  if (input.serviceIds) payload.services = input.serviceIds;
  return httpClient.post<Enterprise>('/api/enterprises', payload);
}

async function updateEnterpriseExternal(
  id: string,
  input: Partial<CreateEnterpriseInput>
): Promise<ApiResponse<Enterprise>> {
  // Transform frontend shape to backend DTO shape
  const payload: any = {};
  if (input.name) payload.name = input.name;
  if (input.productId !== undefined) payload.products = input.productId ? [input.productId] : [];
  if (input.serviceIds !== undefined) payload.services = input.serviceIds;
  return httpClient.put<Enterprise>(`/api/enterprises/${id}`, payload);
}

async function deleteEnterpriseExternal(id: string): Promise<ApiResponse<void>> {
  return httpClient.delete<void>(`/api/enterprises/${id}`);
}

// ============= Public API =============

export const enterprisesService = {
  getAll: (): Promise<ApiResponse<EnterpriseWithDetails[]>> => {
    return isExternalApi() ? getEnterprisesExternal() : getEnterprisesSupabase();
  },

  create: (input: CreateEnterpriseInput): Promise<ApiResponse<Enterprise>> => {
    return isExternalApi() ? createEnterpriseExternal(input) : createEnterpriseSupabase(input);
  },

  update: (id: string, input: Partial<CreateEnterpriseInput>): Promise<ApiResponse<Enterprise>> => {
    return isExternalApi() ? updateEnterpriseExternal(id, input) : updateEnterpriseSupabase(id, input);
  },

  delete: (id: string): Promise<ApiResponse<void>> => {
    return isExternalApi() ? deleteEnterpriseExternal(id) : deleteEnterpriseSupabase(id);
  },
};
