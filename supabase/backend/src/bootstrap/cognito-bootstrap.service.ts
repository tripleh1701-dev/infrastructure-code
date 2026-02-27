import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  CreateGroupCommand,
  GetGroupCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  MessageActionType,
} from '@aws-sdk/client-cognito-identity-provider';

/**
 * Cognito Bootstrap Service
 *
 * Provisions the Day-0 admin user and "PlatformAdmins" group directly
 * in the AWS Cognito User Pool. This runs as Step 12 of the bootstrap
 * process and is gated by the COGNITO_USER_POOL_ID configuration.
 *
 * Actions performed:
 *  1. Create "PlatformAdmins" Cognito group (idempotent)
 *  2. Create admin user with email admin@adminplatform.com (idempotent)
 *  3. Set a permanent password (from env or default)
 *  4. Stamp custom attributes (account_id, enterprise_id, role)
 *  5. Assign user to the PlatformAdmins group
 */

interface CognitoBootstrapResult {
  cognitoUserSub: string | null;
  groupCreated: boolean;
  userCreated: boolean;
  userAssignedToGroup: boolean;
  skipped: boolean;
  reason?: string;
}

@Injectable()
export class CognitoBootstrapService {
  private readonly logger = new Logger(CognitoBootstrapService.name);
  private client: CognitoIdentityProviderClient | null = null;
  private userPoolId: string;

  // Defaults aligned with Day-0 architecture
  private readonly ADMIN_EMAIL = 'admin@adminplatform.com';
  private readonly COGNITO_GROUP_NAME = 'PlatformAdmins';

  constructor(private readonly configService: ConfigService) {
    this.userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID', '');

    if (this.userPoolId) {
      const region = this.configService.get<string>('COGNITO_REGION', 'us-east-1');
      this.client = new CognitoIdentityProviderClient({ region });
    }
  }

  /**
   * Returns true if Cognito is configured and ready for bootstrap
   */
  isConfigured(): boolean {
    return !!(this.userPoolId && this.client);
  }

  /**
   * Provision the admin user and PlatformAdmins group in Cognito.
   *
   * @param accountId  - Fixed ABC account UUID from FIXED_IDS
   * @param enterpriseId - Fixed Global enterprise UUID from FIXED_IDS
   */
  async provisionAdminUser(
    accountId: string,
    enterpriseId: string,
  ): Promise<CognitoBootstrapResult> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Cognito not configured (COGNITO_USER_POOL_ID missing). Skipping Cognito bootstrap.',
      );
      return {
        cognitoUserSub: null,
        groupCreated: false,
        userCreated: false,
        userAssignedToGroup: false,
        skipped: true,
        reason: 'COGNITO_USER_POOL_ID not configured',
      };
    }

    const result: CognitoBootstrapResult = {
      cognitoUserSub: null,
      groupCreated: false,
      userCreated: false,
      userAssignedToGroup: false,
      skipped: false,
    };

    try {
      // Step 12a: Create PlatformAdmins group
      result.groupCreated = await this.ensureCognitoGroup();

      // Step 12b: Create admin user
      const { sub, created } = await this.ensureAdminUser(accountId, enterpriseId);
      result.cognitoUserSub = sub;
      result.userCreated = created;

      // Step 12c: Assign user to PlatformAdmins group
      result.userAssignedToGroup = await this.assignUserToGroup(this.ADMIN_EMAIL);

      this.logger.log(
        `Cognito bootstrap complete: user=${this.ADMIN_EMAIL}, sub=${sub}, group=${this.COGNITO_GROUP_NAME}`,
      );
    } catch (error: any) {
      this.logger.error(`Cognito bootstrap failed: ${error.message}`, error.stack);
      throw error;
    }

    return result;
  }

  /**
   * Create the PlatformAdmins group if it doesn't exist
   */
  private async ensureCognitoGroup(): Promise<boolean> {
    try {
      await this.client!.send(
        new GetGroupCommand({
          GroupName: this.COGNITO_GROUP_NAME,
          UserPoolId: this.userPoolId,
        }),
      );
      this.logger.log(`Cognito group "${this.COGNITO_GROUP_NAME}" already exists`);
      return false;
    } catch (error: any) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error;
      }
    }

    await this.client!.send(
      new CreateGroupCommand({
        GroupName: this.COGNITO_GROUP_NAME,
        UserPoolId: this.userPoolId,
        Description: 'Platform administrators with full access to all features',
        Precedence: 0, // Highest priority
      }),
    );

    this.logger.log(`Created Cognito group: ${this.COGNITO_GROUP_NAME}`);
    return true;
  }

  /**
   * Create admin user or update attributes if already exists
   */
  private async ensureAdminUser(
    accountId: string,
    enterpriseId: string,
  ): Promise<{ sub: string; created: boolean }> {
    const password = this.configService.get<string>(
      'BOOTSTRAP_ADMIN_PASSWORD',
      'Adminuser@123',
    );

    const customAttributes = [
      { Name: 'email', Value: this.ADMIN_EMAIL },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'given_name', Value: 'ABC' },
      { Name: 'family_name', Value: 'DEF' },
      { Name: 'custom:account_id', Value: accountId },
      { Name: 'custom:enterprise_id', Value: enterpriseId },
      { Name: 'custom:role', Value: 'super_admin' },
    ];

    // Check if user already exists
    try {
      const existingUser = await this.client!.send(
        new AdminGetUserCommand({
          UserPoolId: this.userPoolId,
          Username: this.ADMIN_EMAIL,
        }),
      );

      // User exists — update custom attributes to ensure consistency
      await this.client!.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: this.userPoolId,
          Username: this.ADMIN_EMAIL,
          UserAttributes: customAttributes.filter((a: any) =>
            a.Name.startsWith('custom:'),
          ),
        }),
      );

      const sub =
        existingUser.UserAttributes?.find((a: any) => a.Name === 'sub')?.Value || '';
      this.logger.log(`Admin user already exists (sub: ${sub}), attributes updated`);
      return { sub, created: false };
    } catch (error: any) {
      if (error.name !== 'UserNotFoundException') {
        throw error;
      }
    }

    // Create the user with SUPPRESS delivery (no welcome email)
    const createResult = await this.client!.send(
      new AdminCreateUserCommand({
        UserPoolId: this.userPoolId,
        Username: this.ADMIN_EMAIL,
        UserAttributes: customAttributes,
        MessageAction: MessageActionType.SUPPRESS,
        TemporaryPassword: password,
      }),
    );

    const sub =
      createResult.User?.Attributes?.find((a: any) => a.Name === 'sub')?.Value || '';

    // Set permanent password (skip forced change on first login)
    await this.client!.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: this.userPoolId,
        Username: this.ADMIN_EMAIL,
        Password: password,
        Permanent: true,
      }),
    );

    this.logger.log(`Created Cognito admin user: ${this.ADMIN_EMAIL} (sub: ${sub})`);
    return { sub, created: true };
  }

  /**
   * Assign user to PlatformAdmins group (idempotent)
   */
  private async assignUserToGroup(username: string): Promise<boolean> {
    try {
      await this.client!.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: this.userPoolId,
          Username: username,
          GroupName: this.COGNITO_GROUP_NAME,
        }),
      );
      this.logger.log(
        `Assigned ${username} to Cognito group: ${this.COGNITO_GROUP_NAME}`,
      );
      return true;
    } catch (error: any) {
      // AdminAddUserToGroup is idempotent in Cognito — 
      // this catch handles unexpected errors only
      this.logger.error(
        `Failed to assign ${username} to group: ${error.message}`,
      );
      throw error;
    }
  }
}
