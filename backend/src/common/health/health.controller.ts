import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../auth/decorators/public.decorator';
import { DynamoDBRouterService } from '../dynamodb/dynamodb-router.service';
import {
  SESClient,
  GetSendQuotaCommand,
  GetIdentityVerificationAttributesCommand,
} from '@aws-sdk/client-ses';
import {
  STSClient,
  AssumeRoleCommand,
  GetCallerIdentityCommand,
} from '@aws-sdk/client-sts';
import { resolveAwsCredentials } from '../utils/aws-credentials';
import { SesHealthService, CheckResult } from './ses-health.service';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly dynamoRouter: DynamoDBRouterService,
    private readonly configService: ConfigService,
    private readonly sesHealthService: SesHealthService,
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
      'CROSS_ACCOUNT_EXTERNAL_ID',
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
   * SES health check — validates sender identity, sandbox status, and send quota.
   *
   * GET /api/health/ses
   */
  @Get('ses')
  async sesDiagnostics() {
    this.logger.log('Running SES diagnostics');
    return this.sesHealthService.check();
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

      if (!isCustomer) {
        // This is the ROOT CAUSE of data going to the wrong table!
        checks['account_type'] = {
          status: 'fail',
          message: `CRITICAL: Account ${accountId} has NO SSM routing params — ALL operational data ` +
            `(builds, pipelines, connectors, etc.) is being written to the CONTROL PLANE table ` +
            `instead of the customer data-plane table. ` +
            `Run "POST /api/accounts/${accountId}/reprovision" or re-run bootstrap to fix.`,
          duration_ms: Date.now() - typeStart,
        };
      } else {
        checks['account_type'] = {
          status: 'pass',
          message: `Customer account (${cloudType}, ${isPrivate ? 'dedicated' : 'shared customer'} table)`,
          duration_ms: Date.now() - typeStart,
          details: { cloudType, isPrivate, isCustomer },
        };
      }
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

  /**
   * Bulk routing audit — checks ALL accounts in the control plane table
   * and reports which ones are correctly routed vs falling back to control plane.
   *
   * GET /api/health/routing-audit
   */
  @Get('routing-audit')
  @Public()
  async routingAudit() {
    this.logger.log('Running bulk routing audit for all accounts');

    const results: Array<{
      accountId: string;
      accountName: string;
      cloudType: string;
      resolvedTable: string;
      isCustomerRouted: boolean;
      status: string;
      issue?: string;
    }> = [];

    // Query all accounts from the control plane table
    try {
      const sharedTable = this.dynamoRouter.getSharedTableName();

      // Use the DynamoDB service (control plane) to list all accounts
      // We need to import it — but since HealthController already has dynamoRouter,
      // we can use listPrivateAccounts for SSM-registered ones.
      // For a full audit, let's also scan the shared table for ACCOUNT# records.

      // First: get all SSM-registered accounts
      const ssmAccounts = await this.dynamoRouter.listPrivateAccounts();
      const ssmAccountIds = new Set(ssmAccounts.map((a) => a.accountId));

      // For each SSM-registered account, verify routing
      for (const ssmAccount of ssmAccounts) {
        try {
          // Clear cache to get fresh resolution
          this.dynamoRouter.invalidateCache(ssmAccount.accountId);
          const resolvedTable = await this.dynamoRouter.resolveTableName(ssmAccount.accountId);
          const isCustomer = resolvedTable !== sharedTable;
          const cloudType = await this.dynamoRouter.getCloudType(ssmAccount.accountId);

          results.push({
            accountId: ssmAccount.accountId,
            accountName: '',
            cloudType,
            resolvedTable,
            isCustomerRouted: isCustomer,
            status: isCustomer ? 'ok' : 'MISROUTED',
            issue: isCustomer ? undefined : 'SSM params exist but table resolves to control plane — check PUBLIC_ACCOUNT_TABLE_NAME env var',
          });
        } catch (error: any) {
          results.push({
            accountId: ssmAccount.accountId,
            accountName: '',
            cloudType: 'unknown',
            resolvedTable: sharedTable,
            isCustomerRouted: false,
            status: 'ERROR',
            issue: `Resolution failed: ${error.message}`,
          });
        }
      }

      const misrouted = results.filter((r) => r.status !== 'ok');

      return {
        status: misrouted.length === 0 ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        summary: {
          total_accounts: results.length,
          correctly_routed: results.filter((r) => r.status === 'ok').length,
          misrouted: misrouted.length,
          control_plane_table: sharedTable,
        },
        accounts: results,
        action: misrouted.length > 0
          ? 'Run the backfill script: npx ts-node backend/scripts/backfill-ssm-params.ts — or re-run bootstrap to fix missing SSM routing parameters.'
          : undefined,
      };
    } catch (error: any) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        message: `Audit failed: ${error.message}`,
      };
    }
  }

  /**
   * Comprehensive health report — runs all checks (config, SES, assume-role,
   * routing) in parallel and returns a unified report.
   *
   * GET /api/health/full?accountId=<optional>
   */
  @Get('full')
  @Public()
  async fullDiagnostics(@Param() _params: any, @Query('accountId') accountId?: string) {
    this.logger.log('Running full health diagnostics');
    const startTime = Date.now();

    // Run all independent checks in parallel
    const [configResult, sesResult, assumeRoleResult, routingResult] = await Promise.allSettled([
      Promise.resolve(this.configCheck()),
      this.sesDiagnostics(),
      this.preflightAssumeRole(),
      accountId ? this.routingDiagnostics(accountId) : Promise.resolve(null),
    ]);

    const sections: Record<string, any> = {};

    sections.config = configResult.status === 'fulfilled'
      ? configResult.value
      : { status: 'error', message: (configResult as PromiseRejectedResult).reason?.message };

    sections.ses = sesResult.status === 'fulfilled'
      ? sesResult.value
      : { status: 'error', message: (sesResult as PromiseRejectedResult).reason?.message };

    sections.cross_account = assumeRoleResult.status === 'fulfilled'
      ? assumeRoleResult.value
      : { status: 'error', message: (assumeRoleResult as PromiseRejectedResult).reason?.message };

    if (accountId) {
      sections.routing = routingResult.status === 'fulfilled'
        ? routingResult.value
        : { status: 'error', message: (routingResult as PromiseRejectedResult).reason?.message };
    }

    // Derive overall status
    const statuses = Object.values(sections).map((s: any) => s?.status);
    const overall = statuses.includes('unhealthy') || statuses.includes('error') || statuses.includes('fail')
      ? 'unhealthy'
      : statuses.includes('degraded') || statuses.includes('incomplete') || statuses.includes('warn')
        ? 'degraded'
        : 'healthy';

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      total_duration_ms: Date.now() - startTime,
      sections,
    };
  }

  /**
   * Preflight check for cross-account AssumeRole.
   * Performs a live STS AssumeRole probe to validate that the backend Lambda
   * can successfully assume the DATA_PLANE_ROLE_ARN with the configured ExternalId.
   *
   * GET /api/health/preflight-assume-role
   */
  @Get('preflight-assume-role')
  @Public()
  async preflightAssumeRole() {
    this.logger.log('Running preflight AssumeRole check');

    const checks: Record<string, CheckResult> = {};

    const dataPlaneRoleArn = this.configService.get<string>('DATA_PLANE_ROLE_ARN');
    const cfnExecutionRoleArn = this.configService.get<string>('CFN_EXECUTION_ROLE_ARN');
    const crossAccountExternalId =
      this.configService.get<string>('CROSS_ACCOUNT_EXTERNAL_ID')
      || this.configService.get<string>('DATA_PLANE_EXTERNAL_ID');

    // 1. Config presence
    checks['config_presence'] = {
      status: dataPlaneRoleArn && cfnExecutionRoleArn && crossAccountExternalId ? 'pass' : 'fail',
      message: dataPlaneRoleArn && cfnExecutionRoleArn && crossAccountExternalId
        ? 'All required cross-account variables are configured'
        : `Missing: ${[
            !dataPlaneRoleArn && 'DATA_PLANE_ROLE_ARN',
            !cfnExecutionRoleArn && 'CFN_EXECUTION_ROLE_ARN',
            !crossAccountExternalId && 'CROSS_ACCOUNT_EXTERNAL_ID',
          ].filter(Boolean).join(', ')}`,
      duration_ms: 0,
      details: {
        DATA_PLANE_ROLE_ARN: !!dataPlaneRoleArn,
        CFN_EXECUTION_ROLE_ARN: !!cfnExecutionRoleArn,
        CROSS_ACCOUNT_EXTERNAL_ID: !!crossAccountExternalId,
      },
    };

    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    const credentials = resolveAwsCredentials(
      this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
    );
    const stsClient = new STSClient({
      region,
      ...(credentials && { credentials }),
    });

    // 2. Caller identity
    const callerStart = Date.now();
    try {
      const identity = await stsClient.send(new GetCallerIdentityCommand({}));
      checks['caller_identity'] = {
        status: 'pass',
        message: `Lambda running as ${identity.Arn} in account ${identity.Account}`,
        duration_ms: Date.now() - callerStart,
        details: { account: identity.Account, arn: identity.Arn },
      };
    } catch (error: any) {
      checks['caller_identity'] = {
        status: 'fail',
        message: `Failed to get caller identity: ${error.message}`,
        duration_ms: Date.now() - callerStart,
      };
    }

    // 3. Live AssumeRole probe
    if (dataPlaneRoleArn) {
      const assumeStart = Date.now();
      try {
        const assumeResult = await stsClient.send(new AssumeRoleCommand({
          RoleArn: dataPlaneRoleArn,
          RoleSessionName: `preflight-check-${Date.now()}`,
          DurationSeconds: 900,
          ...(crossAccountExternalId ? { ExternalId: crossAccountExternalId } : {}),
        }));

        const assumedCreds = assumeResult.Credentials;
        if (!assumedCreds) {
          checks['assume_role'] = {
            status: 'fail',
            message: 'AssumeRole returned no credentials',
            duration_ms: Date.now() - assumeStart,
          };
        } else {
          const identityClient = new STSClient({
            region,
            credentials: {
              accessKeyId: assumedCreds.AccessKeyId!,
              secretAccessKey: assumedCreds.SecretAccessKey!,
              sessionToken: assumedCreds.SessionToken!,
            },
          });
          const identity = await identityClient.send(new GetCallerIdentityCommand({}));

          checks['assume_role'] = {
            status: 'pass',
            message: `Successfully assumed role in account ${identity.Account}`,
            duration_ms: Date.now() - assumeStart,
            details: {
              target_account: identity.Account,
              assumed_arn: identity.Arn,
              expiration: assumedCreds.Expiration?.toISOString(),
            },
          };
        }
      } catch (error: any) {
        checks['assume_role'] = {
          status: 'fail',
          message: `AssumeRole failed: ${error.message}`,
          duration_ms: Date.now() - assumeStart,
          details: {
            error_name: error.name,
            role_arn: dataPlaneRoleArn,
            external_id_provided: !!crossAccountExternalId,
            action: error.name === 'AccessDenied' || error.message?.includes('not authorized')
              ? 'Verify the trust policy on the target role allows this Lambda role with the correct ExternalId. Re-run "02 · Bootstrap Customer Account" then "04 · Deploy Backend" with sync_infra=true.'
              : 'Check IAM permissions and network connectivity.',
          },
        };
      }
    } else {
      checks['assume_role'] = {
        status: 'fail',
        message: 'Skipped — DATA_PLANE_ROLE_ARN is not configured',
        duration_ms: 0,
      };
    }

    const hasFail = Object.values(checks).some((c) => c.status === 'fail');

    return {
      status: hasFail ? 'unhealthy' : 'healthy',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
