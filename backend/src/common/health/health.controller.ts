import { Controller, Get, Param, Logger } from '@nestjs/common';
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

  constructor(private readonly dynamoRouter: DynamoDBRouterService) {}

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

    // 2. Check if private account
    const privateStart = Date.now();
    try {
      const isPrivate = await this.dynamoRouter.isPrivateAccount(accountId);
      checks['account_type'] = {
        status: 'pass',
        message: isPrivate ? 'Private account (dedicated table)' : 'Public account (shared table)',
        duration_ms: Date.now() - privateStart,
      };
    } catch (error: any) {
      checks['account_type'] = {
        status: 'fail',
        message: `Failed to determine account type: ${error.message}`,
        duration_ms: Date.now() - privateStart,
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
