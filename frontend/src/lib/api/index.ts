/**
 * API Service Layer
 * 
 * This module exports all API services and utilities for data operations.
 * 
 * USAGE:
 * 
 * 1. Current state (Supabase):
 *    The services automatically use Supabase as the backend.
 * 
 * 2. To switch to your Node.js + DynamoDB backend:
 *    a. Set environment variable: VITE_API_PROVIDER=external
 *    b. Set environment variable: VITE_EXTERNAL_API_URL=https://your-api.com
 *    c. The services will automatically route to your external API
 * 
 * 3. All services follow the same pattern:
 *    - They return ApiResponse<T> with { data, error }
 *    - They handle both Supabase and external API implementations
 *    - Type transformations are handled internally
 * 
 * EXAMPLE:
 * 
 * ```typescript
 * import { accountsService } from '@/lib/api';
 * 
 * // Fetch all accounts
 * const { data, error } = await accountsService.getAll();
 * if (error) {
 *   console.error(error.message);
 * } else {
 *   console.log(data);
 * }
 * 
 * // Create an account
 * const { data: newAccount, error: createError } = await accountsService.create({
 *   name: 'New Account',
 *   masterAccountName: 'Master',
 *   cloudType: 'public',
 *   addresses: [...],
 *   technicalUser: {...}
 * });
 * ```
 */

// Configuration
export { API_CONFIG, isExternalApi, getApiBaseUrl } from './config';
export type { ApiProvider } from './config';

// HTTP Client (for custom requests)
export { httpClient } from './http-client';

// Types
export type {
  ApiResponse,
  ApiError,
  PaginatedResponse,
  Account,
  AccountAddress,
  AccountWithDetails,
  CreateAccountInput,
  UpdateAccountInput,
  TechnicalUser,
  CreateUserInput,
  Enterprise,
  EnterpriseWithDetails,
  CreateEnterpriseInput,
  License,
  LicenseWithDetails,
  CreateLicenseInput,
  Workstream,
  WorkstreamTool,
  CreateWorkstreamInput,
  Role,
  CreateRoleInput,
  RolePermission,
  RolePermissionTab,
  CreateRolePermissionInput,
  Group,
  CreateGroupInput,
  Product,
  Service,
  UserWorkstream,
  ProvisioningJob,
  ProvisioningStatus,
  ProvisioningResource,
  ProvisioningEvent,
  StartProvisioningInput,
} from './types';

// Services
export { accountsService } from './services/accounts.service';
export { enterprisesService } from './services/enterprises.service';
export { licensesService } from './services/licenses.service';
export { workstreamsService } from './services/workstreams.service';
export { rolesService } from './services/roles.service';
export { groupsService } from './services/groups.service';
export { usersService, type UserWithWorkstreams } from './services/users.service';
export { productsService, servicesService } from './services/products.service';
export * as provisioningService from './services/provisioning.service';
export { executionsService } from './services/executions.service';
export { buildsService } from './services/builds.service';
export { connectorsService } from './services/connectors.service';
export type { Connector, CreateConnectorInput, UpdateConnectorInput } from './services/connectors.service';
export { credentialsService } from './services/credentials.service';
export type { Credential as CredentialRecord, CreateCredentialInput, UpdateCredentialInput } from './services/credentials.service';
