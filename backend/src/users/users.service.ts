import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { LicenseEnforcementService, LicenseCapacity } from './license-enforcement.service';
import { CognitoUserProvisioningService } from '../auth/cognito-user-provisioning.service';
import { NotificationService } from '../common/notifications/notification.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CognitoUser } from '../auth/interfaces/cognito-user.interface';

export interface User {
  id: string;
  accountId: string;
  enterpriseId?: string;
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
  cognitoSub?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserWorkstream {
  id: string;
  userId: string;
  workstreamId: string;
}

/**
 * Reconciliation result for a single user
 */
export interface ReconciliationUserResult {
  userId: string;
  email: string;
  status: 'provisioned' | 'updated' | 'skipped' | 'failed';
  cognitoSub?: string | null;
  reason?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly dynamoDb: DynamoDBService,
    private readonly licenseEnforcement: LicenseEnforcementService,
    private readonly cognitoProvisioning: CognitoUserProvisioningService,
    private readonly notificationService: NotificationService,
  ) {}

  async findAll(): Promise<User[]> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#USER' },
    );

    return (result.Items || []).map((item: Record<string, any>) => this.mapToUser(item));
  }

  async findByAccount(accountId: string): Promise<User[]> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI2',
      'GSI2PK = :pk',
      { ':pk': `ACCOUNT#${accountId}#USERS` },
    );

    return (result.Items || []).map((item: Record<string, any>) => this.mapToUser(item));
  }

  async findOne(id: string): Promise<User & { workstreams: string[] }> {
    const result = await this.dynamoDb.get({
      Key: { PK: `USER#${id}`, SK: 'METADATA' },
    });

    if (!result.Item) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const workstreams = await this.getWorkstreams(id);

    return {
      ...this.mapToUser(result.Item),
      workstreams,
    };
  }

  async create(dto: CreateUserDto): Promise<User & { licenseCapacity: LicenseCapacity }> {
    // Enforce license limits before creating the user
    const capacity = await this.licenseEnforcement.validateUserCreation(dto.accountId);

    this.logger.log(
      `License check passed for account ${dto.accountId}: ` +
        `${capacity.currentActiveUsers}/${capacity.totalAllowed} users`,
    );

    const id = uuidv4();
    const now = new Date().toISOString();

    // ── Step 1: Provision user in Cognito ──────────────────────────────
    let cognitoSub: string | null = null;

    try {
      const cognitoResult = await this.cognitoProvisioning.createUser({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        accountId: dto.accountId,
        enterpriseId: dto.enterpriseId,
        role: dto.assignedRole,
        groupName: dto.assignedGroup,
      });

      cognitoSub = cognitoResult.cognitoSub;

      if (cognitoResult.created) {
        this.logger.log(`Cognito user created for ${dto.email} (sub: ${cognitoSub})`);

        // Send credential notification email with temporary password
        if (cognitoResult.temporaryPassword) {
          const notifResult = await this.notificationService.sendCredentialProvisionedEmail(
            { email: dto.email, firstName: dto.firstName, lastName: dto.lastName },
            cognitoResult.temporaryPassword,
            dto.accountName,
            {
              accountId: dto.accountId,
              accountName: dto.accountName,
              userId: id,
            },
          );
          if (notifResult.sent) {
            this.logger.log(`Credential email sent to ${dto.email} (msgId: ${notifResult.messageId}, audit: ${notifResult.auditId})`);
          } else if (notifResult.skipped) {
            this.logger.debug(`Credential email skipped for ${dto.email}: ${notifResult.reason}`);
          } else {
            this.logger.warn(`Credential email failed for ${dto.email}: ${notifResult.reason}`);
          }
        }
      } else if (cognitoResult.updated) {
        this.logger.log(`Cognito user already existed for ${dto.email}, attributes updated`);
      } else if (cognitoResult.skipped) {
        this.logger.warn(`Cognito provisioning skipped: ${cognitoResult.reason}`);
      }
    } catch (error: any) {
      // Log but don't block DynamoDB creation — Cognito can be reconciled later
      this.logger.error(
        `Cognito provisioning failed for ${dto.email}: ${error.message}. ` +
          'Proceeding with DynamoDB record creation.',
        error.stack,
      );
    }

    // ── Step 2: Persist user in DynamoDB ────────────────────────────────
    const user: Record<string, any> = {
      PK: `USER#${id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#USER',
      GSI1SK: `USER#${id}`,
      GSI2PK: `ACCOUNT#${dto.accountId}#USERS`,
      GSI2SK: `USER#${id}`,
      id,
      accountId: dto.accountId,
      enterpriseId: dto.enterpriseId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      middleName: dto.middleName,
      email: dto.email,
      assignedRole: dto.assignedRole,
      assignedGroup: dto.assignedGroup,
      startDate: dto.startDate,
      endDate: dto.endDate,
      status: 'active',
      isTechnicalUser: dto.isTechnicalUser ?? false,
      cognitoSub: cognitoSub, // Store Cognito sub for cross-reference
      createdAt: now,
      updatedAt: now,
    };

    const operations: any[] = [{ Put: { Item: user } }];

    // Add workstreams
    if (dto.workstreamIds?.length) {
      for (const workstreamId of dto.workstreamIds) {
        operations.push({
          Put: {
            Item: {
              PK: `USER#${id}`,
              SK: `WORKSTREAM#${workstreamId}`,
              id: uuidv4(),
              userId: id,
              workstreamId,
              createdAt: now,
            },
          },
        });
      }
    }

    await this.dynamoDb.transactWrite(operations);

    return {
      ...this.mapToUser(user),
      licenseCapacity: {
        ...capacity,
        currentActiveUsers: capacity.currentActiveUsers + 1,
        remaining: capacity.remaining - 1,
      },
    };
  }

  /**
   * Get the current license capacity for an account
   */
  async getLicenseCapacity(accountId: string): Promise<LicenseCapacity> {
    return this.licenseEnforcement.getCapacity(accountId);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const now = new Date().toISOString();
    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const expressionAttributeNames: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues: Record<string, any> = {
      ':updatedAt': now,
    };

    const fields = [
      'firstName', 'lastName', 'middleName', 'email',
      'assignedRole', 'assignedGroup', 'startDate', 'endDate', 'status',
    ];

    for (const field of fields) {
      if ((dto as Record<string, any>)[field] !== undefined) {
        updateExpressions.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = (dto as Record<string, any>)[field];
      }
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `USER#${id}`, SK: 'METADATA' },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    const updatedUser = this.mapToUser(result.Attributes!);

    // ── Sync changes to Cognito ─────────────────────────────────────────
    try {
      await this.cognitoProvisioning.updateUser({
        email: existing.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        accountId: dto.accountId,
        enterpriseId: dto.enterpriseId,
        role: dto.assignedRole,
        status: dto.status,
      });
      this.logger.log(`Cognito attributes synced for ${existing.email}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to sync Cognito attributes for ${existing.email}: ${error.message}`,
      );
    }

    return updatedUser;
  }

  async remove(id: string): Promise<void> {
    const items = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `USER#${id}` },
    });

    if (!items.Items?.length) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Extract user email from METADATA item for Cognito cleanup
    const metadataItem = items.Items.find((item: any) => item.SK === 'METADATA');
    const email = metadataItem?.email;

    // ── Remove from Cognito ──────────────────────────────────────────────
    if (email) {
      try {
        const result = await this.cognitoProvisioning.deleteUser(email);
        if (result.deleted) {
          this.logger.log(`Cognito user deleted: ${email}`);
        } else if (result.skipped) {
          this.logger.warn(`Cognito user deletion skipped for ${email}: ${result.reason}`);
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to delete Cognito user ${email}: ${error.message}. ` +
            'Proceeding with DynamoDB deletion.',
        );
      }
    }

    // ── Remove from DynamoDB ─────────────────────────────────────────────
    const deleteRequests = items.Items.map((item: any) => ({
      DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
    }));

    for (let i = 0; i < deleteRequests.length; i += 25) {
      await this.dynamoDb.batchWrite(deleteRequests.slice(i, i + 25));
    }
  }

  async getWorkstreams(userId: string): Promise<string[]> {
    const result = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'WORKSTREAM#',
      },
    });

    return (result.Items || []).map((item: any) => item.workstreamId);
  }

  async updateWorkstreams(userId: string, workstreamIds: string[]): Promise<string[]> {
    // Delete existing workstreams
    const existing = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'WORKSTREAM#',
      },
    });

    if (existing.Items?.length) {
      const deleteRequests = existing.Items.map((item: any) => ({
        DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
      }));
      await this.dynamoDb.batchWrite(deleteRequests);
    }

    // Add new workstreams
    const now = new Date().toISOString();
    const operations = workstreamIds.map((workstreamId) => ({
      Put: {
        Item: {
          PK: `USER#${userId}`,
          SK: `WORKSTREAM#${workstreamId}`,
          id: uuidv4(),
          userId,
          workstreamId,
          createdAt: now,
        },
      },
    }));

    if (operations.length) {
      await this.dynamoDb.transactWrite(operations);
    }

    return workstreamIds;
  }

  // ─── COGNITO RECONCILIATION ──────────────────────────────────────────

  /**
   * Scan DynamoDB users missing a cognitoSub and provision them in Cognito.
   *
   * Supports scoping by accountId for targeted reconciliation, or runs
   * globally when no accountId is provided. Only active users are
   * reconciled by default; set includeInactive=true to process all.
   *
   * Each user is processed independently — failures on one user do not
   * block others. A full summary report is returned.
   */
  async reconcileCognitoUsers(options?: {
    accountId?: string;
    dryRun?: boolean;
    includeInactive?: boolean;
  }): Promise<{
    totalScanned: number;
    missingCognitoSub: number;
    provisioned: number;
    updated: number;
    skipped: number;
    failed: number;
    dryRun: boolean;
    details: ReconciliationUserResult[];
  }> {
    const dryRun = options?.dryRun ?? false;
    const includeInactive = options?.includeInactive ?? false;

    if (!this.cognitoProvisioning.isConfigured()) {
      throw new BadRequestException(
        'Cognito is not configured (COGNITO_USER_POOL_ID missing). Cannot reconcile.',
      );
    }

    this.logger.log(
      `Starting Cognito reconciliation (dryRun=${dryRun}, accountId=${options?.accountId || 'ALL'}, includeInactive=${includeInactive})`,
    );

    // Fetch users — scoped by account or global
    let users: User[];
    if (options?.accountId) {
      users = await this.findByAccount(options.accountId);
    } else {
      users = await this.findAll();
    }

    // Filter to users missing cognitoSub
    const targetUsers = users.filter((u) => {
      const missingCognito = !u.cognitoSub;
      const statusOk = includeInactive || u.status === 'active';
      return missingCognito && statusOk;
    });

    this.logger.log(
      `Reconciliation scan: ${users.length} total users, ${targetUsers.length} missing cognitoSub`,
    );

    const details: ReconciliationUserResult[] = [];
    let provisioned = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of targetUsers) {
      if (dryRun) {
        details.push({
          userId: user.id,
          email: user.email,
          status: 'skipped',
          reason: 'Dry run — no changes applied',
        });
        skipped++;
        continue;
      }

      try {
        // Provision in Cognito
        const cognitoResult = await this.cognitoProvisioning.createUser({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          accountId: user.accountId,
          enterpriseId: user.enterpriseId,
          role: user.assignedRole,
          groupName: user.assignedGroup,
        });

        if (cognitoResult.skipped) {
          details.push({
            userId: user.id,
            email: user.email,
            status: 'skipped',
            reason: cognitoResult.reason,
          });
          skipped++;
          continue;
        }

        // Update DynamoDB record with the cognitoSub
        if (cognitoResult.cognitoSub) {
          await this.dynamoDb.update({
            Key: { PK: `USER#${user.id}`, SK: 'METADATA' },
            UpdateExpression: 'SET #cognitoSub = :cognitoSub, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#cognitoSub': 'cognitoSub',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':cognitoSub': cognitoResult.cognitoSub,
              ':updatedAt': new Date().toISOString(),
            },
          });
        }

        const status = cognitoResult.created ? 'provisioned' : 'updated';
        details.push({
          userId: user.id,
          email: user.email,
          status,
          cognitoSub: cognitoResult.cognitoSub,
        });

        if (cognitoResult.created) {
          provisioned++;
          this.logger.log(`Reconciled (created): ${user.email} → ${cognitoResult.cognitoSub}`);

          // Send credential notification for newly provisioned users during reconciliation
          if (cognitoResult.temporaryPassword) {
            const notifResult = await this.notificationService.sendCredentialProvisionedEmail(
              { email: user.email, firstName: user.firstName, lastName: user.lastName },
              cognitoResult.temporaryPassword,
              undefined,
              {
                accountId: user.accountId,
                userId: user.id,
              },
            );
            if (notifResult.sent) {
              this.logger.log(`Reconciliation credential email sent to ${user.email} (audit: ${notifResult.auditId})`);
            }
          }
        } else {
          updated++;
          this.logger.log(`Reconciled (updated): ${user.email} → ${cognitoResult.cognitoSub}`);
        }
      } catch (error: any) {
        details.push({
          userId: user.id,
          email: user.email,
          status: 'failed',
          reason: error.message,
        });
        failed++;
        this.logger.error(`Reconciliation failed for ${user.email}: ${error.message}`);
      }
    }

    const summary = {
      totalScanned: users.length,
      missingCognitoSub: targetUsers.length,
      provisioned,
      updated,
      skipped,
      failed,
      dryRun,
      details,
    };

    this.logger.log(
      `Reconciliation complete: scanned=${summary.totalScanned}, missing=${summary.missingCognitoSub}, ` +
        `provisioned=${provisioned}, updated=${updated}, skipped=${skipped}, failed=${failed}`,
    );

    return summary;
  }

  // ─── /me/access ────────────────────────────────────────────────────────

  /**
   * Return the authenticated user's accessible accounts and super_admin flag.
   * Resolves the user from DynamoDB via cognitoSub or email, then fetches
   * all accounts the user is linked to via TECH_USER records.
   */
  async getMyAccess(caller: CognitoUser): Promise<{
    isSuperAdmin: boolean;
    accounts: { accountId: string; accountName: string; enterpriseId: string | null; enterpriseName: string | null }[];
  }> {
    const isSuperAdmin =
      caller.role === 'super_admin' ||
      caller.groups.includes('super_admin') ||
      caller.email?.toLowerCase() === 'admin@adminplatform.com';

    if (isSuperAdmin) {
      // Super admins see every account
      const allAccounts = await this.dynamoDb.queryByIndex(
        'GSI1',
        'GSI1PK = :pk',
        { ':pk': 'ENTITY#ACCOUNT' },
      );

      const accounts = (allAccounts.Items || []).map((item: any) => ({
        accountId: item.id,
        accountName: item.name,
        enterpriseId: item.enterpriseId || null,
        enterpriseName: item.enterpriseName || null,
      }));

      return { isSuperAdmin: true, accounts };
    }

    // Regular user — find their technical-user records across all accounts
    const techUsers = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#TECH_USER' },
    );

    const matchingUsers = (techUsers.Items || []).filter(
      (item: any) =>
        item.email?.toLowerCase() === caller.email?.toLowerCase() &&
        item.status === 'active',
    );

    // For each matching tech user, fetch the account name
    const accounts = await Promise.all(
      matchingUsers.map(async (tu: any) => {
        let accountName = 'Unknown';
        let enterpriseName: string | null = null;
        try {
          const acctResult = await this.dynamoDb.get({
            Key: { PK: `ACCOUNT#${tu.accountId}`, SK: 'METADATA' },
          });
          if (acctResult.Item) {
            accountName = acctResult.Item.name;
          }
        } catch {
          // ignore
        }

        if (tu.enterpriseId) {
          try {
            const entResult = await this.dynamoDb.get({
              Key: { PK: `ENTERPRISE#${tu.enterpriseId}`, SK: 'METADATA' },
            });
            if (entResult.Item) {
              enterpriseName = entResult.Item.name;
            }
          } catch {
            // ignore
          }
        }

        return {
          accountId: tu.accountId,
          accountName,
          enterpriseId: tu.enterpriseId || null,
          enterpriseName,
        };
      }),
    );

    // Deduplicate by accountId
    const uniqueAccounts = accounts.filter(
      (acc, index, self) => index === self.findIndex((a) => a.accountId === acc.accountId),
    );

    return { isSuperAdmin: false, accounts: uniqueAccounts };
  }

  // ─── /me/permissions ──────────────────────────────────────────────────

  /**
   * Resolve the full permission chain for the authenticated user:
   * User (email) → technical_user → user_groups → group_roles → role → role_permissions
   */
  async getMyPermissions(
    caller: CognitoUser,
    accountId?: string,
    _enterpriseId?: string,
  ): Promise<{
    permissions: any[];
    roleId: string | null;
    roleName: string | null;
    technicalUserId: string | null;
  }> {
    // 1. Find the technical user record for the caller's email
    const techUsers = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#TECH_USER' },
    );

    let matchingUsers = (techUsers.Items || []).filter(
      (item: any) =>
        item.email?.toLowerCase() === caller.email?.toLowerCase() &&
        item.status === 'active',
    );

    // Scope to account if provided
    if (accountId && matchingUsers.length > 1) {
      const scoped = matchingUsers.filter((u: any) => u.accountId === accountId);
      if (scoped.length > 0) matchingUsers = scoped;
    }

    if (matchingUsers.length === 0) {
      this.logger.debug(`No technical user found for ${caller.email}`);
      return { permissions: [], roleId: null, roleName: null, technicalUserId: null };
    }

    const techUser = matchingUsers[0];
    const technicalUserId = techUser.id;

    // 2. Find groups the user belongs to (USER#<id> / GROUP#<groupId>)
    const userGroupsResult = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${technicalUserId}`,
        ':sk': 'GROUP#',
      },
    });

    const groupIds = (userGroupsResult.Items || []).map((item: any) => item.groupId);

    // 3. Find roles from the groups (GROUP#<groupId> / ROLE#<roleId>)
    let roleIds: string[] = [];
    for (const groupId of groupIds) {
      const groupRolesResult = await this.dynamoDb.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `GROUP#${groupId}`,
          ':sk': 'ROLE#',
        },
      });
      const ids = (groupRolesResult.Items || []).map((item: any) => item.roleId);
      roleIds.push(...ids);
    }
    roleIds = [...new Set(roleIds)];

    // 4. Fallback: if no roles found via groups, resolve from assignedRole name
    let roleId: string | null = null;
    let roleName: string | null = null;

    if (roleIds.length === 0 && techUser.assignedRole) {
      const allRoles = await this.dynamoDb.queryByIndex(
        'GSI1',
        'GSI1PK = :pk',
        { ':pk': 'ENTITY#ROLE' },
      );
      const match = (allRoles.Items || []).find(
        (r: any) => r.name === techUser.assignedRole,
      );
      if (match) {
        roleIds = [match.id];
        roleId = match.id;
        roleName = match.name;
      }
    } else if (roleIds.length > 0) {
      // Fetch first role's metadata for name
      const roleResult = await this.dynamoDb.get({
        Key: { PK: `ROLE#${roleIds[0]}`, SK: 'METADATA' },
      });
      if (roleResult.Item) {
        roleId = roleResult.Item.id;
        roleName = roleResult.Item.name;
      }
    }

    if (roleIds.length === 0) {
      return { permissions: [], roleId: null, roleName: null, technicalUserId };
    }

    // 5. Fetch and merge permissions from all roles (ROLE#<roleId> / PERMISSION#<menuKey>)
    const permissionsMap: Record<string, any> = {};

    for (const rid of roleIds) {
      const permsResult = await this.dynamoDb.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `ROLE#${rid}`,
          ':sk': 'PERMISSION#',
        },
      });

      for (const p of permsResult.Items || []) {
        const existing = permissionsMap[p.menuKey];
        const tabs = (p.tabs || []).map((t: any) => ({
          key: t.key,
          label: t.label,
          isVisible: t.isVisible ?? true,
        }));

        if (!existing) {
          permissionsMap[p.menuKey] = {
            menuKey: p.menuKey,
            menuLabel: p.menuLabel,
            isVisible: p.isVisible ?? false,
            tabs,
            canCreate: p.canCreate ?? false,
            canView: p.canView ?? false,
            canEdit: p.canEdit ?? false,
            canDelete: p.canDelete ?? false,
          };
        } else {
          existing.isVisible = existing.isVisible || (p.isVisible ?? false);
          existing.canCreate = existing.canCreate || (p.canCreate ?? false);
          existing.canView = existing.canView || (p.canView ?? false);
          existing.canEdit = existing.canEdit || (p.canEdit ?? false);
          existing.canDelete = existing.canDelete || (p.canDelete ?? false);
          for (const tab of tabs) {
            const existingTab = existing.tabs.find((t: any) => t.key === tab.key);
            if (!existingTab) {
              existing.tabs.push(tab);
            } else if (tab.isVisible) {
              existingTab.isVisible = true;
            }
          }
        }
      }
    }

    return {
      permissions: Object.values(permissionsMap),
      roleId,
      roleName,
      technicalUserId,
    };
  }

  private mapToUser(item: Record<string, any>): User {
    return {
      id: item.id,
      accountId: item.accountId,
      enterpriseId: item.enterpriseId,
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
      cognitoSub: item.cognitoSub,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
