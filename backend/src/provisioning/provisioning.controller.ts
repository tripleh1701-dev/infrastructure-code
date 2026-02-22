import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';
import { CreateProvisioningDto } from './dto/create-provisioning.dto';
import { ProvisioningJobDto, ProvisioningStatusDto } from './dto/provisioning-status.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * Provisioning Controller
 * 
 * Handles infrastructure provisioning for accounts.
 * - POST /api/provisioning - Start provisioning for an account
 * - GET /api/provisioning - List all active provisioning jobs
 * - GET /api/provisioning/:accountId/status - Get provisioning status for an account
 * - DELETE /api/provisioning/:accountId - Deprovision an account
 */
@Controller('provisioning')
@UseGuards(RolesGuard)
export class ProvisioningController {
  constructor(private readonly provisioningService: ProvisioningService) {}

  /**
   * Start provisioning infrastructure for an account
   * 
   * @param dto - Provisioning configuration
   * @returns The created provisioning job
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'super_admin')
  async startProvisioning(
    @Body() dto: CreateProvisioningDto,
  ): Promise<ProvisioningJobDto> {
    return this.provisioningService.startProvisioning(dto);
  }

  /**
   * Get all active provisioning jobs
   */
  @Get()
  @Roles('admin', 'super_admin', 'viewer')
  async getActiveJobs(): Promise<ProvisioningJobDto[]> {
    return this.provisioningService.getActiveJobs();
  }

  /**
   * Get provisioning status for a specific account
   */
  @Get(':accountId/status')
  @Roles('admin', 'super_admin', 'viewer')
  async getStatus(
    @Param('accountId') accountId: string,
  ): Promise<ProvisioningStatusDto> {
    return this.provisioningService.getProvisioningStatus(accountId);
  }

  /**
   * Deprovision an account (delete infrastructure)
   */
  @Delete(':accountId')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'super_admin')
  async deprovision(
    @Param('accountId') accountId: string,
  ): Promise<{ message: string }> {
    return this.provisioningService.deprovision(accountId);
  }
}
