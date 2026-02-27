/**
 * API Configuration
 * 
 * This module configures the API backend provider.
 * Set API_PROVIDER to 'external' and provide EXTERNAL_API_BASE_URL
 * when you're ready to switch to your Node.js + DynamoDB backend.
 */

export type ApiProvider = 'supabase' | 'external';

// Configuration - change these values when switching to external API
export const API_CONFIG = {
  // Set to 'external' when your Node.js backend is ready
  provider: (import.meta.env.VITE_API_PROVIDER as ApiProvider) || 'supabase',
  
  // Your Node.js API base URL (e.g., 'https://api.yourapp.com' or AWS API Gateway URL)
  externalBaseUrl: import.meta.env.VITE_EXTERNAL_API_URL || '',
  
  // Request timeout in milliseconds
  timeout: 30000,
  
  // Enable request logging in development
  debug: import.meta.env.DEV,
};

// Helper to check if using external API
export function isExternalApi(): boolean {
  return API_CONFIG.provider === 'external';
}

// Helper to get the API base URL
export function getApiBaseUrl(): string {
  return API_CONFIG.externalBaseUrl;
}
