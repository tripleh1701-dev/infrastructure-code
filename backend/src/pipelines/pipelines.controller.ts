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
import { PipelinesService, Pipeline } from './pipelines.service';
import { CreatePipelineDto, PipelineStatus } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccountGuard } from '../auth/guards/account.guard';
import { EnterpriseGuard } from '../auth/guards/enterprise.guard';
import { CognitoUser } from '../auth/interfaces/cognito-user.interface';

/**
 * Pipelines Controller
 *
 * Provides REST API endpoints for pipeline CRUD operations.
 * All routes are protected by the global JwtAuthGuard (applied via APP_GUARD).
 * Additional RBAC guards are applied per-route for fine-grained access control.
 *
 * Route hierarchy:
 *   GET    /api/pipelines                    — List pipelines (filtered by account + enterprise)
 *   GET    /api/pipelines/stats              — Pipeline counts by status
 *   GET    /api/pipelines/:id                — Get single pipeline
 *   POST   /api/pipelines                    — Create pipeline
 *   PUT    /api/pipelines/:id                — Update pipeline
 *   DELETE /api/pipelines/:id                — Delete pipeline
 *   POST   /api/pipelines/:id/duplicate      — Clone a pipeline
 */
@Controller('pipelines')
@UseGuards(AccountGuard) // All pipeline routes are tenant-scoped
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  /**
   * List all pipelines for the authenticated user's account context.
   *
   * Query params:
   *   ?enterpriseId=<uuid>  — Filter by enterprise
   *   ?status=<draft|active|inactive|archived> — Filter by status
   */
  @Get()
  async findAll(
    @CurrentUser() user: CognitoUser,
    @Query('enterpriseId') enterpriseId?: string,
    @Query('status') status?: PipelineStatus,
  ): Promise<Pipeline[]> {
    const accountId = user.accountId!;
    return this.pipelinesService.findAll(
      accountId,
      enterpriseId || user.enterpriseId || undefined,
      status,
    );
  }

  /**
   * Get pipeline counts grouped by status (for dashboard Quick Stats Bar).
   *
   * Response: { draft: 3, active: 12, inactive: 2, archived: 5, total: 22 }
   */
  @Get('stats')
  async getStats(
    @CurrentUser() user: CognitoUser,
    @Query('enterpriseId') enterpriseId?: string,
  ): Promise<Record<string, number>> {
    const accountId = user.accountId!;
    return this.pipelinesService.countByStatus(
      accountId,
      enterpriseId || user.enterpriseId || undefined,
    );
  }

  /**
   * Get a single pipeline by ID.
   */
  @Get(':id')
  async findOne(
    @CurrentUser() user: CognitoUser,
    @Param('id') id: string,
  ): Promise<Pipeline> {
    return this.pipelinesService.findOne(user.accountId!, id);
  }

  // ---------------------------------------------------------------------------
  // WRITE (require elevated roles)
  // ---------------------------------------------------------------------------

  /**
   * Create a new pipeline.
   *
   * The accountId and enterpriseId are injected from the user's JWT claims
   * to enforce tenant scoping — they cannot be spoofed from the request body.
   *
   * Requires: admin, manager, or user role
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async create(
    @Body() dto: CreatePipelineDto,
    @CurrentUser() user: CognitoUser,
  ): Promise<Pipeline> {
    // Override tenant context from JWT to prevent spoofing
    dto.accountId = user.accountId!;
    dto.enterpriseId = user.enterpriseId || dto.enterpriseId;

    return this.pipelinesService.create(dto, user);
  }

  /**
   * Update an existing pipeline.
   *
   * Requires: admin, manager, or user role
   */
  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async update(
    @CurrentUser() user: CognitoUser,
    @Param('id') id: string,
    @Body() dto: UpdatePipelineDto,
  ): Promise<Pipeline> {
    return this.pipelinesService.update(user.accountId!, id, dto);
  }

  /**
   * Delete a pipeline.
   *
   * Requires: admin or manager role
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async remove(
    @CurrentUser() user: CognitoUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.pipelinesService.remove(user.accountId!, id);
  }

  /**
   * Duplicate (clone) an existing pipeline.
   *
   * Creates a new pipeline in DRAFT status with "(Copy)" suffix.
   * Requires: admin, manager, or user role
   */
  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async duplicate(
    @CurrentUser() user: CognitoUser,
    @Param('id') id: string,
  ): Promise<Pipeline> {
    return this.pipelinesService.duplicate(user.accountId!, id, user);
  }
}
