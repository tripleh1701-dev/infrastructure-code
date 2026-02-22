import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';
import { AccountGuard } from '../auth/guards/account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('credentials')
@UseGuards(AccountGuard)
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  /**
   * GET /api/credentials/expiring?accountId=...&days=30
   * Must be declared before :id to avoid route conflicts.
   */
  @Get('expiring')
  async findExpiring(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
    @Query('days') days?: string,
  ) {
    return this.credentialsService.findExpiring({
      accountId,
      enterpriseId,
      days: days ? parseInt(days, 10) : 30,
    });
  }

  @Get('check-name')
  async checkName(
    @Query('name') name: string,
    @Query('accountId') accountId: string,
    @Query('enterpriseId') enterpriseId: string,
  ) {
    const all = await this.credentialsService.findAll(accountId, enterpriseId);
    return all
      .filter((c) => c.name.toLowerCase() === name.toLowerCase())
      .map((c) => ({ id: c.id, name: c.name }));
  }

  @Get()
  async findAll(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.credentialsService.findAll(accountId, enterpriseId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.credentialsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async create(@Body() dto: CreateCredentialDto) {
    return this.credentialsService.create(dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async update(@Param('id') id: string, @Body() dto: UpdateCredentialDto) {
    return this.credentialsService.update(id, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async patch(@Param('id') id: string, @Body() dto: UpdateCredentialDto) {
    return this.credentialsService.update(id, dto);
  }

  @Post(':id/rotate')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async rotate(
    @Param('id') id: string,
    @Body() body: { credentials: Record<string, any> },
  ) {
    return this.credentialsService.rotate(id, body.credentials);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async remove(@Param('id') id: string) {
    await this.credentialsService.remove(id);
  }
}
