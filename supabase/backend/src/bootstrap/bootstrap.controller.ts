import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BootstrapService } from './bootstrap.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Bootstrap Controller
 * 
 * Exposes endpoints for Day-0 platform initialization.
 * These endpoints should be secured/disabled in production
 * after initial bootstrapping.
 */
@Controller('bootstrap')
export class BootstrapController {
  private readonly logger = new Logger(BootstrapController.name);

  constructor(private readonly bootstrapService: BootstrapService) {}

  /**
   * Execute Day-0 bootstrap
   * POST /api/bootstrap
   * 
   * SECURITY: Mark as @Public() for initial setup only.
   * In production, protect with admin-only access or disable entirely.
   */
  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async bootstrap() {
    this.logger.log('Bootstrap endpoint called');
    return this.bootstrapService.bootstrap();
  }

  /**
   * Get bootstrap status (check if already bootstrapped)
   * GET /api/bootstrap/status
   */
  @Public()
  @Get('status')
  async getStatus() {
    const ids = this.bootstrapService.getFixedIds();
    return {
      fixedIds: ids,
      message: 'Use POST /api/bootstrap to execute Day-0 setup',
    };
  }
}
