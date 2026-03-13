import { Controller, Get, Param, Logger } from '@nestjs/common';
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

interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration_ms: number;
  details?: Record<string, any>;
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
    const region = this.configService.get<string>('AWS_REGION') || process.env.AWS_REGION || 'us-east-1';
    const senderEmail = this.configService.get<string>('SES_SENDER_EMAIL') || process.env.SES_SENDER_EMAIL || 'noreply@example.com';
    const notificationsEnabled = (this.configService.get<string>('CREDENTIAL_NOTIFICATION_ENABLED') || process.env.CREDENTIAL_NOTIFICATION_ENABLED) === 'true';

    const sesClient = new SESClient({ region });
    const checks: Record<string, CheckResult> = {};

    // 1. Check if notifications are enabled
    checks['notifications_enabled'] = {
      status: notificationsEnabled ? 'pass' : 'warn',
      message: notificationsEnabled
        ? 'Credential notifications are enabled'
        : 'CREDENTIAL_NOTIFICATION_ENABLED is not set to "true" — emails will be skipped',
      duration_ms: 0,
    };

    // 2. Sender identity verification
    const verifyStart = Date.now();
    try {
      const result = await sesClient.send(
        new GetIdentityVerificationAttributesCommand({
          Identities: [senderEmail],
        }),
      );
      const attr = result.VerificationAttributes?.[senderEmail];
      const verificationStatus = attr?.VerificationStatus || 'NotFound';
      const isVerified = verificationStatus === 'Success';

      checks['sender_verification'] = {
        status: isVerified ? 'pass' : 'fail',
        message: isVerified
          ? `Sender "${senderEmail}" is verified in SES`
          : `Sender "${senderEmail}" is NOT verified (status: ${verificationStatus}). Emails will fail.`,
        duration_ms: Date.now() - verifyStart,
        details: {
          sender: senderEmail,
          verification_status: verificationStatus,
          action: isVerified
            ? null
            : 'Verify this email address or domain in the AWS SES console, or update SES_SENDER_EMAIL to a verified identity.',
        },
      };
    } catch (error: any) {
      checks['sender_verification'] = {
        status: 'fail',
        message: `Failed to check sender verification: ${error.message}`,
        duration_ms: Date.now() - verifyStart,
        details: {
          sender: senderEmail,
          error: error.name,
          action: 'Check IAM permissions for ses:GetIdentityVerificationAttributes',
        },
      };
    }

    // 3. SES account status (quota-based check)
    const accountStart = Date.now();
    try {
      const quota = await sesClient.send(new GetSendQuotaCommand({}));
      const sendingEnabled = (quota.Max24HourSend ?? 0) > 0;
      const isSandbox = (quota.Max24HourSend ?? 0) <= 200;

      checks['account_status'] = {
        status: sendingEnabled ? (isSandbox ? 'warn' : 'pass') : 'fail',
        message: !sendingEnabled
          ? 'SES sending is DISABLED on this account. No emails can be sent.'
          : isSandbox
            ? 'SES account is in SANDBOX mode — emails can only be sent to verified addresses.'
            : 'SES account is in PRODUCTION mode — emails can be sent to any address.',
        duration_ms: Date.now() - accountStart,
        details: {
          sending_enabled: sendingEnabled,
          enforcement_status: isSandbox ? 'SANDBOX' : 'PRODUCTION',
          max_24hr_send: quota.Max24HourSend,
          max_send_rate: quota.MaxSendRate,
          sent_last_24hr: quota.SentLast24Hours,
          action: isSandbox
            ? 'Request production access in the AWS SES console to send emails to unverified addresses.'
            : null,
        },
      };
    } catch (error: any) {
      checks['account_status'] = {
        status: 'fail',
        message: `Failed to retrieve SES account status: ${error.message}`,
        duration_ms: Date.now() - accountStart,
        details: {
          error: error.name,
          action: 'Check IAM permissions for ses:GetAccount',
        },
      };
    }

    // 4. Config completeness
    const isDefaultSender = senderEmail === 'noreply@example.com';
    checks['config_completeness'] = {
      status: isDefaultSender ? 'fail' : 'pass',
      message: isDefaultSender
        ? 'SES_SENDER_EMAIL is still set to default "noreply@example.com" — this will NOT work.'
        : `SES_SENDER_EMAIL is configured as "${senderEmail}"`,
      duration_ms: 0,
      details: {
        action: isDefaultSender
          ? 'Set SES_SENDER_EMAIL to a verified email address or domain in your environment variables.'
          : null,
      },
    };

    const hasFail = Object.values(checks).some((c) => c.status === 'fail');
    const hasWarn = Object.values(checks).some((c) => c.status === 'warn');

    return {
      status: hasFail ? 'unhealthy' : hasWarn ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      region,
      checks,
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
