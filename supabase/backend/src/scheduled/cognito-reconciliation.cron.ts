// =============================================================================
// Cognito Reconciliation Cron Job
// =============================================================================
// Runs daily at 2:00 AM UTC to detect DynamoDB users missing a Cognito identity
// and provisions them automatically. Results are logged for audit purposes.
//
// Configuration (environment variables):
//   COGNITO_RECONCILIATION_ENABLED  – 'true' to activate (default: 'false')
//   COGNITO_RECONCILIATION_CRON     – cron expression override (default: '0 2 * * *')
//   COGNITO_RECONCILIATION_DRY_RUN  – 'true' for preview mode (default: 'false')
//
// Emits CloudWatch metrics under the application namespace:
//   ReconciliationRunCount, ReconciliationDuration, ReconciliationProvisioned,
//   ReconciliationFailed, ReconciliationSuccess, etc.
// =============================================================================

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { CloudWatchMetricsService } from '../common/metrics/cloudwatch-metrics.service';

@Injectable()
export class CognitoReconciliationCron implements OnModuleInit {
  private readonly logger = new Logger(CognitoReconciliationCron.name);
  private isRunning = false;

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly metricsService: CloudWatchMetricsService,
  ) {}

  /**
   * On startup, log the cron configuration and disable the job if the feature
   * flag is not set. This allows operators to opt-in explicitly.
   */
  onModuleInit() {
    const enabled = this.configService.get<string>('COGNITO_RECONCILIATION_ENABLED', 'false');
    const dryRun = this.configService.get<string>('COGNITO_RECONCILIATION_DRY_RUN', 'false');

    if (enabled !== 'true') {
      this.logger.log(
        'Cognito reconciliation cron is DISABLED. ' +
          'Set COGNITO_RECONCILIATION_ENABLED=true to activate.',
      );

      // Disable the default cron job registered by the decorator
      try {
        const job = this.schedulerRegistry.getCronJob('cognito-reconciliation');
        job.stop();
      } catch {
        // Job may not exist if schedule module hasn't registered it yet
      }
      return;
    }

    this.logger.log(
      `Cognito reconciliation cron is ENABLED (dryRun=${dryRun}). ` +
        'Runs daily at 02:00 UTC.',
    );
  }

  /**
   * Daily reconciliation job — scans all users for missing cognitoSub values
   * and provisions them in Cognito. Uses a re-entrancy guard to prevent
   * overlapping runs if a previous execution is still in progress.
   *
   * Emits CloudWatch metrics at the end of every run for dashboard/alarm use.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'cognito-reconciliation',
    timeZone: 'UTC',
  })
  async handleReconciliation(): Promise<void> {
    const enabled = this.configService.get<string>('COGNITO_RECONCILIATION_ENABLED', 'false');
    if (enabled !== 'true') {
      return;
    }

    if (this.isRunning) {
      this.logger.warn('Reconciliation already in progress — skipping this run.');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const dryRun =
        this.configService.get<string>('COGNITO_RECONCILIATION_DRY_RUN', 'false') === 'true';

      this.logger.log(`=== Cognito Reconciliation Started (dryRun=${dryRun}) ===`);

      const result = await this.usersService.reconcileCognitoUsers({
        dryRun,
        includeInactive: false,
      });

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `=== Cognito Reconciliation Complete ===\n` +
          `  Duration:      ${durationMs}ms\n` +
          `  Total scanned: ${result.totalScanned}\n` +
          `  Missing sub:   ${result.missingCognitoSub}\n` +
          `  Provisioned:   ${result.provisioned}\n` +
          `  Updated:       ${result.updated}\n` +
          `  Skipped:       ${result.skipped}\n` +
          `  Failed:        ${result.failed}`,
      );

      // Log failures individually for easy triage
      const failures = result.details.filter((d: any) => d.status === 'failed');
      if (failures.length > 0) {
        this.logger.error(
          `Reconciliation failures:\n` +
            failures
              .map((f: any) => `  • ${f.email} (${f.userId}): ${f.reason}`)
              .join('\n'),
        );
      }

      // ── Emit CloudWatch metrics ─────────────────────────────────────────
      await this.metricsService.emitReconciliationMetrics(result, durationMs);
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      this.logger.error(
        `Cognito reconciliation cron failed: ${error.message}`,
        error.stack,
      );

      // Emit failure metrics even on unhandled errors
      await this.metricsService.emitReconciliationMetrics(
        {
          totalScanned: 0,
          missingCognitoSub: 0,
          provisioned: 0,
          updated: 0,
          skipped: 0,
          failed: 1,
          dryRun: false,
        },
        durationMs,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
