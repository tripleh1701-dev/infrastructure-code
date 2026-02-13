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
} from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';

@Controller('credentials')
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Get()
  async findAll(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.credentialsService.findAll(accountId, enterpriseId);
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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.credentialsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCredentialDto) {
    return this.credentialsService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCredentialDto) {
    return this.credentialsService.update(id, dto);
  }

  @Patch(':id')
  async patch(@Param('id') id: string, @Body() dto: UpdateCredentialDto) {
    return this.credentialsService.update(id, dto);
  }

  @Post(':id/rotate')
  async rotate(
    @Param('id') id: string,
    @Body() body: { credentials: Record<string, any> },
  ) {
    return this.credentialsService.rotate(id, body.credentials);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.credentialsService.remove(id);
  }
}
