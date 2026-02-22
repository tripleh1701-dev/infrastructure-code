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
import { ConnectorsService } from './connectors.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';
import { AccountGuard } from '../auth/guards/account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('connectors')
@UseGuards(AccountGuard)
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  /**
   * OAuth stub endpoints - called by the frontend credentials service.
   * These must be declared before :id routes to avoid path conflicts.
   */
  @Post('oauth/initiate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async oauthInitiate(
    @Body() body: { provider: string; credentialId: string; redirectUri: string },
  ) {
    return {
      authorizationUrl: `https://${body.provider}.example.com/oauth/authorize?client_id=stub&redirect_uri=${encodeURIComponent(body.redirectUri)}`,
      state: `state-${Date.now()}`,
    };
  }

  @Get('oauth/status/:credentialId')
  async oauthStatus(@Param('credentialId') credentialId: string) {
    return { status: 'pending' };
  }

  @Post('oauth/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async oauthRevoke(@Body() body: { credentialId: string }) {
    return { success: true };
  }

  @Get()
  async findAll(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.connectorsService.findAll(accountId, enterpriseId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.connectorsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async create(@Body() dto: CreateConnectorDto) {
    return this.connectorsService.create(dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async update(@Param('id') id: string, @Body() dto: UpdateConnectorDto) {
    return this.connectorsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async remove(@Param('id') id: string) {
    await this.connectorsService.remove(id);
  }
}
