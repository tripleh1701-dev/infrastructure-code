import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { DynamoDBRouterService } from '../common/dynamodb/dynamodb-router.service';
import { AccountProvisionerService, ProvisioningConfig } from '../common/dynamodb/account-provisioner.service';
import { CognitoUserProvisioningService } from '../auth/cognito-user-provisioning.service';
import { NotificationService } from '../common/notifications/notification.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { CloudType } from '../common/types/cloud-type';

export interface Account {
  id: string;
  name: string;
  masterAccountName: string;
  cloudType: CloudType;
  status: string;
  tableName?: string;
  provisioningStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountAddress {
  id: string;
  accountId: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface TechnicalUser {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  assignedRole: string;
  assignedGroup: string;
  startDate: string;
  endDate?: string;
  status: string;
  isTechnicalUser: boolean;
}

export interface License {
  id: string;
  accountId: string;
  enterpriseId: string;
  productId: string;
  serviceId: string;
  startDate: string;
  endDate: string;
  numberOfUsers: number;
  renewalNotify: boolean;
  noticeDays: number;
  contactFullName: string;
  contactEmail: string;
  contactPhone?: string;
  contactDepartment?: string;
  contactDesignation?: string;
}

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly dynamoDb: DynamoDBService,
    private readonly dynamoDbRouter: DynamoDBRouterService,
    private readonly accountProvisioner: AccountProvisionerService,
    private readonly cognitoProvisioning: CognitoUserProvisioningService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get all accounts with addresses and technical users (admin view)
   */
  async findAll(): Promise<(Account & { addresses: AccountAddress[]; technicalUser?: TechnicalUser })[]> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#ACCOUNT' },
    );

    const accounts = (result.Items || []).map(this.mapToAccount);

    // Enrich each account with addresses and technical user
    const enriched = await Promise.all(
      accounts.map(async (account) => {
        const [addressResult, techUserResult] = await Promise.all([
          this.dynamoDb.query({
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': `ACCOUNT#${account.id}`,
              ':sk': 'ADDRESS#',
            },
          }),
          this.dynamoDb.query({
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': `ACCOUNT#${account.id}`,
              ':sk': 'TECH_USER#',
            },
          }),
        ]);

        const addresses = (addressResult.Items || []).map(this.mapToAddress);
        const technicalUser = techUserResult.Items?.[0]
          ? this.mapToTechnicalUser(techUserResult.Items[0])
          : undefined;

        return {
          ...account,
          addresses,
          technicalUser,
        };
      }),
    );

    return enriched;
  }

  /**
   * Check if an account has a license linked to the Global enterprise.
   * Returns { hasGlobalAccess: boolean }.
   */
  async checkGlobalAccess(accountId: string): Promise<{ hasGlobalAccess: boolean }> {
    const GLOBAL_ENTERPRISE_ID = '00000000-0000-0000-0000-000000000001';

    const result = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ACCOUNT#${accountId}`,
        ':sk': 'LICENSE#',
      },
    });

    const hasGlobal = (result.Items || []).some(
      (item) => item.enterpriseId === GLOBAL_ENTERPRISE_ID,
    );

    return { hasGlobalAccess: hasGlobal };
  }

  /**
   * Get a single account with all details
   */
  async findOne(id: string): Promise<Account & { addresses: AccountAddress[]; technicalUser?: TechnicalUser }> {
    // Get account metadata from shared table
    const accountResult = await this.dynamoDb.get({
      Key: { PK: `ACCOUNT#${id}`, SK: 'METADATA' },
    });

    if (!accountResult.Item) {
      throw new NotFoundException(`Account with ID ${id} not found`);
    }

    // Get addresses
    const addressResult = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ACCOUNT#${id}`,
        ':sk': 'ADDRESS#',
      },
    });

    // Get technical user
    const techUserResult = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ACCOUNT#${id}`,
        ':sk': 'TECH_USER#',
      },
    });

    // Get provisioning status
    const provisioningStatus = await this.accountProvisioner.getProvisioningStatus(id);

    const account = this.mapToAccount(accountResult.Item);
    const addresses = (addressResult.Items || []).map(this.mapToAddress);
    const technicalUser = techUserResult.Items?.[0]
      ? this.mapToTechnicalUser(techUserResult.Items[0])
      : undefined;

    return {
      ...account,
      tableName: provisioningStatus?.tableName,
      provisioningStatus: provisioningStatus?.status,
      addresses,
      technicalUser,
    };
  }

  /**
   * Create a new account with infrastructure provisioning based on cloud type
   */
  async create(dto: CreateAccountDto): Promise<Account> {
    // ── Preflight: block private provisioning if cross-account config is missing ──
    if (dto.cloudType === 'private') {
      const dataPlaneRoleArn = this.configService.get<string>('DATA_PLANE_ROLE_ARN');
      const cfnExecutionRoleArn = this.configService.get<string>('CFN_EXECUTION_ROLE_ARN');
      const crossAccountExternalId =
        this.configService.get<string>('CROSS_ACCOUNT_EXTERNAL_ID')
        || this.configService.get<string>('DATA_PLANE_EXTERNAL_ID');
      const missing: string[] = [];
      if (!dataPlaneRoleArn) missing.push('DATA_PLANE_ROLE_ARN');
      if (!cfnExecutionRoleArn) missing.push('CFN_EXECUTION_ROLE_ARN');
      if (!crossAccountExternalId) missing.push('CROSS_ACCOUNT_EXTERNAL_ID');
      if (missing.length > 0) {
        this.logger.error(
          `Preflight failed for ${dto.cloudType} account: missing ${missing.join(', ')}. ` +
          `Refusing to proceed — infrastructure would be created in the Platform Admin account.`,
        );
        throw new BadRequestException(
          `Cannot create ${dto.cloudType} account: required environment variables are not configured (${missing.join(', ')}). ` +
          `Please ensure cross-account roles are bootstrapped before provisioning private infrastructure.`,
        );
      }
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const t0 = Date.now();
    const stepTimings: Record<string, number> = {};

    this.logger.log(JSON.stringify({ event: 'AccountCreateStart', accountId: id, cloudType: dto.cloudType }));

    // ── Step 1: Infrastructure provisioning ─────────────────────────────
    let tStep = Date.now();
    const provisioningConfig: ProvisioningConfig = {
      accountId: id,
      accountName: dto.name,
      cloudType: dto.cloudType,
      enablePointInTimeRecovery: true,
      enableDeletionProtection: true,
    };

    const provisioningResult = await this.accountProvisioner.provisionAccount(provisioningConfig);
    stepTimings['provisioning'] = Date.now() - tStep;

    if (!provisioningResult.success) {
      throw new BadRequestException(`Failed to provision account: ${provisioningResult.message}`);
    }

    // Create account metadata in the shared table (for admin visibility)
    const account: Record<string, any> = {
      PK: `ACCOUNT#${id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#ACCOUNT',
      GSI1SK: `ACCOUNT#${id}`,
      GSI2PK: `CLOUD_TYPE#${dto.cloudType.toUpperCase()}`,
      GSI2SK: `ACCOUNT#${id}`,
      id,
      name: dto.name,
      masterAccountName: dto.masterAccountName,
      cloudType: dto.cloudType,
      tableName: provisioningResult.tableName,
      status: dto.cloudType === 'private' ? 'provisioning' : 'active',
      provisioningStatus: dto.cloudType === 'private' ? 'creating' : 'active',
      createdAt: now,
      updatedAt: now,
    };

    const operations: any[] = [{ Put: { Item: account } }];

    // Add addresses (to shared table for admin access)
    if (dto.addresses?.length) {
      for (const addr of dto.addresses) {
        const addressId = uuidv4();
        operations.push({
          Put: {
            Item: {
              PK: `ACCOUNT#${id}`,
              SK: `ADDRESS#${addressId}`,
              id: addressId,
              accountId: id,
              ...addr,
              createdAt: now,
            },
          },
        });
      }
    }

    // Add technical user
    if (dto.technicalUser) {
      const techUserId = uuidv4();
      // Store as TECH_USER under account partition (for account detail view)
      operations.push({
        Put: {
          Item: {
            PK: `ACCOUNT#${id}`,
            SK: `TECH_USER#${techUserId}`,
            GSI1PK: 'ENTITY#TECH_USER',
            GSI1SK: `USER#${techUserId}`,
            id: techUserId,
            accountId: id,
            ...dto.technicalUser,
            isTechnicalUser: true,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        },
      });

      // Also store as USER# record so it appears in Access Control users list
      // (queried via GSI2PK = ACCOUNT#<accountId>#USERS)
      operations.push({
        Put: {
          Item: {
            PK: `USER#${techUserId}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#USER',
            GSI1SK: `USER#${techUserId}`,
            GSI2PK: `ACCOUNT#${id}#USERS`,
            GSI2SK: `USER#${techUserId}`,
            id: techUserId,
            accountId: id,
            enterpriseId: dto.licenses?.[0]?.enterpriseId || null,
            firstName: dto.technicalUser.firstName,
            lastName: dto.technicalUser.lastName,
            middleName: dto.technicalUser.middleName || null,
            email: dto.technicalUser.email,
            assignedRole: dto.technicalUser.assignedRole || 'user',
            assignedGroup: dto.technicalUser.assignedGroup || 'TechnicalUsers',
            startDate: dto.technicalUser.startDate || now,
            endDate: dto.technicalUser.endDate || null,
            isTechnicalUser: true,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        },
      });
    }

    // ── Step 2: Write metadata to shared table ────────────────────────
    tStep = Date.now();
    await this.dynamoDb.transactWrite(operations);
    stepTimings['metadataWrite'] = Date.now() - tStep;

    // For private accounts, store a PENDING_INIT record so the background
    // finalizer can initialize the dedicated table once CFN completes.
    if (dto.cloudType === 'private') {
      tStep = Date.now();
      const pendingPayload: Record<string, any> = {
        PK: `ACCOUNT#${id}`,
        SK: 'PENDING_INIT',
        accountId: id,
        accountData: account,
        addresses: dto.addresses || [],
        technicalUser: dto.technicalUser || null,
        createdAt: now,
      };
      await this.dynamoDb.put({ Item: pendingPayload });
      stepTimings['pendingInit'] = Date.now() - tStep;
      this.logger.log(`Stored PENDING_INIT record for private account ${id}`);
    }

    // ── Step 4: Licenses ────────────────────────────────────────────────
    if (dto.licenses?.length) {
      tStep = Date.now();
      for (const license of dto.licenses) {
        await this.createLicense(id, license, dto.cloudType, now);
      }
      stepTimings['licenses'] = Date.now() - tStep;
    }

    // ── Step 5: RBAC (Technical Group & Role) ───────────────────────────
    tStep = Date.now();
    const firstEnterpriseId = dto.licenses?.[0]?.enterpriseId;
    const firstWorkstreamId = undefined;
    const firstProductId = dto.licenses?.[0]?.productId;
    const firstServiceId = dto.licenses?.[0]?.serviceId;

    const { groupId: techGroupId, roleId: techRoleId } =
      await this.provisionTechnicalGroupAndRole(
        id,
        firstEnterpriseId,
        firstWorkstreamId,
        firstProductId,
        firstServiceId,
        dto.cloudType,
        now,
      );
    stepTimings['rbac'] = Date.now() - tStep;

    // ── Step 6: User assignment & Cognito ───────────────────────────────
    if (dto.technicalUser) {
      const techUserId = operations.find(
        (op) => op.Put?.Item?.SK?.startsWith('TECH_USER#'),
      )?.Put?.Item?.id;

      if (techUserId) {
        tStep = Date.now();
        await this.assignUserToGroup(techUserId, techGroupId, dto.cloudType, id, now);
        stepTimings['userGroupAssignment'] = Date.now() - tStep;
      }

      if (dto.cloudType === 'private') {
        this.logger.log(
          `Deferred inline Cognito provisioning for private account technical user ${dto.technicalUser.email}`,
        );
      } else {
        tStep = Date.now();
        try {
          const cognitoResult = await this.cognitoProvisioning.createUser({
            email: dto.technicalUser.email,
            firstName: dto.technicalUser.firstName,
            lastName: dto.technicalUser.lastName,
            accountId: id,
            enterpriseId: firstEnterpriseId,
            role: dto.technicalUser.assignedRole || 'user',
            groupName: 'TechnicalUsers',
          });

          if (cognitoResult.created) {
            this.logger.log(
              `Cognito user created for technical user ${dto.technicalUser.email} (sub: ${cognitoResult.cognitoSub})`,
            );

            // Send credential email via SES for public account users
            if (cognitoResult.temporaryPassword) {
              try {
                const notifResult = await this.notificationService.sendCredentialProvisionedEmail(
                  {
                    email: dto.technicalUser.email,
                    firstName: dto.technicalUser.firstName,
                    lastName: dto.technicalUser.lastName,
                  },
                  cognitoResult.temporaryPassword,
                  dto.name, // account name
                );
                if (notifResult.sent) {
                  this.logger.log(`Credential email sent to ${dto.technicalUser.email} (messageId: ${notifResult.messageId})`);
                } else {
                  this.logger.warn(`Credential email not sent to ${dto.technicalUser.email}: ${notifResult.reason}`);
                }
              } catch (emailError: any) {
                this.logger.error(
                  `Failed to send credential email to ${dto.technicalUser.email}: ${emailError.message}`,
                );
              }
            }
          } else if (cognitoResult.updated) {
            this.logger.log(
              `Cognito user already existed for ${dto.technicalUser.email}, attributes updated`,
            );
          } else if (cognitoResult.skipped) {
            this.logger.warn(
              `Cognito user creation skipped for ${dto.technicalUser.email}: ${cognitoResult.reason}`,
            );
          }
        } catch (cognitoError: any) {
          this.logger.error(
            `Failed to create Cognito user for ${dto.technicalUser.email}: ${cognitoError.message}`,
            cognitoError.stack,
          );
        }
        stepTimings['cognito'] = Date.now() - tStep;
      }
    }

    // ── Emit structured latency summary ─────────────────────────────────
    const totalMs = Date.now() - t0;
    this.logger.log(
      JSON.stringify({
        event: 'AccountCreateComplete',
        accountId: id,
        cloudType: dto.cloudType,
        totalMs,
        stepTimings,
      }),
    );

    return this.mapToAccount({
      ...account,
      tableName: provisioningResult.tableName,
    });
  }

  // initializePrivateAccountData has been replaced by
  // initializeFromPendingRecord in the provisioning finalizer.

  /**
   * Create a license record for the account
   */
  private async createLicense(
    accountId: string,
    license: any,
    cloudType: CloudType,
    now: string,
  ): Promise<void> {
    const licenseId = uuidv4();
    
    const licenseItem: Record<string, any> = {
      PK: `ACCOUNT#${accountId}`,
      SK: `LICENSE#${licenseId}`,
      GSI1PK: 'ENTITY#LICENSE',
      GSI1SK: `LICENSE#${licenseId}`,
      GSI2PK: `ENTERPRISE#${license.enterpriseId}`,
      GSI2SK: `LICENSE#${licenseId}`,
      id: licenseId,
      accountId,
      enterpriseId: license.enterpriseId,
      productId: license.productId,
      serviceId: license.serviceId,
      startDate: license.startDate,
      endDate: license.endDate,
      numberOfUsers: license.numberOfUsers || 1,
      renewalNotify: license.renewalNotify ?? true,
      noticeDays: license.noticeDays || 30,
      contactFullName: license.contactFullName,
      contactEmail: license.contactEmail,
      contactPhone: license.contactPhone,
      contactDepartment: license.contactDepartment,
      contactDesignation: license.contactDesignation,
      createdAt: now,
      updatedAt: now,
    };

    // Write to shared table (for admin visibility)
    await this.dynamoDb.put({ Item: licenseItem });

    // For private accounts, the dedicated table write is deferred to the
    // provisioning finalizer (initializeFromPendingRecord) since the table
    // may not exist yet during account creation.
  }

  /**
   * Update an existing account
   */
  async update(id: string, dto: UpdateAccountDto): Promise<Account> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException(`Account with ID ${id} not found`);
    }

    // Prevent changing cloud type after creation
    if (dto.cloudType && dto.cloudType !== existing.cloudType) {
      throw new BadRequestException('Cannot change cloud type after account creation');
    }

    const now = new Date().toISOString();

    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const expressionAttributeNames: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues: Record<string, any> = {
      ':updatedAt': now,
    };

    if (dto.name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = dto.name;
    }

    if (dto.masterAccountName !== undefined) {
      updateExpressions.push('#masterAccountName = :masterAccountName');
      expressionAttributeNames['#masterAccountName'] = 'masterAccountName';
      expressionAttributeValues[':masterAccountName'] = dto.masterAccountName;
    }

    if (dto.status !== undefined) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = dto.status;
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `ACCOUNT#${id}`, SK: 'METADATA' },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    // Update in private table if applicable
    if (existing.cloudType === 'private') {
      await this.dynamoDbRouter.update(id, {
        Key: { PK: 'ACCOUNT#METADATA', SK: 'METADATA' },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      });
    }

    return this.mapToAccount(result.Attributes!);
  }

  /**
   * Delete an account (includes deprovisioning for private accounts)
   */
  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException(`Account with ID ${id} not found`);
    }

    this.logger.log(`Deleting account ${id} (cloud type: ${existing.cloudType})`);

    // Query all items for this account in shared table
    const items = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `ACCOUNT#${id}` },
    });

    // Delete all related items from shared table
    if (items.Items?.length) {
      const deleteRequests = items.Items.map((item) => ({
        DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
      }));

      // Batch delete (max 25 items per batch)
      for (let i = 0; i < deleteRequests.length; i += 25) {
        await this.dynamoDb.batchWrite(deleteRequests.slice(i, i + 25));
      }
    }

    // Deprovision infrastructure for private accounts
    if (existing.cloudType === 'private') {
      await this.accountProvisioner.deprovisionAccount(id);
    } else {
      // Just clean up SSM parameters for public accounts
      await this.accountProvisioner.deprovisionAccount(id);
    }

    this.logger.log(`Account ${id} deleted successfully`);
  }

  /**
   * Get data from an account's table (respects cloud type routing)
   */
  async getAccountData(accountId: string, entityType: string): Promise<any[]> {
    const result = await this.dynamoDbRouter.queryByIndex(
      accountId,
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': `ENTITY#${entityType.toUpperCase()}` },
    );

    return result.Items || [];
  }

  /**
   * Check if an account has a private (isolated) database
   */
  async isIsolatedAccount(accountId: string): Promise<boolean> {
    return this.dynamoDbRouter.isPrivateAccount(accountId);
  }

  // ── Auto-Provisioning: Technical Group & Role ──────────────────────────

  /**
   * Menu permissions structure for Technical Role (view-only by default).
   * Mirrors the bootstrap-day0.ts Technical Role permission set.
   */
  private static readonly MENU_ITEMS = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'overview', label: 'Overview' },
    { key: 'account-settings', label: 'Account Settings' },
    { key: 'access-control', label: 'Access Control' },
    { key: 'security', label: 'Security & Governance' },
    { key: 'pipelines', label: 'Pipelines' },
    { key: 'builds', label: 'Builds' },
  ];

  private static readonly ACCOUNT_SETTINGS_TABS = [
    { key: 'enterprises', label: 'Enterprise' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'global-settings', label: 'Global Settings' },
  ];

  private static readonly ACCESS_CONTROL_TABS = [
    { key: 'users', label: 'Users' },
    { key: 'groups', label: 'Groups' },
    { key: 'roles', label: 'Roles' },
  ];

  private getTabsForMenu(menuKey: string): any[] {
    if (menuKey === 'account-settings') {
      return AccountsService.ACCOUNT_SETTINGS_TABS.map((t) => ({
        key: t.key, label: t.label, isVisible: true,
        canView: true, canCreate: false, canEdit: false, canDelete: false,
      }));
    }
    if (menuKey === 'access-control') {
      return AccountsService.ACCESS_CONTROL_TABS.map((t) => ({
        key: t.key, label: t.label, isVisible: true,
        canView: true, canCreate: false, canEdit: false, canDelete: false,
      }));
    }
    return [];
  }

  /**
   * Automatically provisions a "Technical Group" and "Technical Role" for a
   * new customer account. This ensures every account has a baseline RBAC
   * structure for its technical users from the moment of creation.
   *
   * Flow:
   *   1. Create "Technical Role" with view-only permissions for all menus
   *   2. Create "Technical Group" scoped to the account/enterprise
   *   3. Link the Role → Group via group_roles junction
   *   4. For private accounts, replicate to the dedicated table
   */
  private async provisionTechnicalGroupAndRole(
    accountId: string,
    enterpriseId: string | undefined,
    workstreamId: string | undefined,
    productId: string | undefined,
    serviceId: string | undefined,
    cloudType: CloudType,
    now: string,
  ): Promise<{ groupId: string; roleId: string }> {
    const roleId = uuidv4();
    const groupId = uuidv4();

    this.logger.log(`Auto-provisioning Technical Group (${groupId}) and Technical Role (${roleId}) for account ${accountId}`);

    // ── 1. Create Technical Role ──────────────────────────────────────────
    const roleItem: Record<string, any> = {
      PK: `ROLE#${roleId}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#ROLE',
      GSI1SK: `ROLE#${roleId}`,
      id: roleId,
      name: 'Technical Role',
      description: 'Default view-only role for technical users',
      permissions: 0,
      accountId,
      enterpriseId: enterpriseId || null,
      workstreamId: workstreamId || null,
      productId: productId || null,
      serviceId: serviceId || null,
      createdAt: now,
      updatedAt: now,
    };

    const permissionItems = AccountsService.MENU_ITEMS.map((menu) => ({
      PK: `ROLE#${roleId}`,
      SK: `PERMISSION#${menu.key}`,
      id: uuidv4(),
      roleId,
      menuKey: menu.key,
      menuLabel: menu.label,
      isVisible: true,
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      tabs: this.getTabsForMenu(menu.key),
      createdAt: now,
      updatedAt: now,
    }));

    // ── 3. Create Technical Group ─────────────────────────────────────────
    const groupItem: Record<string, any> = {
      PK: `GROUP#${groupId}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#GROUP',
      GSI1SK: `GROUP#${groupId}`,
      id: groupId,
      name: 'Technical Group',
      description: 'Default group for technical users in this account',
      accountId,
      enterpriseId: enterpriseId || null,
      workstreamId: workstreamId || null,
      createdAt: now,
      updatedAt: now,
    };

    const groupRoleJunctionItem = {
      PK: `GROUP#${groupId}`,
      SK: `ROLE#${roleId}`,
      id: uuidv4(),
      groupId,
      roleId,
      createdAt: now,
    };

    // Run independent writes concurrently to reduce create-account latency.
    await Promise.all([
      this.dynamoDb.put({ Item: roleItem }),
      ...permissionItems.map((permission) => this.dynamoDb.put({ Item: permission })),
      this.dynamoDb.put({ Item: groupItem }),
      this.dynamoDb.put({ Item: groupRoleJunctionItem }),
    ]);

    // ── 5. Private table replication is deferred to the provisioning
    //    finalizer (initializeFromPendingRecord) since the dedicated
    //    table may not exist yet during account creation.

    this.logger.log(`Technical Group/Role auto-provisioned for account ${accountId}`);

    return { groupId, roleId };
  }

  /**
   * Assign a user to a group (creates user_groups junction record).
   * For private accounts, also writes to the dedicated table.
   */
  private async assignUserToGroup(
    userId: string,
    groupId: string,
    cloudType: CloudType,
    accountId: string,
    now: string,
  ): Promise<void> {
    const junctionItem = {
      PK: `USER#${userId}`,
      SK: `GROUP#${groupId}`,
      id: uuidv4(),
      userId,
      groupId,
      createdAt: now,
    };

    await this.dynamoDb.put({ Item: junctionItem });

    // Private table replication deferred to provisioning finalizer

    this.logger.log(`User ${userId} assigned to Technical Group ${groupId}`);
  }

  // ── Background Provisioning Finalizer ────────────────────────────────

  /**
   * Finalize all private accounts whose CFN provisioning has completed.
   *
   * Called periodically (e.g. every minute via CloudWatch Events) to:
   * 1. Find accounts with status = 'provisioning'
   * 2. Check SSM provisioning-status for each
   * 3. If 'active': initialize dedicated table data, update account status
   * 4. If 'failed': update account status to 'failed'
   */
  async finalizeProvisionedAccounts(): Promise<{
    checked: number;
    finalized: string[];
    failed: string[];
    stillPending: string[];
  }> {
    this.logger.log('Running provisioning finalizer...');

    // Query all accounts with status = 'provisioning'
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#ACCOUNT' },
    );

    const provisioningAccounts = (result.Items || []).filter(
      (item) => item.status === 'provisioning' && item.cloudType === 'private',
    );

    const finalized: string[] = [];
    const failed: string[] = [];
    const stillPending: string[] = [];

    for (const accountItem of provisioningAccounts) {
      const accountId = accountItem.id;

      try {
        const provStatus = await this.accountProvisioner.getProvisioningStatus(accountId);

        if (provStatus?.status === 'active') {
          // ── CFN stack complete — initialize dedicated table data ─────────
          await this.initializeFromPendingRecord(accountId, accountItem);

          // Update account status to 'active'
          await this.dynamoDb.update({
            Key: { PK: `ACCOUNT#${accountId}`, SK: 'METADATA' },
            UpdateExpression: 'SET #status = :status, #provStatus = :provStatus, #updatedAt = :now',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#provStatus': 'provisioningStatus',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':status': 'active',
              ':provStatus': 'active',
              ':now': new Date().toISOString(),
            },
          });

          finalized.push(accountId);
          this.logger.log(`Account ${accountId} finalized successfully`);

        } else if (provStatus?.status === 'failed') {
          // ── CFN stack failed ─────────────────────────────────────────────
          await this.dynamoDb.update({
            Key: { PK: `ACCOUNT#${accountId}`, SK: 'METADATA' },
            UpdateExpression: 'SET #status = :status, #provStatus = :provStatus, #updatedAt = :now',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#provStatus': 'provisioningStatus',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':status': 'failed',
              ':provStatus': 'failed',
              ':now': new Date().toISOString(),
            },
          });

          failed.push(accountId);
          this.logger.warn(`Account ${accountId} provisioning failed`);

        } else {
          stillPending.push(accountId);
          this.logger.debug(`Account ${accountId} still provisioning (status: ${provStatus?.status})`);
        }
      } catch (error: any) {
        this.logger.error(`Error finalizing account ${accountId}: ${error.message}`, error.stack);
        failed.push(accountId);
      }
    }

    this.logger.log(
      `Provisioning finalizer complete: checked=${provisioningAccounts.length}, ` +
      `finalized=${finalized.length}, failed=${failed.length}, pending=${stillPending.length}`,
    );

    return {
      checked: provisioningAccounts.length,
      finalized,
      failed,
      stillPending,
    };
  }

  /**
   * Read PENDING_INIT record and initialize the dedicated table for a private account.
   */
  private async initializeFromPendingRecord(
    accountId: string,
    accountItem: Record<string, any>,
  ): Promise<void> {
    // Read the pending init payload
    const pendingResult = await this.dynamoDb.get({
      Key: { PK: `ACCOUNT#${accountId}`, SK: 'PENDING_INIT' },
    });

    const pending = pendingResult.Item;
    if (!pending) {
      this.logger.warn(`No PENDING_INIT record found for account ${accountId}, skipping data init`);
      return;
    }

    const now = new Date().toISOString();

    // Invalidate router cache so it picks up the new table
    this.dynamoDbRouter.invalidateCache(accountId);

    // Write account metadata to dedicated table
    const accountData = pending.accountData || accountItem;
    await this.dynamoDbRouter.put(accountId, {
      Item: {
        ...accountData,
        PK: 'ACCOUNT#METADATA',
        SK: 'METADATA',
        status: 'active',
        provisioningStatus: 'active',
      },
    });

    // Write addresses to dedicated table
    const addresses = pending.addresses || [];
    for (const addr of addresses) {
      const addressId = uuidv4();
      await this.dynamoDbRouter.put(accountId, {
        Item: {
          PK: 'ADDRESS#LIST',
          SK: `ADDRESS#${addressId}`,
          id: addressId,
          accountId,
          ...addr,
          createdAt: now,
        },
      });
    }

    // Write technical user to dedicated table
    const techUser = pending.technicalUser;
    if (techUser) {
      const techUserId = uuidv4();
      // Store as user list item in dedicated table
      await this.dynamoDbRouter.put(accountId, {
        Item: {
          PK: 'USER#LIST',
          SK: `USER#${techUserId}`,
          GSI1PK: 'ENTITY#USER',
          GSI1SK: `USER#${techUserId}`,
          id: techUserId,
          accountId,
          ...techUser,
          isTechnicalUser: true,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      });

      // Also store as USER# record in control plane for Access Control visibility
      // (queried via GSI2PK = ACCOUNT#<accountId>#USERS)
      await this.dynamoDb.transactWrite([{
        Put: {
          Item: {
            PK: `USER#${techUserId}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#USER',
            GSI1SK: `USER#${techUserId}`,
            GSI2PK: `ACCOUNT#${accountId}#USERS`,
            GSI2SK: `USER#${techUserId}`,
            id: techUserId,
            accountId,
            enterpriseId: techUser.enterpriseId || null,
            firstName: techUser.firstName,
            lastName: techUser.lastName,
            middleName: techUser.middleName || null,
            email: techUser.email,
            assignedRole: techUser.assignedRole || 'user',
            assignedGroup: techUser.assignedGroup || 'TechnicalUsers',
            startDate: techUser.startDate || now,
            endDate: techUser.endDate || null,
            isTechnicalUser: true,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        },
      }]);
    }

    // Replicate licenses from control plane to dedicated table
    const licenseResult = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ACCOUNT#${accountId}`,
        ':sk': 'LICENSE#',
      },
    });

    for (const license of (licenseResult.Items || [])) {
      await this.dynamoDbRouter.put(accountId, {
        Item: {
          ...license,
          PK: 'LICENSE#LIST',
          SK: license.SK,
        },
      });
    }

    // Replicate RBAC (groups, roles, permissions) from control plane to dedicated table
    // Query groups for this account
    const groupResult = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#GROUP' },
    );
    const accountGroups = (groupResult.Items || []).filter((g) => g.accountId === accountId);

    for (const group of accountGroups) {
      await this.dynamoDbRouter.put(accountId, { Item: { ...group } });

      // Replicate group-role junctions
      const junctions = await this.dynamoDb.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `GROUP#${group.id}`,
          ':sk': 'ROLE#',
        },
      });
      for (const junction of (junctions.Items || [])) {
        await this.dynamoDbRouter.put(accountId, { Item: { ...junction } });
      }
    }

    // Query roles for this account
    const roleResult = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#ROLE' },
    );
    const accountRoles = (roleResult.Items || []).filter((r) => r.accountId === accountId);

    for (const role of accountRoles) {
      await this.dynamoDbRouter.put(accountId, { Item: { ...role } });

      // Replicate role permissions
      const perms = await this.dynamoDb.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `ROLE#${role.id}`,
          ':sk': 'PERMISSION#',
        },
      });
      for (const perm of (perms.Items || [])) {
        await this.dynamoDbRouter.put(accountId, { Item: { ...perm } });
      }
    }

    // Clean up the PENDING_INIT record
    await this.dynamoDb.delete({
      Key: { PK: `ACCOUNT#${accountId}`, SK: 'PENDING_INIT' },
    });

    this.logger.log(`Private account ${accountId} data initialized from PENDING_INIT record`);
  }

  // Mappers
  private mapToAccount(item: Record<string, any>): Account {
    return {
      id: item.id,
      name: item.name,
      masterAccountName: item.masterAccountName,
      cloudType: item.cloudType,
      status: item.status,
      tableName: item.tableName,
      provisioningStatus: item.provisioningStatus,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private mapToAddress(item: Record<string, any>): AccountAddress {
    return {
      id: item.id,
      accountId: item.accountId,
      line1: item.line1,
      line2: item.line2,
      city: item.city,
      state: item.state,
      postalCode: item.postalCode,
      country: item.country,
    };
  }

  private mapToTechnicalUser(item: Record<string, any>): TechnicalUser {
    return {
      id: item.id,
      accountId: item.accountId,
      firstName: item.firstName,
      lastName: item.lastName,
      middleName: item.middleName,
      email: item.email,
      assignedRole: item.assignedRole,
      assignedGroup: item.assignedGroup,
      startDate: item.startDate,
      endDate: item.endDate,
      status: item.status,
      isTechnicalUser: item.isTechnicalUser,
    };
  }
}
