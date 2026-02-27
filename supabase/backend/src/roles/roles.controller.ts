import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AccountGuard } from '../auth/guards/account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('roles')
@UseGuards(AccountGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async findAll(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.rolesService.findAll(accountId, enterpriseId);
  }

  /**
   * POST /roles/backfill-permissions
   * Adds missing inbox & monitoring permission entries to every existing role.
   * Idempotent – safe to call multiple times.
   * Must be declared BEFORE :id routes to avoid path collision.
   */
  @Post('backfill-permissions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async backfillPermissions() {
    const menuItems = [
      { key: 'inbox', label: 'Inbox' },
      { key: 'monitoring', label: 'Monitoring' },
    ];
    return this.rolesService.backfillPermissions(menuItems);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async remove(@Param('id') id: string) {
    await this.rolesService.remove(id);
  }

  // Role Permissions endpoints
  @Get(':id/permissions')
  async getPermissions(@Param('id') id: string) {
    return this.rolesService.getPermissions(id);
  }

  @Put(':id/permissions')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async updatePermissions(
    @Param('id') id: string,
    @Body() permissions: any[],
  ) {
    return this.rolesService.updatePermissions(id, permissions);
  }
}
