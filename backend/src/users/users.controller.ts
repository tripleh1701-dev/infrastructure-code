import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserWorkstreamsDto } from './dto/update-user-workstreams.dto';
import { UpdateUserGroupsDto } from './dto/update-user-groups.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CognitoUserProvisioningService } from '../auth/cognito-user-provisioning.service';
import { NotificationService } from '../common/notifications/notification.service';
import { AuthenticatedRequest } from '../auth/interfaces/cognito-user.interface';
import { AccountGuard } from '../auth/guards/account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('users')
@UseGuards(AccountGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly cognitoProvisioning: CognitoUserProvisioningService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * GET /api/users/me/access
   * Returns the authenticated user's accessible accounts and super_admin flag.
   * Must be declared before :id to avoid NestJS treating "me" as an ID param.
   */
  @Get('me/access')
  async getMyAccess(@Req() req: AuthenticatedRequest) {
    return this.usersService.getMyAccess(req.user);
  }

  /**
   * GET /api/users/me/permissions?accountId=...&enterpriseId=...
   * Returns the authenticated user's merged role permissions.
   */
  @Get('me/permissions')
  async getMyPermissions(
    @Req() req: AuthenticatedRequest,
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.usersService.getMyPermissions(req.user, accountId, enterpriseId);
  }

  /**
   * GET /api/users/capacity?accountId=<uuid>
   * Returns license capacity for an account.
   * Must be declared before :id to avoid NestJS treating "capacity" as an ID param.
   */
  @Get('capacity')
  async getLicenseCapacity(@Query('accountId') accountId: string) {
    return this.usersService.getLicenseCapacity(accountId);
  }

  /**
   * GET /api/users/check-email?email=...&accountId=...
   * Checks if an email already exists among technical users.
   * Must be declared before :id to avoid route conflicts.
   */
  @Get('check-email')
  async checkEmail(
    @Query('email') email: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.usersService.checkEmailExists(email, accountId);
  }

  /**
   * POST /api/users/reconcile/cognito
   * Reconcile DynamoDB users with Cognito User Pool.
   * Must be declared before :id to avoid route conflicts.
   */
  @Post('reconcile/cognito')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  async reconcileCognitoUsers(
    @Query('accountId') accountId?: string,
    @Query('dryRun') dryRun?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.usersService.reconcileCognitoUsers({
      accountId,
      dryRun: dryRun === 'true',
      includeInactive: includeInactive === 'true',
    });
  }

  /**
   * POST /api/users/provision
   * Provision a Cognito auth user (called by frontend AddUserDialog and Step Functions).
   * Must be declared before :id to avoid route conflicts.
   */
  @Post('provision')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  @HttpCode(HttpStatus.OK)
  async provisionAuthUser(
    @Body()
    body: {
      email: string;
      password?: string;
      firstName: string;
      lastName: string;
      middleName?: string;
      accountId?: string;
      enterpriseId?: string;
      role?: string;
      groupName?: string;
    },
  ) {
    // Validate and normalize email before sending to Cognito
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.logger.warn(`Invalid email for provisioning: "${body.email}"`);
      return {
        success: false,
        error: `Invalid email address: "${body.email}". Please provide a valid email.`,
      };
    }

    this.logger.log(`Provisioning auth user: ${email}`);
    try {
      const result = await this.cognitoProvisioning.createUser({
        email,
        firstName: body.firstName,
        lastName: body.lastName,
        accountId: body.accountId || '',
        enterpriseId: body.enterpriseId,
        role: body.role || 'user',
        groupName: body.groupName,
        temporaryPassword: body.password,
      });

      // Send credential email whenever a password is available (new user or reprovisioned user)
      let emailResult: { sent?: boolean; skipped?: boolean; reason?: string; messageId?: string } | null = null;
      if (result.temporaryPassword) {
        try {
          const notifResult = await this.notificationService.sendCredentialProvisionedEmail(
            { email, firstName: body.firstName, lastName: body.lastName },
            result.temporaryPassword,
            body.accountId || 'Platform',
            {
              accountId: body.accountId || '',
              accountName: body.accountId || 'Platform',
              userId: result.cognitoSub || '',
            },
          );
          emailResult = { sent: notifResult.sent, skipped: notifResult.skipped, reason: notifResult.reason, messageId: notifResult.messageId };
          if (notifResult.sent) {
            this.logger.log(`Credential email sent to ${email} (msgId: ${notifResult.messageId})`);
          } else {
            this.logger.warn(`Credential email not sent for ${email}: ${notifResult.reason}`);
          }
        } catch (emailError: any) {
          this.logger.error(`Failed to send credential email to ${email}: ${emailError.message}`);
          emailResult = { sent: false, reason: emailError.message };
        }
      }

      const emailSent = emailResult?.sent ?? false;

      return {
        success: true,
        userId: result.cognitoSub,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        emailSent,
        emailSkipped: emailResult?.skipped ?? false,
        emailError: emailResult?.reason,
        fallbackPassword: emailSent ? undefined : result.temporaryPassword,
      };
    } catch (error: any) {
      this.logger.error(`Failed to provision auth user ${body.email}: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message || 'Failed to provision authentication user',
      };
    }
  }

  /**
   * POST /api/users/:id/resend-credentials
   * Regenerates a password and resends the credential email for an existing user.
   */
  @Post(':id/resend-credentials')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  @HttpCode(HttpStatus.OK)
  async resendCredentials(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.logger.log(`Resend credentials requested for user ${id}`);

    try {
      const user = await this.usersService.findOne(id);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const email = user.email;
      if (!email) {
        return { success: false, error: 'User has no email address' };
      }

      // Reset password in Cognito (generates a new temporary password)
      const result = await this.cognitoProvisioning.resetUserPassword(email);
      if (!result.success) {
        return { success: false, error: result.reason || 'Failed to reset password in Cognito' };
      }

      // Send credential email with the new password
      let emailSent = false;
      let emailError: string | undefined;
      if (result.temporaryPassword) {
        try {
          const notifResult = await this.notificationService.sendCredentialProvisionedEmail(
            { email, firstName: user.firstName || '', lastName: user.lastName || '' },
            result.temporaryPassword,
            user.accountId || 'Platform',
            {
              accountId: user.accountId || '',
              accountName: (user as any).accountName || user.accountId || 'Platform',
              userId: id,
            },
          );
          emailSent = notifResult.sent ?? false;
          if (!emailSent) {
            emailError = notifResult.reason;
            this.logger.warn(`Credential email not sent for ${email}: ${notifResult.reason}`);
          } else {
            this.logger.log(`Credential email resent to ${email} (msgId: ${notifResult.messageId})`);
          }
        } catch (err: any) {
          emailError = err.message;
          this.logger.error(`Failed to resend credential email to ${email}: ${err.message}`);
        }
      }

      return {
        success: true,
        passwordReset: true,
        emailSent,
        emailError,
        fallbackPassword: emailSent ? undefined : result.temporaryPassword,
      };
    } catch (error: any) {
      this.logger.error(`Failed to resend credentials for user ${id}: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message || 'Failed to resend credentials',
      };
    }
  }

  /**
   * POST /api/users/:id/reset-password
   * Resets a user's Cognito password without sending an email.
   * Returns the new temporary password for the admin to share manually.
   */
  @Post(':id/reset-password')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.logger.log(`Reset password requested for user ${id}`);

    try {
      const user = await this.usersService.findOne(id);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const email = user.email;
      if (!email) {
        return { success: false, error: 'User has no email address' };
      }

      const result = await this.cognitoProvisioning.resetUserPassword(email);
      if (!result.success) {
        return { success: false, error: result.reason || 'Failed to reset password in Cognito' };
      }

      this.logger.log(`Password reset successfully for user ${email}`);

      return {
        success: true,
        temporaryPassword: result.temporaryPassword,
      };
    } catch (error: any) {
      this.logger.error(`Failed to reset password for user ${id}: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message || 'Failed to reset password',
      };
    }
  }

  @Get()
  async findAll(@Query('accountId') accountId?: string) {
    if (accountId) {
      return this.usersService.findByAccount(accountId);
    }
    return this.usersService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  /**
   * Create a new user.
   * Returns 201 with the created user and updated license capacity.
   * Returns 403 if license limits would be exceeded.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
  }

  // User Workstreams
  @Get(':id/workstreams')
  async getWorkstreams(@Param('id') id: string) {
    return this.usersService.getWorkstreams(id);
  }

  @Put(':id/workstreams')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async updateWorkstreams(
    @Param('id') id: string,
    @Body() body: UpdateUserWorkstreamsDto,
  ) {
    return this.usersService.updateWorkstreams(id, body.workstreamIds);
  }

  // User Groups
  @Get(':id/groups')
  async getUserGroups(@Param('id') id: string) {
    return this.usersService.getUserGroups(id);
  }

  @Put(':id/groups')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async updateUserGroups(
    @Param('id') id: string,
    @Body() body: UpdateUserGroupsDto,
  ) {
    return this.usersService.updateUserGroups(id, body.groupIds);
  }
}
