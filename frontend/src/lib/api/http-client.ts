/**
 * HTTP Client for External API (NestJS + DynamoDB backend)
 *
 * Automatically attaches Cognito JWT tokens from the auth client.
 * Handles token refresh, 401 retry, request/response transforms,
 * timeout, and structured error formatting.
 */

import { API_CONFIG, getApiBaseUrl } from './config';
import { cognitoAuth } from '@/lib/auth/cognito-client';
import type { ApiResponse, ApiError } from './types';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  /** Skip automatic auth header injection (e.g. for public endpoints) */
  skipAuth?: boolean;
  /** Override the default timeout for this request */
  timeout?: number;
}

class HttpClient {
  private baseUrl: string;
  private manualToken: string | null = null;

  constructor() {
    this.baseUrl = getApiBaseUrl();
  }

  /**
   * Manually override the auth token.
   * When set, this takes priority over Cognito auto-token.
   * Pass null to revert to automatic Cognito token resolution.
   */
  setAuthToken(token: string | null) {
    this.manualToken = token;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  // ── URL building ───────────────────────────────────────────────────────────

  /**
   * Centralised API prefix. Every endpoint automatically gets this prefix
   * unless it already starts with it, preventing the class of 404 bugs
   * caused by a missing `/api/` in individual service files.
   */
  private static readonly API_PREFIX = '/api';

  private ensureApiPrefix(endpoint: string): string {
    return ensureApiPrefix(endpoint);
  }

  private buildUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const prefixedEndpoint = this.ensureApiPrefix(endpoint);

    if (!this.baseUrl) {
      console.error(
        '[API] API base URL is not configured. Set VITE_EXTERNAL_API_URL environment variable.'
      );
      return `${window.location.origin}${prefixedEndpoint}`;
    }

    // Concatenate base URL + endpoint properly to preserve the API Gateway
    // stage prefix (e.g. /dev). Using `new URL(endpoint, base)` with a
    // leading-slash endpoint would discard the base path — a known gotcha.
    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const url = new URL(`${base}${prefixedEndpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  // ── Header construction ────────────────────────────────────────────────────

  private getHeaders(skipAuth = false): Headers {
    const headers = new Headers({
      'Content-Type': 'application/json',
    });

    if (skipAuth) return headers;

    // Priority: manual token > Cognito access token
    const token = this.resolveToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  /**
   * Resolve the current auth token.
   * Manual token takes priority; otherwise pull from Cognito.
   */
  private resolveToken(): string | null {
    if (this.manualToken) return this.manualToken;

    const tokens = cognitoAuth.getTokens();
    return tokens?.idToken ?? null;
  }

  // ── Response handling ──────────────────────────────────────────────────────

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      // NestJS TransformInterceptor wraps errors as { data: null, error: { message, code } }
      const nestedError = errorBody?.error;
      const error: ApiError = {
        message: nestedError?.message || errorBody.message || `HTTP error ${response.status}`,
        code: nestedError?.code || errorBody.code || errorBody.error,
        status: response.status,
      };
      return { data: null, error };
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return { data: null, error: null };
    }

    try {
      const rawData = await response.json();

      // Auto-unwrap backend TransformInterceptor envelope: { data: T, error: null }
      // The NestJS interceptor wraps every response as { data, error }.
      // Without this unwrap the caller would see { data: { data: T, error: null }, error: null }.
      if (
        rawData &&
        typeof rawData === 'object' &&
        !Array.isArray(rawData) &&
        'data' in rawData &&
        'error' in rawData
      ) {
        return { data: rawData.data as T, error: rawData.error };
      }

      return { data: rawData as T, error: null };
    } catch {
      return { data: null, error: null };
    }
  }

  // ── Core request with timeout, 401 retry, and logging ──────────────────────

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, options?.params);
    const timeout = options?.timeout ?? API_CONFIG.timeout;
    const skipAuth = options?.skipAuth ?? false;

    if (API_CONFIG.debug) {
      console.log(`[API] ${method} ${url}`, body ?? '');
    }

    const makeRequest = async (): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const fetchOptions: RequestInit = {
          method,
          headers: this.getHeaders(skipAuth),
          signal: controller.signal,
          ...options,
          // Ensure our headers aren't overwritten by spread
        };

        // Re-apply our headers after spread (options might contain custom headers)
        const mergedHeaders = this.getHeaders(skipAuth);
        if (options?.headers) {
          const custom =
            options.headers instanceof Headers
              ? options.headers
              : new Headers(options.headers as Record<string, string>);
          custom.forEach((v, k) => mergedHeaders.set(k, v));
        }
        fetchOptions.headers = mergedHeaders;

        if (body !== undefined) {
          fetchOptions.body = JSON.stringify(body);
        }

        return await fetch(url, fetchOptions);
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      let response = await makeRequest();

      // 401 retry: attempt to refresh the Cognito session once
      if (response.status === 401 && !skipAuth && !this.manualToken) {
        if (API_CONFIG.debug) {
          console.log('[API] 401 received — attempting token refresh');
        }

        const refreshResult = await cognitoAuth.getSession();
        if (refreshResult.data) {
          // Retry the request with the refreshed token
          response = await makeRequest();
        }
      }

      const result = await this.handleResponse<T>(response);

      if (API_CONFIG.debug && result.error) {
        console.error(`[API] ${method} ${url} failed:`, result.error);
      }

      return result;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return {
          data: null,
          error: { message: `Request timed out after ${timeout}ms`, code: 'TIMEOUT' },
        };
      }

      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Network error',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  // ── Public HTTP methods ────────────────────────────────────────────────────

  async get<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', endpoint, undefined, options);
  }

  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('POST', endpoint, body, options);
  }

  async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', endpoint, body, options);
  }

  async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', endpoint, body, options);
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', endpoint, undefined, options);
  }
}

// ── Exported utility (also used by HttpClient internally) ─────────────────────

const API_PREFIX = '/api';

/**
 * Ensures an endpoint string starts with `/api`.
 * Idempotent: endpoints already prefixed are returned unchanged.
 * Exported for unit-testing; used internally by HttpClient.
 */
export function ensureApiPrefix(endpoint: string): string {
  const normalized = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (normalized.startsWith(API_PREFIX + '/') || normalized === API_PREFIX) {
    return normalized;
  }
  return `${API_PREFIX}${normalized}`;
}

// Singleton instance
export const httpClient = new HttpClient();
