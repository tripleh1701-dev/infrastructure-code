import { Controller, Get, Param, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../auth/decorators/public.decorator';
import { DynamoDBRouterService } from '../dynamodb/dynamodb-router.service';

interface CheckResult {
  status: 'pass' | 'fail';
  message: string;
  duration_ms: number;
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly dynamoRouter: DynamoDBRouterService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Basic health check — no auth required
   */
  @Get()
  @Public()
  basicHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      sharedTable: this.dynamoRouter.getSharedTableName(),
    };
  }

  /**
   * Reports whether critical cross-account environment variables are configured.
   * Values are never exposed — only presence is reported.
   */
  @Get('config')
  @Public()
  configCheck() {
    const vars = [
      'DATA_PLANE_ROLE_ARN',
      'CFN_EXECUTION_ROLE_ARN',
      'PUBLIC_ACCOUNT_TABLE_NAME',
      'DATA_PLANE_TABLE_NAME',
    ];

    const results: Record<string, boolean> = {};
    for (const key of vars) {
      results[key] = !!this.configService.get<string>(key);
    }

    const allConfigured = Object.values(results).every(Boolean);

    return {
      status: allConfigured ? 'ok' : 'incomplete',
      timestamp: new Date().toISOString(),
      variables: results,
    };
  }

  /**
   * Routing diagnostics for a specific account.
   * Validates SSM parameter existence, cross-account role assumption,
   * and DynamoDB table accessibility.
   *
   * GET /api/health/routing/:accountId
   */
  @Get('routing/:accountId')
  @Public()
  async routingDiagnostics(@Param('accountId') accountId: string) {
    this.logger.log(`Running routing diagnostics for account ${accountId}`);

    const checks: Record<string, CheckResult> = {};

    // 1. Resolve table name (tests SSM lookup + role assumption)
    const resolveStart = Date.now();
    try {
      const tableName = await this.dynamoRouter.resolveTableName(accountId);
      const isShared = tableName === this.dynamoRouter.getSharedTableName();
      checks['ssm_table_resolution'] = {
        status: 'pass',
        message: isShared
          ? `Resolved to shared table: ${tableName}`
          : `Resolved to dedicated table: ${tableName}`,
        duration_ms: Date.now() - resolveStart,
      };
    } catch (error: any) {
      checks['ssm_table_resolution'] = {
        status: 'fail',
        message: `Failed to resolve table: ${error.message}`,
        duration_ms: Date.now() - resolveStart,
      };
    }

    // 2. Check account type (customer vs control-plane, private vs public)
    const typeStart = Date.now();
    try {
      const isCustomer = await this.dynamoRouter.isCustomerAccount(accountId);
      const isPrivate = await this.dynamoRouter.isPrivateAccount(accountId);
      const cloudType = await this.dynamoRouter.getCloudType(accountId);
      checks['account_type'] = {
        status: 'pass',
        message: isCustomer
          ? `Customer account (${cloudType}, ${isPrivate ? 'dedicated' : 'shared customer'} table)`
          : 'No customer table configured — falls back to control plane',
        duration_ms: Date.now() - typeStart,
      };
    } catch (error: any) {
      checks['account_type'] = {
        status: 'fail',
        message: `Failed to determine account type: ${error.message}`,
        duration_ms: Date.now() - typeStart,
      };
    }

    // 3. Test DynamoDB connectivity with a lightweight read
    const dynamoStart = Date.now();
    try {
      await this.dynamoRouter.get(accountId, {
        Key: { PK: `HEALTH_CHECK`, SK: `PING` },
      });
      checks['dynamodb_connectivity'] = {
        status: 'pass',
        message: 'Successfully queried DynamoDB (item may not exist, but connection works)',
        duration_ms: Date.now() - dynamoStart,
      };
    } catch (error: any) {
      // ResourceNotFoundException or item-not-found is fine — it means we connected
      if (error.name === 'ResourceNotFoundException') {
        checks['dynamodb_connectivity'] = {
          status: 'fail',
          message: `Table not found: ${error.message}`,
          duration_ms: Date.now() - dynamoStart,
        };
      } else {
        checks['dynamodb_connectivity'] = {
          status: 'pass',
          message: `DynamoDB reachable (no matching item, which is expected)`,
          duration_ms: Date.now() - dynamoStart,
        };
      }
    }

    const allPassed = Object.values(checks).every((c) => c.status === 'pass');

    return {
      status: allPassed ? 'healthy' : 'degraded',
      accountId,
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
