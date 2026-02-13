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
  ): Promise<{ data: ProvisioningJobDto; error: null }> {
    const job = await this.provisioningService.startProvisioning(dto);
    return { data: job, error: null };
  }

  /**
   * Get all active provisioning jobs
   * 
   * @returns List of active provisioning jobs
   */
  @Get()
  @Roles('admin', 'super_admin', 'viewer')
  async getActiveJobs(): Promise<{ data: ProvisioningJobDto[]; error: null }> {
    const jobs = await this.provisioningService.getActiveJobs();
    return { data: jobs, error: null };
  }

  /**
   * Get provisioning status for a specific account
   * 
   * @param accountId - The account ID
   * @returns The provisioning status
   */
  @Get(':accountId/status')
  @Roles('admin', 'super_admin', 'viewer')
  async getStatus(
    @Param('accountId') accountId: string,
  ): Promise<{ data: ProvisioningStatusDto; error: null }> {
    const status = await this.provisioningService.getProvisioningStatus(accountId);
    return { data: status, error: null };
  }

  /**
   * Deprovision an account (delete infrastructure)
   * 
   * @param accountId - The account ID to deprovision
   * @returns Success message
   */
  @Delete(':accountId')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'super_admin')
  async deprovision(
    @Param('accountId') accountId: string,
  ): Promise<{ data: { message: string }; error: null }> {
    const result = await this.provisioningService.deprovision(accountId);
    return { data: result, error: null };
  }
}
