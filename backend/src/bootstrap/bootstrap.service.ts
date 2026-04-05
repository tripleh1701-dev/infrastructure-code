import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { AccountProvisionerService } from '../common/dynamodb/account-provisioner.service';
import { CognitoBootstrapService } from './cognito-bootstrap.service';
import { SesHealthService, SesHealthResult } from '../common/health/ses-health.service';

/**
 * Day-0 Bootstrap Service
 *
 * Initializes the platform with:
 * - Default "PPP" account (Public Cloud)
 * - Global Enterprise, Product, Service
 * - Platform Admin user with super_admin role
 * - Platform Admin Group + Platform Role (full permissions)
 * - Technical Group + Technical Role (base permissions)
 * - Default "Global" workstream
 */

// Fixed UUIDs for deterministic bootstrapping
const FIXED_IDS = {
  ACCOUNT: 'a0000000-0000-0000-0000-000000000001',
  ENTERPRISE: '00000000-0000-0000-0000-000000000001',
  PRODUCT: '00000000-0000-0000-0000-000000000002',
  SERVICE: '00000000-0000-0000-0000-000000000003',
  PLATFORM_GROUP: 'b0000000-0000-0000-0000-000000000001',
  PLATFORM_ROLE: 'c0000000-0000-0000-0000-000000000001',
  TECHNICAL_GROUP: 'b0000000-0000-0000-0000-000000000002',
  TECHNICAL_ROLE: 'c0000000-0000-0000-0000-000000000002',
  ADMIN_USER: 'd0000000-0000-0000-0000-000000000001',
  DEFAULT_WORKSTREAM: 'e0000000-0000-0000-0000-000000000001',
  LICENSE: 'f0000000-0000-0000-0000-000000000001',
  ADDRESS: 'f1000000-0000-0000-0000-000000000001',
};

// Menu structure for role permissions
const MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'overview', label: 'Overview' },
  { key: 'account-settings', label: 'Account Settings' },
  { key: 'access-control', label: 'Access Control' },
  { key: 'security', label: 'Security & Governance' },
  { key: 'pipelines', label: 'Pipelines' },
  { key: 'builds', label: 'Builds' },
];

const ACCOUNT_SETTINGS_TABS = [
  { key: 'enterprises', label: 'Enterprise' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'global-settings', label: 'Global Settings' },
];

const ACCESS_CONTROL_TABS = [
  { key: 'users', label: 'Users' },
  { key: 'groups', label: 'Groups' },
  { key: 'roles', label: 'Roles' },
];

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);
  private readonly autoBootstrap: boolean;

  constructor(
    private readonly dynamoDb: DynamoDBService,
    private readonly configService: ConfigService,
    private readonly accountProvisioner: AccountProvisionerService,
    private readonly cognitoBootstrap: CognitoBootstrapService,
    private readonly sesHealth: SesHealthService,
  ) {
    this.autoBootstrap = this.configService.get('AUTO_BOOTSTRAP', 'false') === 'true';
  }

  async onModuleInit() {
    if (this.autoBootstrap) {
      await this.bootstrap();
    }
  }

  /**
   * Execute full Day-0 bootstrap
   */
  async bootstrap(): Promise<{ success: boolean; message: string; details: string[]; sesHealth?: SesHealthResult }> {
    const details: string[] = [];

    try {
      const now = new Date().toISOString();

      // Check if already bootstrapped
      const existing = await this.checkExistingBootstrap();
      if (existing) {
        this.logger.log('Platform already bootstrapped, reconciling RBAC defaults');
        await this.reconcileBootstrapRbac(now);

        let sesHealthResult: SesHealthResult | undefined;
        try {
          sesHealthResult = await this.sesHealth.check();
        } catch {}

        return {
          success: true,
          message: 'Platform already bootstrapped; RBAC reconciled',
          details: [
            'Bootstrap data already exists',
            'Reconciled Platform Role and Technical Role permissions',
          ],
          sesHealth: sesHealthResult,
        };
      }

      this.logger.log('Starting Day-0 bootstrap...');

      // Pre-flight: Validate email configuration
      this.validateEmailConfig(details);

      // Step 1: Create master data (Products & Services)
      await this.createMasterData(now);
      details.push('Created Global Product and Global Service');

      // Step 2: Create Global Enterprise
      await this.createGlobalEnterprise(now);
      details.push('Created Global Enterprise with Product/Service linkage');

      // Step 3: Create PPP Account
      await this.createPPPAccount(now);
      details.push('Created PPP Account (Public Cloud)');

      // Step 4: Register account in SSM (provisioning)
      await this.registerAccountProvisioning();
      details.push('Registered PPP Account in SSM Parameter Store');

      // Step 5: Create License
      await this.createLicense(now);
      details.push('Created Global License (100 users)');

      // Step 6: Create Groups
      await this.createGroups(now);
      details.push('Created Platform Admin Group and Technical Group');

      // Step 7: Create Roles with full permissions
      await this.createRoles(now);
      details.push('Created Platform Role (full access) and Technical Role (pipelines + access control management)');

      // Step 8: Link Roles to Groups
      await this.linkRolesToGroups(now);
      details.push('Linked Platform Role → Platform Admin Group, Technical Role → Technical Group');

      // Step 9: Create Platform Admin Technical User
      await this.createAdminUser(now);
      details.push('Created admin technical user (tripleh1701@gmail.com)');

      // Step 10: Assign user to Platform Admin Group
      await this.assignUserToGroup(now);
      details.push('Assigned admin user to Platform Admin Group');

      // Step 11: Create Default Workstream
      await this.createDefaultWorkstream(now);
      details.push('Created Default Workstream (Global)');

      // Step 12: Provision admin user in Cognito User Pool
      await this.provisionCognitoAdmin(details);

      // Post-bootstrap: Run live SES health check
      let sesHealthResult: SesHealthResult | undefined;
      try {
        sesHealthResult = await this.sesHealth.check();
        const emoji = sesHealthResult.status === 'healthy' ? '✅' : sesHealthResult.status === 'degraded' ? '⚠️' : '❌';
        details.push(`${emoji} SES health: ${sesHealthResult.status} (${Object.values(sesHealthResult.checks).filter(c => c.status === 'fail').length} failures, ${Object.values(sesHealthResult.checks).filter(c => c.status === 'warn').length} warnings)`);
      } catch (e: any) {
        this.logger.warn(`SES health check failed during bootstrap: ${e.message}`);
        details.push('⚠️ SES health check could not be completed');
      }

      this.logger.log('Day-0 bootstrap completed successfully!');

      return {
        success: true,
        message: 'Platform bootstrapped successfully',
        details,
        sesHealth: sesHealthResult,
      };
    } catch (error: any) {
      this.logger.error(`Bootstrap failed: ${error.message}`, error.stack);
      let sesHealthResult: SesHealthResult | undefined;
      try {
        sesHealthResult = await this.sesHealth.check();
      } catch {}
      return {
        success: false,
        message: `Bootstrap failed: ${error.message}`,
        details,
        sesHealth: sesHealthResult,
      };
    }
  }

  /**
   * Check if bootstrap has already been executed
   */
  private async checkExistingBootstrap(): Promise<boolean> {
    try {
      const result = await this.dynamoDb.get({
        Key: { PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`, SK: 'METADATA' },
      });
      return !!result.Item;
    } catch {
      return false;
    }
  }

  /**
   * Pre-flight: Validate email configuration is properly set for user provisioning.
   * Warns at bootstrap time if SES is misconfigured so admins can fix before creating users.
   */
  private validateEmailConfig(details: string[]): void {
    const notifEnabled = this.configService.get('CREDENTIAL_NOTIFICATION_ENABLED', 'false');
    const senderEmail = this.configService.get('SES_SENDER_EMAIL', 'noreply@example.com');
    const cognitoPoolId = this.configService.get('COGNITO_USER_POOL_ID', '');

    if (notifEnabled !== 'true') {
      this.logger.warn(
        'CREDENTIAL_NOTIFICATION_ENABLED is not "true". ' +
        'Credential emails will NOT be sent when technical users are created. ' +
        'Set CREDENTIAL_NOTIFICATION_ENABLED=true and configure SES_SENDER_EMAIL to enable.',
      );
      details.push('⚠️ Email notifications disabled — new users will not receive credential emails');
    } else if (!senderEmail || senderEmail === 'noreply@example.com') {
      this.logger.warn(
        'SES_SENDER_EMAIL is not configured or still default. ' +
        'Credential emails will fail at send time. ' +
        'Set SES_SENDER_EMAIL to a verified SES identity.',
      );
      details.push('⚠️ SES_SENDER_EMAIL not configured — credential emails will fail');
    } else {
      details.push(`Email notifications enabled (sender: ${senderEmail})`);
    }

    if (!cognitoPoolId) {
      this.logger.warn(
        'COGNITO_USER_POOL_ID not set. Cognito user provisioning will be skipped.',
      );
      details.push('⚠️ Cognito not configured — users will not be provisioned in User Pool');
    } else {
      details.push(`Cognito User Pool configured (${cognitoPoolId})`);
    }
  }

  /**
   * Step 1: Create Global Product and Service
   */
  private async createMasterData(now: string): Promise<void> {
    await this.dynamoDb.transactWrite([
      {
        Put: {
          Item: {
            PK: `PRODUCT#${FIXED_IDS.PRODUCT}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#PRODUCT',
            GSI1SK: `PRODUCT#${FIXED_IDS.PRODUCT}`,
            id: FIXED_IDS.PRODUCT,
            name: 'Global',
            description: 'Default global product',
            createdAt: now,
          },
        },
      },
      {
        Put: {
          Item: {
            PK: `SERVICE#${FIXED_IDS.SERVICE}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#SERVICE',
            GSI1SK: `SERVICE#${FIXED_IDS.SERVICE}`,
            id: FIXED_IDS.SERVICE,
            name: 'Global',
            description: 'Default global service',
            createdAt: now,
          },
        },
      },
    ]);
  }

  /**
   * Step 2: Create Global Enterprise with Product/Service linkage
   */
  private async createGlobalEnterprise(now: string): Promise<void> {
    await this.dynamoDb.transactWrite([
      {
        Put: {
          Item: {
            PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#ENTERPRISE',
            GSI1SK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
            id: FIXED_IDS.ENTERPRISE,
            name: 'Global',
            createdAt: now,
            updatedAt: now,
          },
        },
      },
      {
        Put: {
          Item: {
            PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
            SK: `PRODUCT#${FIXED_IDS.PRODUCT}`,
            enterpriseId: FIXED_IDS.ENTERPRISE,
            productId: FIXED_IDS.PRODUCT,
            createdAt: now,
          },
        },
      },
      {
        Put: {
          Item: {
            PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
            SK: `SERVICE#${FIXED_IDS.SERVICE}`,
            enterpriseId: FIXED_IDS.ENTERPRISE,
            serviceId: FIXED_IDS.SERVICE,
            createdAt: now,
          },
        },
      },
    ]);
  }

  /**
   * Step 3: Create PPP Account with default address
   */
  private async createPPPAccount(now: string): Promise<void> {
    await this.dynamoDb.transactWrite([
      {
        Put: {
          Item: {
            PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#ACCOUNT',
            GSI1SK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
            GSI2PK: 'CLOUD_TYPE#PUBLIC',
            GSI2SK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
            id: FIXED_IDS.ACCOUNT,
            name: 'PPP',
            masterAccountName: 'PPP',
            cloudType: 'public',
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        },
      },
      {
        Put: {
          Item: {
            PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
            SK: `ADDRESS#${FIXED_IDS.ADDRESS}`,
            id: FIXED_IDS.ADDRESS,
            accountId: FIXED_IDS.ACCOUNT,
            line1: '123 Platform Street',
            line2: 'Suite 100',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94105',
            country: 'United States',
            createdAt: now,
          },
        },
      },
    ]);
  }

  /**
   * Step 4: Register account in SSM for DynamoDB routing
   */
  private async registerAccountProvisioning(): Promise<void> {
    try {
      const result = await this.accountProvisioner.provisionAccount({
        accountId: FIXED_IDS.ACCOUNT,
        accountName: 'PPP',
        cloudType: 'public',
      });
      this.logger.log(`Account provisioning registered: table=${result.tableName}, cloudType=${result.cloudType}`);
    } catch (error: any) {
      // This is CRITICAL — without SSM params, ALL data falls back to control plane!
      this.logger.error(
        `CRITICAL: SSM provisioning FAILED for bootstrap account. ` +
        `Operational data (builds, pipelines, etc.) will be written to the CONTROL PLANE table ` +
        `instead of the customer data-plane table. Error: ${error.message}`,
      );
      // Re-throw so the bootstrap response shows this failure
      throw new Error(`SSM provisioning failed — cross-account routing will not work: ${error.message}`);
    }
  }

  /**
   * Step 5: Create Global License
   */
  private async createLicense(now: string): Promise<void> {
    await this.dynamoDb.put({
      Item: {
        PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
        SK: `LICENSE#${FIXED_IDS.LICENSE}`,
        GSI1PK: 'ENTITY#LICENSE',
        GSI1SK: `LICENSE#${FIXED_IDS.LICENSE}`,
        GSI2PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
        GSI2SK: `LICENSE#${FIXED_IDS.LICENSE}`,
        GSI3PK: 'LICENSE#STATUS#active',
        GSI3SK: `2099-12-31#${FIXED_IDS.LICENSE}`,
        id: FIXED_IDS.LICENSE,
        accountId: FIXED_IDS.ACCOUNT,
        enterpriseId: FIXED_IDS.ENTERPRISE,
        productId: FIXED_IDS.PRODUCT,
        serviceId: FIXED_IDS.SERVICE,
        startDate: now.split('T')[0],
        endDate: '2099-12-31',
        numberOfUsers: 100,
        renewalNotify: true,
        noticeDays: 30,
        contactFullName: 'PPP Admin',
        contactEmail: 'tripleh1701@gmail.com',
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  /**
   * Step 6: Create Platform Admin Group and Technical Group
   */
  private async createGroups(now: string): Promise<void> {
    await this.dynamoDb.transactWrite([
      {
        Put: {
          Item: {
            PK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#GROUP',
            GSI1SK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`,
            id: FIXED_IDS.PLATFORM_GROUP,
            name: 'Platform Admin',
            description: 'Full platform administration access',
            accountId: FIXED_IDS.ACCOUNT,
            enterpriseId: FIXED_IDS.ENTERPRISE,
            workstreamId: FIXED_IDS.DEFAULT_WORKSTREAM,
            createdAt: now,
            updatedAt: now,
          },
        },
      },
      {
        Put: {
          Item: {
            PK: `GROUP#${FIXED_IDS.TECHNICAL_GROUP}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#GROUP',
            GSI1SK: `GROUP#${FIXED_IDS.TECHNICAL_GROUP}`,
            id: FIXED_IDS.TECHNICAL_GROUP,
            name: 'Technical Group',
            description: 'Default technical user group for customer accounts',
            accountId: FIXED_IDS.ACCOUNT,
            enterpriseId: FIXED_IDS.ENTERPRISE,
            workstreamId: FIXED_IDS.DEFAULT_WORKSTREAM,
            createdAt: now,
            updatedAt: now,
          },
        },
      },
    ]);
  }

  /**
   * Step 7: Create Platform Role (full perms) and Technical Role
   * (CRUD on pipelines + access control, view-only elsewhere)
   */
  private async createRoles(now: string): Promise<void> {
    // Create role metadata
    await this.dynamoDb.transactWrite([
      {
        Put: {
          Item: {
            PK: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#ROLE',
            GSI1SK: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`,
            id: FIXED_IDS.PLATFORM_ROLE,
            name: 'Platform Role',
            description: 'Full application access for platform administrators',
            permissions: 0,
            accountId: FIXED_IDS.ACCOUNT,
            enterpriseId: FIXED_IDS.ENTERPRISE,
            workstreamId: FIXED_IDS.DEFAULT_WORKSTREAM,
            productId: FIXED_IDS.PRODUCT,
            serviceId: FIXED_IDS.SERVICE,
            createdAt: now,
            updatedAt: now,
          },
        },
      },
      {
        Put: {
          Item: {
            PK: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#ROLE',
            GSI1SK: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`,
            id: FIXED_IDS.TECHNICAL_ROLE,
            name: 'Technical Role',
            description: 'Technical users can manage access control and pipelines while remaining view-only elsewhere',
            permissions: 0,
            accountId: FIXED_IDS.ACCOUNT,
            enterpriseId: FIXED_IDS.ENTERPRISE,
            workstreamId: FIXED_IDS.DEFAULT_WORKSTREAM,
            productId: FIXED_IDS.PRODUCT,
            serviceId: FIXED_IDS.SERVICE,
            createdAt: now,
            updatedAt: now,
          },
        },
      },
    ]);

    // Create full permissions for Platform Role
    const platformPermissions = MENU_ITEMS.map((menu) => ({
      Put: {
        Item: {
          PK: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`,
          SK: `PERMISSION#${menu.key}`,
          id: uuidv4(),
          roleId: FIXED_IDS.PLATFORM_ROLE,
          menuKey: menu.key,
          menuLabel: menu.label,
          isVisible: true,
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: true,
          tabs: this.getTabsForMenu(menu.key, true),
          createdAt: now,
          updatedAt: now,
        },
      },
    }));

    // Batch write permissions (max 25 per transaction)
    for (let i = 0; i < platformPermissions.length; i += 25) {
      await this.dynamoDb.transactWrite(platformPermissions.slice(i, i + 25));
    }

    // Create Technical Role permissions (CRUD on pipelines + access control, view-only elsewhere)
    const technicalPermissions = MENU_ITEMS.map((menu) => ({
      Put: {
        Item: {
          PK: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`,
          SK: `PERMISSION#${menu.key}`,
          id: uuidv4(),
          roleId: FIXED_IDS.TECHNICAL_ROLE,
          menuKey: menu.key,
          menuLabel: menu.label,
          isVisible: true,
          canView: true,
          canCreate: this.isTechnicalCrudMenu(menu.key),
          canEdit: this.isTechnicalCrudMenu(menu.key),
          canDelete: this.isTechnicalCrudMenu(menu.key),
          tabs: this.getTabsForMenu(menu.key, false, this.isTechnicalCrudMenu(menu.key)),
          createdAt: now,
          updatedAt: now,
        },
      },
    }));

    for (let i = 0; i < technicalPermissions.length; i += 25) {
      await this.dynamoDb.transactWrite(technicalPermissions.slice(i, i + 25));
    }
  }

  /**
   * Get tab-level permissions for specific menus
   */
  private getTabsForMenu(menuKey: string, fullAccess: boolean, technicalCrud = false): any[] {
    if (menuKey === 'account-settings') {
      return ACCOUNT_SETTINGS_TABS.map((tab) => ({
        key: tab.key,
        label: tab.label,
        isVisible: true,
        canView: true,
        canCreate: fullAccess,
        canEdit: fullAccess,
        canDelete: fullAccess,
      }));
    }

    if (menuKey === 'access-control') {
      return ACCESS_CONTROL_TABS.map((tab) => ({
        key: tab.key,
        label: tab.label,
        isVisible: true,
        canView: true,
        canCreate: fullAccess || technicalCrud,
        canEdit: fullAccess || technicalCrud,
        canDelete: fullAccess || technicalCrud,
      }));
    }

    return [];
  }

  private isTechnicalCrudMenu(menuKey: string): boolean {
    return menuKey === 'access-control' || menuKey === 'pipelines';
  }

  /**
   * Step 8: Link Roles to Groups via group_roles junction
   */
  private async linkRolesToGroups(now: string): Promise<void> {
    await this.dynamoDb.transactWrite([
      {
        Put: {
          Item: {
            PK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`,
            SK: `ROLE#${FIXED_IDS.PLATFORM_ROLE}`,
            id: uuidv4(),
            groupId: FIXED_IDS.PLATFORM_GROUP,
            roleId: FIXED_IDS.PLATFORM_ROLE,
            createdAt: now,
          },
        },
      },
      {
        Put: {
          Item: {
            PK: `GROUP#${FIXED_IDS.TECHNICAL_GROUP}`,
            SK: `ROLE#${FIXED_IDS.TECHNICAL_ROLE}`,
            id: uuidv4(),
            groupId: FIXED_IDS.TECHNICAL_GROUP,
            roleId: FIXED_IDS.TECHNICAL_ROLE,
            createdAt: now,
          },
        },
      },
    ]);
  }

  /**
   * Step 9: Create Platform Admin Technical User
   */
  private async createAdminUser(now: string): Promise<void> {
    await this.dynamoDb.transactWrite([
      {
        Put: {
          Item: {
            PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
            SK: `TECH_USER#${FIXED_IDS.ADMIN_USER}`,
            GSI1PK: 'ENTITY#TECH_USER',
            GSI1SK: `USER#${FIXED_IDS.ADMIN_USER}`,
            id: FIXED_IDS.ADMIN_USER,
            accountId: FIXED_IDS.ACCOUNT,
            enterpriseId: FIXED_IDS.ENTERPRISE,
            firstName: 'PPP',
            lastName: 'Admin',
            email: 'tripleh1701@gmail.com',
            assignedRole: 'Platform Role',
            assignedGroup: 'Platform Admin',
            startDate: now.split('T')[0],
            status: 'active',
            isTechnicalUser: true,
            createdAt: now,
            updatedAt: now,
          },
        },
      },
      // Also create the user entity for full user management
      {
        Put: {
          Item: {
            PK: `USER#${FIXED_IDS.ADMIN_USER}`,
            SK: 'METADATA',
            GSI1PK: 'ENTITY#USER',
            GSI1SK: `USER#${FIXED_IDS.ADMIN_USER}`,
            GSI2PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}#USERS`,
            GSI2SK: `USER#${FIXED_IDS.ADMIN_USER}`,
            id: FIXED_IDS.ADMIN_USER,
            accountId: FIXED_IDS.ACCOUNT,
            enterpriseId: FIXED_IDS.ENTERPRISE,
            firstName: 'PPP',
            lastName: 'Admin',
            email: 'tripleh1701@gmail.com',
            assignedRole: 'Platform Role',
            assignedGroup: 'Platform Admin',
            startDate: now.split('T')[0],
            status: 'active',
            isTechnicalUser: true,
            createdAt: now,
            updatedAt: now,
          },
        },
      },
    ]);
  }

  /**
   * Step 10: Assign admin user to Platform Admin Group
   */
  private async assignUserToGroup(now: string): Promise<void> {
    await this.dynamoDb.put({
      Item: {
        PK: `USER#${FIXED_IDS.ADMIN_USER}`,
        SK: `GROUP#${FIXED_IDS.PLATFORM_GROUP}`,
        id: uuidv4(),
        userId: FIXED_IDS.ADMIN_USER,
        groupId: FIXED_IDS.PLATFORM_GROUP,
        createdAt: now,
      },
    });
  }

  /**
   * Step 11: Create Default Workstream (Global)
   */
  private async createDefaultWorkstream(now: string): Promise<void> {
    await this.dynamoDb.put({
      Item: {
        PK: `ACCOUNT#${FIXED_IDS.ACCOUNT}`,
        SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
        GSI1PK: 'ENTITY#WORKSTREAM',
        GSI1SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
        GSI2PK: `ENTERPRISE#${FIXED_IDS.ENTERPRISE}`,
        GSI2SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
        id: FIXED_IDS.DEFAULT_WORKSTREAM,
        name: 'Global',
        accountId: FIXED_IDS.ACCOUNT,
        enterpriseId: FIXED_IDS.ENTERPRISE,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Assign admin user to default workstream
    await this.dynamoDb.put({
      Item: {
        PK: `USER#${FIXED_IDS.ADMIN_USER}`,
        SK: `WORKSTREAM#${FIXED_IDS.DEFAULT_WORKSTREAM}`,
        id: uuidv4(),
        userId: FIXED_IDS.ADMIN_USER,
        workstreamId: FIXED_IDS.DEFAULT_WORKSTREAM,
        createdAt: now,
      },
    });
  }

  /**
   * Reconcile bootstrap RBAC defaults for existing installs.
   * Safe to run multiple times because all bootstrap entities use fixed IDs.
   */
  private async reconcileBootstrapRbac(now: string): Promise<void> {
    await this.createGroups(now);
    await this.createRoles(now);
    await this.linkRolesToGroups(now);
  }

  /**
   * Step 12: Provision admin user and PlatformAdmins group in Cognito
   */
  private async provisionCognitoAdmin(details: string[]): Promise<void> {
    if (!this.cognitoBootstrap.isConfigured()) {
      this.logger.warn('Cognito not configured — skipping Cognito user provisioning');
      details.push('Cognito provisioning skipped (COGNITO_USER_POOL_ID not set)');
      return;
    }

    try {
      const result = await this.cognitoBootstrap.provisionAdminUser(
        FIXED_IDS.ACCOUNT,
        FIXED_IDS.ENTERPRISE,
      );

      if (result.skipped) {
        details.push(`Cognito provisioning skipped: ${result.reason}`);
        return;
      }

      const actions: string[] = [];
      if (result.groupCreated) actions.push('created PlatformAdmins group');
      if (result.userCreated) actions.push('created admin user');
      if (!result.userCreated && result.cognitoUserSub) actions.push('updated admin user attributes');
      if (result.userAssignedToGroup) actions.push('assigned to PlatformAdmins group');

      details.push(`Cognito: ${actions.join(', ')} (sub: ${result.cognitoUserSub})`);
    } catch (error: any) {
      this.logger.error(`Cognito provisioning failed: ${error.message}`, error.stack);
      details.push(`Cognito provisioning failed: ${error.message}`);
      // Non-fatal — DynamoDB bootstrap still succeeded
    }
  }

  /**
   * Get fixed IDs for reference
   */
  getFixedIds() {
    return FIXED_IDS;
  }
}
