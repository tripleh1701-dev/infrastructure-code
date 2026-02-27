import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminDeleteUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  MessageActionType,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';

/**
 * Result of a Cognito user provisioning operation
 */
export interface CognitoProvisioningResult {
  cognitoSub: string | null;
  created: boolean;
  updated: boolean;
  skipped: boolean;
  reason?: string;
  /** The password assigned during creation (only set when created=true) */
  temporaryPassword?: string;
}

export interface CognitoDeprovisionResult {
  disabled: boolean;
  deleted: boolean;
  skipped: boolean;
  reason?: string;
}

export interface CreateCognitoUserParams {
  email: string;
  firstName: string;
  lastName: string;
  accountId: string;
  enterpriseId?: string;
  role: string;
  groupName?: string;
  temporaryPassword?: string;
}

export interface UpdateCognitoUserParams {
  email: string;
  firstName?: string;
  lastName?: string;
  accountId?: string;
  enterpriseId?: string;
  role?: string;
  status?: string;
}

/**
 * CognitoUserProvisioningService
 *
 * Manages runtime Cognito user lifecycle during account onboarding
 * and technical user management. Separate from CognitoBootstrapService
 * which handles Day-0 admin provisioning only.
 *
 * Responsibilities:
 *  - Create Cognito users when technical users are added via the platform UI
 *  - Update user attributes when user profiles are modified
 *  - Disable/enable users when status changes (active ↔ inactive)
 *  - Remove users from Cognito when deleted from the platform
 *
 * All operations are idempotent and gracefully degrade when Cognito
 * is not configured (e.g., local development without a User Pool).
 */
@Injectable()
export class CognitoUserProvisioningService {
  private readonly logger = new Logger(CognitoUserProvisioningService.name);
  private client: CognitoIdentityProviderClient | null = null;
  private userPoolId: string;

  constructor(private readonly configService: ConfigService) {
    this.userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID', '');

    if (this.userPoolId) {
      const region = this.configService.get<string>('COGNITO_REGION', 'us-east-1');
      this.client = new CognitoIdentityProviderClient({ region });
      this.logger.log('Cognito user provisioning service initialized');
    } else {
      this.logger.warn(
        'COGNITO_USER_POOL_ID not configured — Cognito user provisioning disabled',
      );
    }
  }

  /**
   * Check if Cognito provisioning is available
   */
  isConfigured(): boolean {
    return !!(this.userPoolId && this.client);
  }

  // ─── CREATE ────────────────────────────────────────────────────────────

  /**
   * Provision a new user in Cognito User Pool.
   * Idempotent: if the user already exists, attributes are updated instead.
   *
   * @returns The Cognito sub (UUID) and whether the user was newly created
   */
  async createUser(params: CreateCognitoUserParams): Promise<CognitoProvisioningResult> {
    if (!this.isConfigured()) {
      this.logger.warn(`Cognito not configured — skipping user creation for ${params.email}`);
      return { cognitoSub: null, created: false, updated: false, skipped: true, reason: 'Cognito not configured' };
    }

    const userAttributes = this.buildUserAttributes(params);

    // Check if user already exists (idempotent)
    try {
      const existing = await this.client!.send(
        new AdminGetUserCommand({
          UserPoolId: this.userPoolId,
          Username: params.email,
        }),
      );

      // User exists — update attributes
      await this.client!.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: this.userPoolId,
          Username: params.email,
          UserAttributes: userAttributes,
        }),
      );

      const sub = existing.UserAttributes?.find((a: any) => a.Name === 'sub')?.Value || null;
      this.logger.log(`Cognito user already exists: ${params.email} (sub: ${sub}), attributes updated`);

      // Ensure group membership if specified
      if (params.groupName) {
        await this.ensureGroupMembership(params.email, params.groupName);
      }

      return { cognitoSub: sub, created: false, updated: true, skipped: false };
    } catch (error: any) {
      if (error.name !== 'UserNotFoundException') {
        this.logger.error(`Failed to check existing user ${params.email}: ${error.message}`);
        throw error;
      }
    }

    // User does not exist — create
    const password = params.temporaryPassword || this.generateTemporaryPassword();

    try {
      const createResult = await this.client!.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: params.email,
          UserAttributes: userAttributes,
          MessageAction: MessageActionType.SUPPRESS, // Suppress welcome email; password delivered via platform
          TemporaryPassword: password,
        }),
      );

      const sub = createResult.User?.Attributes?.find((a: any) => a.Name === 'sub')?.Value || null;

      // Set permanent password so user doesn't face forced-change on first login
      await this.client!.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.userPoolId,
          Username: params.email,
          Password: password,
          Permanent: true,
        }),
      );

      // Assign to group if specified
      if (params.groupName) {
        await this.ensureGroupMembership(params.email, params.groupName);
      }

      this.logger.log(`Created Cognito user: ${params.email} (sub: ${sub})`);
      return { cognitoSub: sub, created: true, updated: false, skipped: false, temporaryPassword: password };
    } catch (error: any) {
      this.logger.error(`Failed to create Cognito user ${params.email}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────

  /**
   * Update a Cognito user's attributes.
   * Also handles status transitions (active ↔ inactive → enable/disable).
   */
  async updateUser(params: UpdateCognitoUserParams): Promise<CognitoProvisioningResult> {
    if (!this.isConfigured()) {
      this.logger.warn(`Cognito not configured — skipping user update for ${params.email}`);
      return { cognitoSub: null, created: false, updated: false, skipped: true, reason: 'Cognito not configured' };
    }

    // Verify user exists
    let sub: string | null = null;
    try {
      const existing = await this.client!.send(
        new AdminGetUserCommand({
          UserPoolId: this.userPoolId,
          Username: params.email,
        }),
      );
      sub = existing.UserAttributes?.find((a: any) => a.Name === 'sub')?.Value || null;
    } catch (error: any) {
      if (error.name === 'UserNotFoundException') {
        this.logger.warn(`Cognito user not found for update: ${params.email}`);
        return { cognitoSub: null, created: false, updated: false, skipped: true, reason: 'User not found in Cognito' };
      }
      throw error;
    }

    // Build attribute updates (only include provided fields)
    const attributeUpdates = this.buildPartialAttributes(params);

    if (attributeUpdates.length > 0) {
      await this.client!.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: this.userPoolId,
          Username: params.email,
          UserAttributes: attributeUpdates,
        }),
      );
    }

    // Handle status transitions
    if (params.status) {
      await this.syncUserStatus(params.email, params.status);
    }

    this.logger.log(`Updated Cognito user: ${params.email}`);
    return { cognitoSub: sub, created: false, updated: true, skipped: false };
  }

  // ─── DELETE / DISABLE ──────────────────────────────────────────────────

  /**
   * Disable a user in Cognito (soft delete — preserves the identity).
   * Used when a technical user is set to inactive or their end date passes.
   */
  async disableUser(email: string): Promise<CognitoDeprovisionResult> {
    if (!this.isConfigured()) {
      return { disabled: false, deleted: false, skipped: true, reason: 'Cognito not configured' };
    }

    try {
      await this.client!.send(
        new AdminDisableUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
        }),
      );
      this.logger.log(`Disabled Cognito user: ${email}`);
      return { disabled: true, deleted: false, skipped: false };
    } catch (error: any) {
      if (error.name === 'UserNotFoundException') {
        this.logger.warn(`Cognito user not found for disable: ${email}`);
        return { disabled: false, deleted: false, skipped: true, reason: 'User not found in Cognito' };
      }
      throw error;
    }
  }

  /**
   * Permanently delete a user from Cognito.
   * Used when a technical user is removed from the platform entirely.
   */
  async deleteUser(email: string): Promise<CognitoDeprovisionResult> {
    if (!this.isConfigured()) {
      return { disabled: false, deleted: false, skipped: true, reason: 'Cognito not configured' };
    }

    try {
      // Remove from all groups first
      await this.removeFromAllGroups(email);

      await this.client!.send(
        new AdminDeleteUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
        }),
      );
      this.logger.log(`Deleted Cognito user: ${email}`);
      return { disabled: false, deleted: true, skipped: false };
    } catch (error: any) {
      if (error.name === 'UserNotFoundException') {
        this.logger.warn(`Cognito user not found for delete: ${email}`);
        return { disabled: false, deleted: false, skipped: true, reason: 'User not found in Cognito' };
      }
      throw error;
    }
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────

  /**
   * Ensure the user belongs to the specified Cognito group.
   * AdminAddUserToGroup is idempotent in Cognito.
   */
  private async ensureGroupMembership(email: string, groupName: string): Promise<void> {
    try {
      await this.client!.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          GroupName: groupName,
        }),
      );
      this.logger.debug(`Ensured ${email} is in Cognito group: ${groupName}`);
    } catch (error: any) {
      // Log but don't fail user creation if group assignment fails
      this.logger.warn(`Failed to assign ${email} to group ${groupName}: ${error.message}`);
    }
  }

  /**
   * Remove user from all Cognito groups before deletion
   */
  private async removeFromAllGroups(email: string): Promise<void> {
    try {
      const groupsResult = await this.client!.send(
        new AdminListGroupsForUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
        }),
      );

      const groups = groupsResult.Groups || [];

      for (const group of groups) {
        if (group.GroupName) {
          await this.client!.send(
            new AdminRemoveUserFromGroupCommand({
              UserPoolId: this.userPoolId,
              Username: email,
              GroupName: group.GroupName,
            }),
          );
          this.logger.debug(`Removed ${email} from group: ${group.GroupName}`);
        }
      }
    } catch (error: any) {
      this.logger.warn(`Failed to remove ${email} from groups: ${error.message}`);
    }
  }

  /**
   * Sync Cognito user enabled/disabled state with platform status
   */
  private async syncUserStatus(email: string, status: string): Promise<void> {
    try {
      if (status === 'active') {
        await this.client!.send(
          new AdminEnableUserCommand({
            UserPoolId: this.userPoolId,
            Username: email,
          }),
        );
        this.logger.debug(`Enabled Cognito user: ${email}`);
      } else if (status === 'inactive') {
        await this.client!.send(
          new AdminDisableUserCommand({
            UserPoolId: this.userPoolId,
            Username: email,
          }),
        );
        this.logger.debug(`Disabled Cognito user: ${email}`);
      }
    } catch (error: any) {
      if (error.name !== 'UserNotFoundException') {
        this.logger.warn(`Failed to sync status for ${email}: ${error.message}`);
      }
    }
  }

  /**
   * Build full Cognito user attributes for creation
   */
  private buildUserAttributes(params: CreateCognitoUserParams) {
    return [
      { Name: 'email', Value: params.email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'given_name', Value: params.firstName },
      { Name: 'family_name', Value: params.lastName },
      { Name: 'custom:account_id', Value: params.accountId },
      { Name: 'custom:enterprise_id', Value: params.enterpriseId || '' },
      { Name: 'custom:role', Value: params.role },
    ];
  }

  /**
   * Build partial attributes for updates (only include provided fields)
   */
  private buildPartialAttributes(params: UpdateCognitoUserParams) {
    const attrs: { Name: string; Value: string }[] = [];

    if (params.firstName) attrs.push({ Name: 'given_name', Value: params.firstName });
    if (params.lastName) attrs.push({ Name: 'family_name', Value: params.lastName });
    if (params.accountId) attrs.push({ Name: 'custom:account_id', Value: params.accountId });
    if (params.enterpriseId !== undefined) attrs.push({ Name: 'custom:enterprise_id', Value: params.enterpriseId || '' });
    if (params.role) attrs.push({ Name: 'custom:role', Value: params.role });

    return attrs;
  }

  /**
   * Generate a secure temporary password meeting Cognito policy
   * (min 8 chars, uppercase, lowercase, number, special char)
   */
  private generateTemporaryPassword(): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%^&*';

    const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

    // Ensure at least one of each required character type
    let password = pick(upper) + pick(lower) + pick(digits) + pick(special);

    // Fill remaining with random mix
    const all = upper + lower + digits + special;
    for (let i = 0; i < 8; i++) {
      password += pick(all);
    }

    // Shuffle
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}
