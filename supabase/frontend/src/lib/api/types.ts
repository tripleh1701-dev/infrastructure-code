/**
 * Shared API Types
 * 
 * These types are used across both Supabase and external API implementations.
 * They provide a consistent interface regardless of the backend.
 */

// ============= Generic API Response Types =============

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============= Account Types =============

export interface Account {
  id: string;
  name: string;
  masterAccountName: string;
  cloudType: 'public' | 'private' | 'hybrid';
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountAddress {
  id: string;
  accountId: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  createdAt: string;
}

export interface AccountWithDetails extends Account {
  addresses: AccountAddress[];
  technicalUsers: TechnicalUser[];
  licenseCount?: number;
  expiringLicenseCount?: number;
}

export interface CreateAccountInput {
  name: string;
  masterAccountName: string;
  cloudType: 'public' | 'private' | 'hybrid';
  addresses: Omit<AccountAddress, 'id' | 'accountId' | 'createdAt'>[];
  technicalUser: Omit<TechnicalUser, 'id' | 'accountId' | 'createdAt' | 'updatedAt'>;
}

export interface UpdateAccountInput extends CreateAccountInput {
  id: string;
}

// ============= Technical User Types =============

export interface TechnicalUser {
  id: string;
  accountId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  status: 'active' | 'inactive';
  startDate: string;
  endDate: string | null;
  assignedGroup: string;
  assignedRole: string;
  isTechnicalUser: boolean;
  enterpriseId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  status: 'active' | 'inactive';
  startDate: string;
  endDate?: string;
  assignedGroup: string;
  assignedRole: string;
  accountId?: string;
  enterpriseId?: string;
  isTechnicalUser?: boolean;
}

// ============= Enterprise Types =============

export interface Enterprise {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseWithDetails extends Enterprise {
  product: { id: string; name: string } | null;
  services: { id: string; name: string }[];
}

export interface CreateEnterpriseInput {
  name: string;
  productId?: string;
  serviceIds?: string[];
}

// ============= License Types =============

export interface License {
  id: string;
  accountId: string;
  enterpriseId: string;
  productId: string;
  serviceId: string;
  startDate: string;
  endDate: string;
  numberOfUsers: number;
  contactFullName: string;
  contactEmail: string;
  contactPhone: string | null;
  contactDepartment: string | null;
  contactDesignation: string | null;
  renewalNotify: boolean;
  noticeDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseWithDetails extends License {
  enterprise: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
  service: { id: string; name: string } | null;
}

export interface CreateLicenseInput {
  accountId: string;
  enterpriseId: string;
  productId: string;
  serviceId: string;
  startDate: string;
  endDate: string;
  numberOfUsers: number;
  contactFullName: string;
  contactEmail: string;
  contactPhone?: string;
  contactDepartment?: string;
  contactDesignation?: string;
  renewalNotify: boolean;
  noticeDays: number;
}

// ============= Workstream Types =============

export interface WorkstreamTool {
  id: string;
  workstreamId: string;
  category: string;
  toolName: string;
  createdAt: string;
}

export interface Workstream {
  id: string;
  name: string;
  accountId: string;
  enterpriseId: string;
  createdAt: string;
  updatedAt: string;
  tools?: WorkstreamTool[];
  account?: { id: string; name: string };
  enterprise?: { id: string; name: string };
}

export interface CreateWorkstreamInput {
  name: string;
  accountId: string;
  enterpriseId: string;
  tools?: { category: string; toolName: string }[];
}

// ============= Role Types =============

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: number;
  createdAt: string;
  updatedAt: string;
  userCount?: number;
  accountId?: string | null;
  enterpriseId?: string | null;
  workstreamId?: string | null;
  productId?: string | null;
  serviceId?: string | null;
  workstream?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
  service?: { id: string; name: string } | null;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: number;
  accountId?: string;
  enterpriseId?: string;
  workstreamId?: string;
  productId?: string;
  serviceId?: string;
}

export interface RolePermissionTab {
  key: string;
  label: string;
  isVisible: boolean;
}

export interface RolePermission {
  id: string;
  roleId: string;
  menuKey: string;
  menuLabel: string;
  isVisible: boolean;
  tabs: RolePermissionTab[];
  canCreate: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRolePermissionInput {
  roleId: string;
  menuKey: string;
  menuLabel: string;
  isVisible: boolean;
  tabs: RolePermissionTab[];
  canCreate: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// ============= Group Types =============

export interface Group {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
}

// ============= Product & Service Types =============

export interface Product {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

// ============= User Workstream Assignment =============

export interface UserWorkstream {
  id: string;
  userId: string;
  workstreamId: string;
  createdAt: string;
  workstream?: { id: string; name: string };
}

// ============= Provisioning Types =============

export type ProvisioningStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface ProvisioningJob {
  id: string;
  accountId: string;
  accountName: string;
  cloudType: 'public' | 'private';
  status: ProvisioningStatus;
  message: string;
  stackId?: string;
  stackName?: string;
  region?: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  progress: number;
  resources?: ProvisioningResource[];
}

export interface ProvisioningResource {
  logicalId: string;
  physicalId?: string;
  type: string;
  status: string;
  statusReason?: string;
}

export interface StartProvisioningInput {
  accountId: string;
  accountName: string;
  cloudType: 'public' | 'private';
}

export interface ProvisioningEvent {
  id: string;
  accountId: string;
  eventType: 'PROVISIONING_STARTED' | 'PROVISIONING_COMPLETED' | 'PROVISIONING_FAILED' | 'DEPROVISIONING_STARTED' | 'DEPROVISIONING_COMPLETED' | 'DEPROVISIONING_FAILED';
  timestamp: string;
  details: Record<string, unknown>;
}

/**
 * Shape returned by backend GET /api/provisioning/:accountId/status
 * Maps to ProvisioningStatusDto on the backend
 */
export interface BackendProvisioningStatus {
  accountId: string;
  accountName: string;
  cloudType: 'public' | 'private' | 'hybrid';
  status: ProvisioningStatus;
  message: string;
  progress: number;
  startedAt: string;
  completedAt?: string;
  stackId?: string;
  tableName?: string;
  tableArn?: string;
  resources: Array<{
    type: 'dynamodb' | 'iam' | 'ssm' | 'cloudformation';
    name: string;
    status: 'pending' | 'creating' | 'active' | 'failed' | 'deleting';
    arn?: string;
  }>;
  error?: string;
}

/**
 * Shape returned by backend POST /api/provisioning (ProvisioningJobDto)
 */
export interface BackendProvisioningJob {
  id: string;
  accountId: string;
  accountName: string;
  cloudType: 'public' | 'private' | 'hybrid';
  status: ProvisioningStatus;
  message: string;
  progress: number;
  startedAt: string;
  completedAt?: string;
  stackId?: string;
  resources: Array<{
    type: 'dynamodb' | 'iam' | 'ssm' | 'cloudformation';
    name: string;
    status: 'pending' | 'creating' | 'active' | 'failed' | 'deleting';
    arn?: string;
  }>;
}
