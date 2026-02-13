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
import { LicensesService } from './licenses.service';
import { CreateLicenseDto } from './dto/create-license.dto';
import { UpdateLicenseDto } from './dto/update-license.dto';

@Controller('licenses')
export class LicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  /**
   * GET /api/licenses/expiring?accountId=...&days=30
   * Returns licenses expiring within the given window.
   * Must be declared before :id to avoid route conflicts.
   */
  @Get('expiring')
  async findExpiring(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
    @Query('days') days?: string,
  ) {
    return this.licensesService.findExpiring({
      accountId,
      enterpriseId,
      days: days ? parseInt(days, 10) : 30,
    });
  }

  @Get()
  async findAll(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.licensesService.findAll({ accountId, enterpriseId });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.licensesService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createLicenseDto: CreateLicenseDto) {
    return this.licensesService.create(createLicenseDto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateLicenseDto: UpdateLicenseDto,
  ) {
    return this.licensesService.update(id, updateLicenseDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.licensesService.remove(id);
  }
}
