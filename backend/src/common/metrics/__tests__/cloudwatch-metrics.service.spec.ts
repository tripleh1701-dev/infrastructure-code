import { CloudWatchMetricsService } from '../cloudwatch-metrics.service';
import { StandardUnit } from '@aws-sdk/client-cloudwatch';

// ── Mock NestJS ─────────────────────────────────────────────────────────
jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  return {
    ...actual,
    Logger: jest.fn().mockImplementation(() => ({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    Injectable: () => (target: any) => target,
  };
});

// ── Mock CloudWatch SDK ─────────────────────────────────────────────────
const mockSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-cloudwatch', () => {
  const actual = jest.requireActual('@aws-sdk/client-cloudwatch');
  return {
    ...actual,
    CloudWatchClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
    PutMetricDataCommand: jest.fn().mockImplementation((input: any) => ({ input })),
  };
});

const mockConfigService = {
  get: jest.fn((key: string, defaultVal?: string) => {
    const config: Record<string, string> = {
      CLOUDWATCH_METRICS_ENABLED: 'true',
      PROJECT_NAME: 'test-project',
      NODE_ENV: 'test',
      AWS_REGION: 'us-east-1',
    };
    return config[key] ?? defaultVal;
  }),
};

function createService(enabled = true): CloudWatchMetricsService {
  if (!enabled) {
    mockConfigService.get.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'CLOUDWATCH_METRICS_ENABLED') return 'false';
      return defaultVal;
    });
  }
  return new CloudWatchMetricsService(mockConfigService as any);
}

describe('CloudWatchMetricsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigService.get.mockImplementation((key: string, defaultVal?: string) => {
      const config: Record<string, string> = {
        CLOUDWATCH_METRICS_ENABLED: 'true',
        PROJECT_NAME: 'test-project',
        NODE_ENV: 'test',
        AWS_REGION: 'us-east-1',
      };
      return config[key] ?? defaultVal;
    });
  });

  // ── Configuration ──────────────────────────────────────────────────

  it('reports enabled config', () => {
    const service = createService();
    const config = service.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.namespace).toBe('test-project/Application');
    expect(config.environment).toBe('test');
  });

  it('reports disabled config', () => {
    const service = createService(false);
    expect(service.getConfig().enabled).toBe(false);
  });

  // ── putMetric / putMetrics ─────────────────────────────────────────

  it('sends a single metric via putMetric', async () => {
    const service = createService();
    await service.putMetric({ metricName: 'TestMetric', value: 42 });

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', async () => {
    const service = createService(false);
    await service.putMetric({ metricName: 'TestMetric', value: 1 });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does nothing for empty metrics array', async () => {
    const service = createService();
    await service.putMetrics([]);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('adds Environment dimension to every metric', async () => {
    const { PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
    const service = createService();
    await service.putMetric({ metricName: 'X', value: 1 });

    const input = PutMetricDataCommand.mock.calls[0][0];
    expect(input.MetricData[0].Dimensions).toContainEqual({
      Name: 'Environment',
      Value: 'test',
    });
  });

  it('does not throw when CloudWatch send fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('CW down'));
    const service = createService();
    await expect(service.putMetric({ metricName: 'X', value: 1 })).resolves.toBeUndefined();
  });

  // ── emitReconciliationMetrics ──────────────────────────────────────

  it('emits reconciliation metrics batch', async () => {
    const { PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
    const service = createService();
    await service.emitReconciliationMetrics(
      {
        totalScanned: 100,
        missingCognitoSub: 5,
        provisioned: 3,
        updated: 1,
        skipped: 1,
        failed: 0,
        dryRun: false,
      },
      1500,
    );

    expect(mockSend).toHaveBeenCalledTimes(1);
    const input = PutMetricDataCommand.mock.calls[0][0];
    const metricNames = input.MetricData.map((d: any) => d.MetricName);
    expect(metricNames).toContain('ReconciliationRunCount');
    expect(metricNames).toContain('ReconciliationDuration');
    expect(metricNames).toContain('ReconciliationSuccess');
    // dryRun=false → no DryRun metric
    expect(metricNames).not.toContain('ReconciliationDryRun');
  });

  it('includes DryRun metric when dryRun=true', async () => {
    const { PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
    const service = createService();
    await service.emitReconciliationMetrics(
      { totalScanned: 1, missingCognitoSub: 0, provisioned: 0, updated: 0, skipped: 0, failed: 0, dryRun: true },
      10,
    );

    const input = PutMetricDataCommand.mock.calls[0][0];
    const metricNames = input.MetricData.map((d: any) => d.MetricName);
    expect(metricNames).toContain('ReconciliationDryRun');
  });

  // ── emitProvisioningMetrics ────────────────────────────────────────

  it('emits provisioning success metrics with resource count', async () => {
    const { PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
    const service = createService();
    await service.emitProvisioningMetrics({
      accountId: 'acc-1',
      cloudType: 'private' as any,
      success: true,
      durationMs: 2000,
      resourceCount: 5,
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const input = PutMetricDataCommand.mock.calls[0][0];
    const metricNames = input.MetricData.map((d: any) => d.MetricName);
    expect(metricNames).toContain('ProvisioningSuccess');
    expect(metricNames).toContain('ProvisioningResourceCount');
    expect(metricNames).not.toContain('ProvisioningFailureByError');
  });

  it('emits provisioning failure metrics with error code', async () => {
    const { PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
    const service = createService();
    await service.emitProvisioningMetrics({
      accountId: 'acc-1',
      cloudType: 'public' as any,
      success: false,
      durationMs: 500,
      errorCode: 'CFN_TIMEOUT',
    });

    const input = PutMetricDataCommand.mock.calls[0][0];
    const metricNames = input.MetricData.map((d: any) => d.MetricName);
    expect(metricNames).toContain('ProvisioningFailure');
    expect(metricNames).toContain('ProvisioningFailureByError');
    expect(metricNames).not.toContain('ProvisioningResourceCount');
  });

  // ── emitDeprovisioningMetrics ──────────────────────────────────────

  it('emits deprovisioning metrics on success', async () => {
    const { PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
    const service = createService();
    await service.emitDeprovisioningMetrics({
      accountId: 'acc-1',
      cloudType: 'private' as any,
      success: true,
      durationMs: 300,
    });

    const input = PutMetricDataCommand.mock.calls[0][0];
    const metricNames = input.MetricData.map((d: any) => d.MetricName);
    expect(metricNames).toContain('DeprovisioningSuccess');
    expect(metricNames).not.toContain('DeprovisioningFailureByError');
  });

  it('emits deprovisioning failure with error code', async () => {
    const { PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
    const service = createService();
    await service.emitDeprovisioningMetrics({
      accountId: 'acc-1',
      cloudType: 'public' as any,
      success: false,
      durationMs: 100,
      errorCode: 'TABLE_NOT_FOUND',
    });

    const input = PutMetricDataCommand.mock.calls[0][0];
    const metricNames = input.MetricData.map((d: any) => d.MetricName);
    expect(metricNames).toContain('DeprovisioningFailureByError');
  });
});
