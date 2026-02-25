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
import { EnvironmentsService } from './environments.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';
import { AccountGuard } from '../auth/guards/account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('environments')
@UseGuards(AccountGuard)
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Get()
  async findAll(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.environmentsService.findAll(accountId, enterpriseId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.environmentsService.findOne(id, accountId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async create(@Body() dto: CreateEnvironmentDto) {
    return this.environmentsService.create(dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEnvironmentDto,
    @Query('accountId') accountId?: string,
  ) {
    return this.environmentsService.update(id, dto, accountId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async remove(
    @Param('id') id: string,
    @Query('accountId') accountId?: string,
  ) {
    await this.environmentsService.remove(id, accountId);
  }
}
