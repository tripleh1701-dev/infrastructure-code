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
} from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

@Controller('connectors')
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  /**
   * OAuth stub endpoints - called by the frontend credentials service.
   * These must be declared before :id routes to avoid path conflicts.
   */
  @Post('oauth/initiate')
  @HttpCode(HttpStatus.OK)
  async oauthInitiate(
    @Body() body: { provider: string; credentialId: string; redirectUri: string },
  ) {
    // Stub: OAuth initiation would be handled by a dedicated OAuth service
    return {
      authorizationUrl: `https://${body.provider}.example.com/oauth/authorize?client_id=stub&redirect_uri=${encodeURIComponent(body.redirectUri)}`,
      state: `state-${Date.now()}`,
    };
  }

  @Get('oauth/status/:credentialId')
  async oauthStatus(@Param('credentialId') credentialId: string) {
    // Stub: Return current credential OAuth status
    return { status: 'pending' };
  }

  @Post('oauth/revoke')
  @HttpCode(HttpStatus.OK)
  async oauthRevoke(@Body() body: { credentialId: string }) {
    // Stub: OAuth revocation
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
  async create(@Body() dto: CreateConnectorDto) {
    return this.connectorsService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateConnectorDto) {
    return this.connectorsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.connectorsService.remove(id);
  }
}
