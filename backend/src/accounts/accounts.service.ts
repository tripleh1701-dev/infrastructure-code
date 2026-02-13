import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { DynamoDBRouterService } from '../common/dynamodb/dynamodb-router.service';
import { AccountProvisionerService, ProvisioningConfig } from '../common/dynamodb/account-provisioner.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

export interface Account {
  id: string;
  name: string;
  masterAccountName: string;
  cloudType: 'public' | 'private';
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
  ) {}

  /**
   * Get all accounts (from shared table - admin view)
   */
  async findAll(): Promise<Account[]> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#ACCOUNT' },
    );

    return (result.Items || []).map(this.mapToAccount);
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
    const id = uuidv4();
    const now = new Date().toISOString();

    this.logger.log(`Creating account ${id} with cloud type: ${dto.cloudType}`);

    // First, provision the infrastructure based on cloud type
    const provisioningConfig: ProvisioningConfig = {
      accountId: id,
      accountName: dto.name,
      cloudType: dto.cloudType,
      enablePointInTimeRecovery: true,
      enableDeletionProtection: true,
    };

    const provisioningResult = await this.accountProvisioner.provisionAccount(provisioningConfig);

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
      status: 'active',
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
    }

    // Write to shared table
    await this.dynamoDb.transactWrite(operations);

    // For private accounts, also write initial data to the dedicated table
    if (dto.cloudType === 'private' && provisioningResult.tableName) {
      await this.initializePrivateAccountData(id, account, dto, now);
    }

    // Add licenses (after account creation)
    if (dto.licenses?.length) {
      for (const license of dto.licenses) {
        await this.createLicense(id, license, dto.cloudType, now);
      }
    }

    // ── Auto-provision Technical Group & Technical Role ──────────────────
    // Every new customer account receives a default "Technical Group" and
    // "Technical Role" scoped to the account + first license's enterprise.
    // The technical user (if present) is automatically assigned to this group.
    const firstEnterpriseId = dto.licenses?.[0]?.enterpriseId;
    const firstWorkstreamId = undefined; // Will be created separately via workstream API
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

    // Assign technical user to the auto-provisioned Technical Group
    if (dto.technicalUser) {
      const techUserId = operations.find(
        (op) => op.Put?.Item?.SK?.startsWith('TECH_USER#'),
      )?.Put?.Item?.id;

      if (techUserId) {
        await this.assignUserToGroup(techUserId, techGroupId, dto.cloudType, id, now);
      }
    }

    this.logger.log(`Account ${id} created successfully with table: ${provisioningResult.tableName}`);

    return this.mapToAccount({
      ...account,
      tableName: provisioningResult.tableName,
    });
  }

  /**
   * Initialize data in a private account's dedicated table
   */
  private async initializePrivateAccountData(
    accountId: string,
    accountData: Record<string, any>,
    dto: CreateAccountDto,
    now: string,
  ): Promise<void> {
    // Wait for router cache to be invalidated
    this.dynamoDbRouter.invalidateCache(accountId);

    // Write account metadata to dedicated table
    await this.dynamoDbRouter.put(accountId, {
      Item: {
        ...accountData,
        PK: 'ACCOUNT#METADATA',
        SK: 'METADATA',
      },
    });

    // Write addresses to dedicated table
    if (dto.addresses?.length) {
      for (const addr of dto.addresses) {
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
    }

    // Write technical user to dedicated table
    if (dto.technicalUser) {
      const techUserId = uuidv4();
      await this.dynamoDbRouter.put(accountId, {
        Item: {
          PK: 'USER#LIST',
          SK: `USER#${techUserId}`,
          GSI1PK: 'ENTITY#USER',
          GSI1SK: `USER#${techUserId}`,
          id: techUserId,
          accountId,
          ...dto.technicalUser,
          isTechnicalUser: true,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }

  /**
   * Create a license record for the account
   */
  private async createLicense(
    accountId: string,
    license: any,
    cloudType: 'public' | 'private',
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

    // For private accounts, also write to dedicated table
    if (cloudType === 'private') {
      await this.dynamoDbRouter.put(accountId, {
        Item: {
          ...licenseItem,
          PK: 'LICENSE#LIST',
          SK: `LICENSE#${licenseId}`,
        },
      });
    }
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
    cloudType: 'public' | 'private',
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

    await this.dynamoDb.put({ Item: roleItem });

    // ── 2. Create Technical Role Permissions (view-only for all menus) ───
    for (const menu of AccountsService.MENU_ITEMS) {
      await this.dynamoDb.put({
        Item: {
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
        },
      });
    }

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

    await this.dynamoDb.put({ Item: groupItem });

    // ── 4. Link Technical Role → Technical Group ─────────────────────────
    await this.dynamoDb.put({
      Item: {
        PK: `GROUP#${groupId}`,
        SK: `ROLE#${roleId}`,
        id: uuidv4(),
        groupId,
        roleId,
        createdAt: now,
      },
    });

    // ── 5. Replicate to private table if applicable ──────────────────────
    if (cloudType === 'private') {
      this.dynamoDbRouter.invalidateCache(accountId);

      await this.dynamoDbRouter.put(accountId, { Item: { ...roleItem } });
      await this.dynamoDbRouter.put(accountId, { Item: { ...groupItem } });
      await this.dynamoDbRouter.put(accountId, {
        Item: {
          PK: `GROUP#${groupId}`,
          SK: `ROLE#${roleId}`,
          id: uuidv4(),
          groupId,
          roleId,
          createdAt: now,
        },
      });

      // Replicate permissions to private table
      for (const menu of AccountsService.MENU_ITEMS) {
        await this.dynamoDbRouter.put(accountId, {
          Item: {
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
          },
        });
      }
    }

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
    cloudType: 'public' | 'private',
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

    if (cloudType === 'private') {
      await this.dynamoDbRouter.put(accountId, { Item: { ...junctionItem } });
    }

    this.logger.log(`User ${userId} assigned to Technical Group ${groupId}`);
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
