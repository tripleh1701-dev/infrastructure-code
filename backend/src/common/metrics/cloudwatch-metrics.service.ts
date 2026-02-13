import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CloudWatchClient,
  PutMetricDataCommand,
  MetricDatum,
  StandardUnit,
} from '@aws-sdk/client-cloudwatch';

/**
 * Metric dimension key-value pair
 */
export interface MetricDimension {
  Name: string;
  Value: string;
}

/**
 * Options for a single metric data point
 */
export interface MetricOptions {
  metricName: string;
  value: number;
  unit?: StandardUnit;
  dimensions?: MetricDimension[];
  timestamp?: Date;
}

/**
 * CloudWatchMetricsService
 *
 * Emits custom application metrics to CloudWatch under a configurable
 * namespace. Designed for operational visibility into background jobs
 * (reconciliation, provisioning) and business-level counters.
 *
 * Key design decisions:
 *  - All emissions are fire-and-forget (never throw/block callers)
 *  - Metrics are batched per putMetricData call (up to 1000 per API call)
 *  - Environment is always added as a dimension for cross-env dashboards
 *  - Gracefully degrades when CloudWatch is not configured (local dev)
 */
@Injectable()
export class CloudWatchMetricsService {
  private readonly logger = new Logger(CloudWatchMetricsService.name);
  private client: CloudWatchClient | null = null;

  private readonly namespace: string;
  private readonly environment: string;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isEnabled =
      this.configService.get('CLOUDWATCH_METRICS_ENABLED', 'true') === 'true';

    const projectName = this.configService.get('PROJECT_NAME', 'license-portal');
    this.environment = this.configService.get('NODE_ENV', 'dev');
    this.namespace = this.configService.get(
      'CLOUDWATCH_METRICS_NAMESPACE',
      `${projectName}/Application`,
    );

    if (this.isEnabled) {
      const region = this.configService.get('AWS_REGION', 'us-east-1');
      this.client = new CloudWatchClient({ region });
      this.logger.log(
        `CloudWatch metrics enabled (namespace: ${this.namespace}, env: ${this.environment})`,
      );
    } else {
      this.logger.log('CloudWatch metrics disabled');
    }
  }

  // ─── SINGLE METRIC ──────────────────────────────────────────────────────

  /**
   * Emit a single metric data point.
   * Never throws — failures are logged silently.
   */
  async putMetric(options: MetricOptions): Promise<void> {
    return this.putMetrics([options]);
  }

  // ─── BATCH METRICS ──────────────────────────────────────────────────────

  /**
   * Emit multiple metrics in a single API call (up to 1000).
   * Automatically adds the Environment dimension to all data points.
   */
  async putMetrics(metrics: MetricOptions[]): Promise<void> {
    if (!this.isEnabled || !this.client || metrics.length === 0) {
      return;
    }

    const metricData: MetricDatum[] = metrics.map((m) => ({
      MetricName: m.metricName,
      Value: m.value,
      Unit: m.unit || StandardUnit.Count,
      Timestamp: m.timestamp || new Date(),
      Dimensions: [
        { Name: 'Environment', Value: this.environment },
        ...(m.dimensions || []),
      ],
    }));

    // CloudWatch accepts max 1000 metric data points per call
    const chunks = this.chunk(metricData, 1000);

    for (const batch of chunks) {
      try {
        await this.client.send(
          new PutMetricDataCommand({
            Namespace: this.namespace,
            MetricData: batch,
          }),
        );
        this.logger.debug(
          `Emitted ${batch.length} metric(s) to ${this.namespace}`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to emit CloudWatch metrics: ${error.message}`,
        );
        // Never throw — metrics emission must not break business logic
      }
    }
  }

  // ─── CONVENIENCE: RECONCILIATION METRICS ────────────────────────────────

  /**
   * Emit all metrics from a Cognito reconciliation run in one batch.
   */
  async emitReconciliationMetrics(result: {
    totalScanned: number;
    missingCognitoSub: number;
    provisioned: number;
    updated: number;
    skipped: number;
    failed: number;
    dryRun: boolean;
  }, durationMs: number): Promise<void> {
    const dimensions: MetricDimension[] = [
      { Name: 'JobName', Value: 'CognitoReconciliation' },
    ];

    const metrics: MetricOptions[] = [
      { metricName: 'ReconciliationRunCount', value: 1, dimensions },
      { metricName: 'ReconciliationDuration', value: durationMs, unit: StandardUnit.Milliseconds, dimensions },
      { metricName: 'ReconciliationUsersScanned', value: result.totalScanned, dimensions },
      { metricName: 'ReconciliationMissingIdentity', value: result.missingCognitoSub, dimensions },
      { metricName: 'ReconciliationProvisioned', value: result.provisioned, dimensions },
      { metricName: 'ReconciliationUpdated', value: result.updated, dimensions },
      { metricName: 'ReconciliationSkipped', value: result.skipped, dimensions },
      { metricName: 'ReconciliationFailed', value: result.failed, dimensions },
    ];

    // Emit a binary success/failure metric for alarm threshold simplicity
    const success = result.failed === 0 ? 1 : 0;
    metrics.push({
      metricName: 'ReconciliationSuccess',
      value: success,
      dimensions,
    });

    if (result.dryRun) {
      metrics.push({
        metricName: 'ReconciliationDryRun',
        value: 1,
        dimensions,
      });
    }

    await this.putMetrics(metrics);

    this.logger.log(
      `Reconciliation metrics emitted: provisioned=${result.provisioned}, ` +
        `failed=${result.failed}, duration=${durationMs}ms`,
    );
  }

  // ─── CONVENIENCE: PROVISIONING LIFECYCLE METRICS ───────────────────────

  /**
   * Emit metrics when an account provisioning operation completes.
   *
   * Tracks:
   *  - ProvisioningRunCount        – Total provisioning attempts
   *  - ProvisioningDuration        – End-to-end duration in ms
   *  - ProvisioningSuccess         – Binary: 1 on success, 0 on failure
   *  - ProvisioningFailure         – Binary: 1 on failure, 0 on success
   *  - ProvisioningByCloudType     – Count dimensioned by cloud type
   *  - ProvisioningResourceCount   – Number of AWS resources created
   */
  async emitProvisioningMetrics(params: {
    accountId: string;
    cloudType: 'public' | 'private';
    success: boolean;
    durationMs: number;
    resourceCount?: number;
    errorCode?: string;
  }): Promise<void> {
    const baseDimensions: MetricDimension[] = [
      { Name: 'Operation', Value: 'AccountProvisioning' },
    ];

    const cloudTypeDimensions: MetricDimension[] = [
      ...baseDimensions,
      { Name: 'CloudType', Value: params.cloudType },
    ];

    const metrics: MetricOptions[] = [
      // Overall run count
      { metricName: 'ProvisioningRunCount', value: 1, dimensions: baseDimensions },

      // Duration in milliseconds
      {
        metricName: 'ProvisioningDuration',
        value: params.durationMs,
        unit: StandardUnit.Milliseconds,
        dimensions: cloudTypeDimensions,
      },

      // Binary success/failure for alarm simplicity
      {
        metricName: 'ProvisioningSuccess',
        value: params.success ? 1 : 0,
        dimensions: baseDimensions,
      },
      {
        metricName: 'ProvisioningFailure',
        value: params.success ? 0 : 1,
        dimensions: baseDimensions,
      },

      // Count by cloud type for trend analysis
      {
        metricName: 'ProvisioningByCloudType',
        value: 1,
        dimensions: cloudTypeDimensions,
      },
    ];

    // Resource count (only on success)
    if (params.success && params.resourceCount !== undefined) {
      metrics.push({
        metricName: 'ProvisioningResourceCount',
        value: params.resourceCount,
        dimensions: cloudTypeDimensions,
      });
    }

    // Error code dimension for failure drill-down
    if (!params.success && params.errorCode) {
      metrics.push({
        metricName: 'ProvisioningFailureByError',
        value: 1,
        dimensions: [
          ...baseDimensions,
          { Name: 'ErrorCode', Value: params.errorCode },
        ],
      });
    }

    await this.putMetrics(metrics);

    this.logger.log(
      `Provisioning metrics emitted: account=${params.accountId}, ` +
        `cloudType=${params.cloudType}, success=${params.success}, ` +
        `duration=${params.durationMs}ms`,
    );
  }

  /**
   * Emit metrics when an account deprovisioning operation completes.
   *
   * Tracks:
   *  - DeprovisioningRunCount   – Total deprovisioning attempts
   *  - DeprovisioningDuration   – End-to-end duration in ms
   *  - DeprovisioningSuccess    – Binary success flag
   *  - DeprovisioningFailure    – Binary failure flag
   */
  async emitDeprovisioningMetrics(params: {
    accountId: string;
    cloudType: 'public' | 'private';
    success: boolean;
    durationMs: number;
    errorCode?: string;
  }): Promise<void> {
    const baseDimensions: MetricDimension[] = [
      { Name: 'Operation', Value: 'AccountDeprovisioning' },
    ];

    const cloudTypeDimensions: MetricDimension[] = [
      ...baseDimensions,
      { Name: 'CloudType', Value: params.cloudType },
    ];

    const metrics: MetricOptions[] = [
      { metricName: 'DeprovisioningRunCount', value: 1, dimensions: baseDimensions },
      {
        metricName: 'DeprovisioningDuration',
        value: params.durationMs,
        unit: StandardUnit.Milliseconds,
        dimensions: cloudTypeDimensions,
      },
      {
        metricName: 'DeprovisioningSuccess',
        value: params.success ? 1 : 0,
        dimensions: baseDimensions,
      },
      {
        metricName: 'DeprovisioningFailure',
        value: params.success ? 0 : 1,
        dimensions: baseDimensions,
      },
    ];

    if (!params.success && params.errorCode) {
      metrics.push({
        metricName: 'DeprovisioningFailureByError',
        value: 1,
        dimensions: [
          ...baseDimensions,
          { Name: 'ErrorCode', Value: params.errorCode },
        ],
      });
    }

    await this.putMetrics(metrics);

    this.logger.log(
      `Deprovisioning metrics emitted: account=${params.accountId}, ` +
        `success=${params.success}, duration=${params.durationMs}ms`,
    );
  }

  // ─── HELPERS ────────────────────────────────────────────────────────────

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get current configuration (for debugging)
   */
  getConfig() {
    return {
      enabled: this.isEnabled,
      namespace: this.namespace,
      environment: this.environment,
    };
  }
}
