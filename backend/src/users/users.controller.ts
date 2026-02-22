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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/interfaces/cognito-user.interface';
import { AccountGuard } from '../auth/guards/account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('users')
@UseGuards(AccountGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
    @Body() workstreamIds: string[],
  ) {
    return this.usersService.updateWorkstreams(id, workstreamIds);
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
    @Body() body: { groupIds: string[] },
  ) {
    return this.usersService.updateUserGroups(id, body.groupIds);
  }
}
