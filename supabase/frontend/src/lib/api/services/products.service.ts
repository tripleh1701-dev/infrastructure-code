/**
 * Products & Services API Service
 * 
 * Provides product and service CRUD operations with automatic provider switching.
 */

import { supabase } from '@/integrations/supabase/client';
import { httpClient } from '../http-client';
import { isExternalApi } from '../config';
import type { Product, Service, ApiResponse } from '../types';

// ============= Supabase Implementation =============

async function getProductsSupabase(): Promise<ApiResponse<Product[]>> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return {
      data: (data || []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        createdAt: p.created_at,
      })),
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function createProductSupabase(name: string): Promise<ApiResponse<Product>> {
  try {
    const { data, error } = await supabase
      .from('products')
      .insert({ name })
      .select()
      .single();

    if (error) return { data: null, error: { message: error.message } };

    return {
      data: { id: data.id, name: data.name, description: data.description, createdAt: data.created_at },
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function updateProductSupabase(id: string, name: string): Promise<ApiResponse<Product>> {
  try {
    const { data, error } = await supabase
      .from('products')
      .update({ name })
      .eq('id', id)
      .select()
      .single();

    if (error) return { data: null, error: { message: error.message } };

    return {
      data: { id: data.id, name: data.name, description: data.description, createdAt: data.created_at },
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function deleteProductSupabase(id: string): Promise<ApiResponse<void>> {
  try {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) return { data: null, error: { message: error.message } };
    return { data: undefined, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function getServicesSupabase(): Promise<ApiResponse<Service[]>> {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return {
      data: (data || []).map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        createdAt: s.created_at,
      })),
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function createServiceSupabase(name: string): Promise<ApiResponse<Service>> {
  try {
    const { data, error } = await supabase
      .from('services')
      .insert({ name })
      .select()
      .single();

    if (error) return { data: null, error: { message: error.message } };

    return {
      data: { id: data.id, name: data.name, description: data.description, createdAt: data.created_at },
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function updateServiceSupabase(id: string, name: string): Promise<ApiResponse<Service>> {
  try {
    const { data, error } = await supabase
      .from('services')
      .update({ name })
      .eq('id', id)
      .select()
      .single();

    if (error) return { data: null, error: { message: error.message } };

    return {
      data: { id: data.id, name: data.name, description: data.description, createdAt: data.created_at },
      error: null,
    };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

async function deleteServiceSupabase(id: string): Promise<ApiResponse<void>> {
  try {
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) return { data: null, error: { message: error.message } };
    return { data: undefined, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unknown error' } };
  }
}

// ============= External API Implementation =============

async function getProductsExternal(): Promise<ApiResponse<Product[]>> {
  return httpClient.get<Product[]>('/products');
}

async function createProductExternal(name: string): Promise<ApiResponse<Product>> {
  return httpClient.post<Product>('/products', { name });
}

async function updateProductExternal(id: string, name: string): Promise<ApiResponse<Product>> {
  return httpClient.put<Product>(`/products/${id}`, { name });
}

async function deleteProductExternal(id: string): Promise<ApiResponse<void>> {
  return httpClient.delete<void>(`/products/${id}`);
}

async function getServicesExternal(): Promise<ApiResponse<Service[]>> {
  return httpClient.get<Service[]>('/services');
}

async function createServiceExternal(name: string): Promise<ApiResponse<Service>> {
  return httpClient.post<Service>('/services', { name });
}

async function updateServiceExternal(id: string, name: string): Promise<ApiResponse<Service>> {
  return httpClient.put<Service>(`/services/${id}`, { name });
}

async function deleteServiceExternal(id: string): Promise<ApiResponse<void>> {
  return httpClient.delete<void>(`/services/${id}`);
}

// ============= Public API =============

export const productsService = {
  getAll: (): Promise<ApiResponse<Product[]>> => {
    return isExternalApi() ? getProductsExternal() : getProductsSupabase();
  },
  create: (name: string): Promise<ApiResponse<Product>> => {
    return isExternalApi() ? createProductExternal(name) : createProductSupabase(name);
  },
  update: (id: string, name: string): Promise<ApiResponse<Product>> => {
    return isExternalApi() ? updateProductExternal(id, name) : updateProductSupabase(id, name);
  },
  delete: (id: string): Promise<ApiResponse<void>> => {
    return isExternalApi() ? deleteProductExternal(id) : deleteProductSupabase(id);
  },
};

export const servicesService = {
  getAll: (): Promise<ApiResponse<Service[]>> => {
    return isExternalApi() ? getServicesExternal() : getServicesSupabase();
  },
  create: (name: string): Promise<ApiResponse<Service>> => {
    return isExternalApi() ? createServiceExternal(name) : createServiceSupabase(name);
  },
  update: (id: string, name: string): Promise<ApiResponse<Service>> => {
    return isExternalApi() ? updateServiceExternal(id, name) : updateServiceSupabase(id, name);
  },
  delete: (id: string): Promise<ApiResponse<void>> => {
    return isExternalApi() ? deleteServiceExternal(id) : deleteServiceSupabase(id);
  },
};
