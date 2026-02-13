import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  NotificationAuditService,
  NotificationDeliveryStatus,
  AuditQueryResult,
  NotificationAuditEntry,
} from './notification-audit.service';

/**
 * NotificationAuditController
 *
 * Exposes read-only REST endpoints for querying the notification audit log.
 * All endpoints require authentication and super_admin or admin role.
 *
 * Routes:
 *   GET /api/notification-audit                – List all audit entries (paginated)
 *   GET /api/notification-audit/summary        – Get aggregate statistics
 *   GET /api/notification-audit/status/:status  – Filter by delivery status
 *   GET /api/notification-audit/account/:id     – Filter by account (tenant-scoped)
 *   GET /api/notification-audit/:id             – Get single entry by ID
 */
@Controller('notification-audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
export class NotificationAuditController {
  constructor(
    private readonly auditService: NotificationAuditService,
  ) {}

  /**
   * GET /api/notification-audit
   *
   * List all notification audit entries with optional filters.
   *
   * Query params:
   *   - recipientEmail   (string)  Filter by recipient
   *   - deliveryStatus   (string)  Filter by status: sent | failed | skipped
   *   - startDate        (string)  ISO-8601 date range start
   *   - endDate          (string)  ISO-8601 date range end
   *   - limit            (number)  Max items to return (default 100)
   */
  @Get()
  async findAll(
    @Query('recipientEmail') recipientEmail?: string,
    @Query('deliveryStatus') deliveryStatus?: NotificationDeliveryStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ): Promise<AuditQueryResult> {
    return this.auditService.findAll({
      recipientEmail,
      deliveryStatus,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * GET /api/notification-audit/summary
   *
   * Returns aggregate counts of sent, failed, and skipped notifications.
   * Optionally scoped to a specific account.
   */
  @Get('summary')
  async getSummary(
    @Query('accountId') accountId?: string,
  ): Promise<{
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    lastSentAt?: string;
    lastFailedAt?: string;
  }> {
    return this.auditService.getSummary(accountId);
  }

  /**
   * GET /api/notification-audit/status/:status
   *
   * Query audit entries filtered by delivery status.
   */
  @Get('status/:status')
  async findByStatus(
    @Param('status') status: NotificationDeliveryStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ): Promise<AuditQueryResult> {
    return this.auditService.findByStatus(status, {
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * GET /api/notification-audit/account/:accountId
   *
   * Query audit entries scoped to a specific account (tenant isolation).
   */
  @Get('account/:accountId')
  async findByAccount(
    @Param('accountId') accountId: string,
    @Query('recipientEmail') recipientEmail?: string,
    @Query('deliveryStatus') deliveryStatus?: NotificationDeliveryStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ): Promise<AuditQueryResult> {
    return this.auditService.findByAccount(accountId, {
      recipientEmail,
      deliveryStatus,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * GET /api/notification-audit/:id
   *
   * Get a single audit entry by its unique ID.
   */
  @Get(':id')
  async findById(
    @Param('id') id: string,
  ): Promise<NotificationAuditEntry | null> {
    return this.auditService.findById(id);
  }
}
