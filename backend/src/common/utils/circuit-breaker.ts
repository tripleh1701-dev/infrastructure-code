import { Logger } from '@nestjs/common';

const logger = new Logger('CircuitBreaker');

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerMetrics {
  /** Total successful calls */
  totalSuccess: number;
  /** Total failed calls (counted by predicate) */
  totalFailures: number;
  /** Total calls rejected because the circuit was OPEN */
  totalRejections: number;
  /** Number of times the circuit transitioned to OPEN */
  timesOpened: number;
  /** Number of times the circuit recovered to CLOSED */
  timesClosed: number;
  /** Number of times the circuit entered HALF_OPEN */
  timesHalfOpen: number;
  /** Current state */
  state: CircuitState;
  /** Current consecutive failure count */
  consecutiveFailures: number;
  /** ISO timestamp of last state transition (or null) */
  lastTransitionAt: string | null;
  /** Rejection rate (rejections / total attempts) as 0–1 */
  rejectionRate: number;
}

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Time in ms the circuit stays open before transitioning to half-open. Default: 30000 */
  resetTimeoutMs?: number;
  /** Number of successful calls in half-open state to close the circuit. Default: 2 */
  halfOpenSuccessThreshold?: number;
  /** Optional predicate — only count as circuit failure if true. Default: all errors count */
  countFailureIf?: (error: any) => boolean;
  /** Label for log messages */
  name?: string;
  /** If true, emit structured JSON metric logs on every state transition. Default: true */
  emitMetricLogs?: boolean;
}

export class CircuitBreakerError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is OPEN — downstream service unavailable`);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit Breaker with built-in observability metrics.
 *
 * Emits structured JSON logs (CloudWatch-friendly) on every state transition
 * and tracks counters for success, failure, rejection, and transition events.
 *
 * Retrieve a snapshot via `getMetrics()` or use `logMetricsSummary()` to emit
 * a periodic summary to CloudWatch.
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private halfOpenSuccesses = 0;
  private lastFailureTime = 0;
  private lastTransitionAt: string | null = null;

  // Counters
  private totalSuccess = 0;
  private totalFailures = 0;
  private totalRejections = 0;
  private timesOpened = 0;
  private timesClosed = 0;
  private timesHalfOpen = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenSuccessThreshold: number;
  private readonly countFailureIf: (error: any) => boolean;
  private readonly name: string;
  private readonly emitMetricLogs: boolean;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.halfOpenSuccessThreshold = opts.halfOpenSuccessThreshold ?? 2;
    this.countFailureIf = opts.countFailureIf ?? (() => true);
    this.name = opts.name ?? 'default';
    this.emitMetricLogs = opts.emitMetricLogs ?? true;
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  /** Returns a snapshot of all collected metrics. */
  getMetrics(): CircuitBreakerMetrics {
    const totalAttempts = this.totalSuccess + this.totalFailures + this.totalRejections;
    return {
      totalSuccess: this.totalSuccess,
      totalFailures: this.totalFailures,
      totalRejections: this.totalRejections,
      timesOpened: this.timesOpened,
      timesClosed: this.timesClosed,
      timesHalfOpen: this.timesHalfOpen,
      state: this.state,
      consecutiveFailures: this.failureCount,
      lastTransitionAt: this.lastTransitionAt,
      rejectionRate: totalAttempts > 0 ? this.totalRejections / totalAttempts : 0,
    };
  }

  /** Emits a structured JSON summary log (useful for periodic reporting). */
  logMetricsSummary(): void {
    const metrics = this.getMetrics();
    logger.log(JSON.stringify({
      metric: 'CircuitBreakerSummary',
      breaker: this.name,
      ...metrics,
      rejectionRate: Math.round(metrics.rejectionRate * 10000) / 100, // percent with 2dp
    }));
  }

  /** Manually reset the breaker to CLOSED and clear counters. */
  reset(): void {
    this.transition(CircuitState.CLOSED, 'manual_reset');
    this.failureCount = 0;
    this.halfOpenSuccesses = 0;
  }

  /** Reset only the metric counters (keeps circuit state). */
  resetMetrics(): void {
    this.totalSuccess = 0;
    this.totalFailures = 0;
    this.totalRejections = 0;
    this.timesOpened = 0;
    this.timesClosed = 0;
    this.timesHalfOpen = 0;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if OPEN → maybe transition to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.transition(CircuitState.HALF_OPEN, 'timeout_elapsed');
        this.halfOpenSuccesses = 0;
      } else {
        this.totalRejections++;
        this.emitTransitionLog('REJECTED', { reason: 'circuit_open' });
        throw new CircuitBreakerError(this.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error: any) {
      this.onFailure(error);
      throw error;
    }
  }

  private transition(newState: CircuitState, trigger: string): void {
    const prevState = this.state;
    this.state = newState;
    this.lastTransitionAt = new Date().toISOString();

    if (newState === CircuitState.OPEN) this.timesOpened++;
    if (newState === CircuitState.CLOSED) this.timesClosed++;
    if (newState === CircuitState.HALF_OPEN) this.timesHalfOpen++;

    const level = newState === CircuitState.OPEN ? 'error' : 'log';
    const msg = `[${this.name}] Circuit ${prevState} → ${newState} (trigger: ${trigger})`;
    if (level === 'error') {
      logger.error(msg);
    } else {
      logger.log(msg);
    }

    this.emitTransitionLog('STATE_CHANGE', {
      from: prevState,
      to: newState,
      trigger,
    });
  }

  private emitTransitionLog(event: string, extra: Record<string, any> = {}): void {
    if (!this.emitMetricLogs) return;
    const metrics = this.getMetrics();
    logger.log(JSON.stringify({
      metric: 'CircuitBreakerEvent',
      breaker: this.name,
      event,
      state: metrics.state,
      consecutiveFailures: metrics.consecutiveFailures,
      totalSuccess: metrics.totalSuccess,
      totalFailures: metrics.totalFailures,
      totalRejections: metrics.totalRejections,
      rejectionRate: Math.round(metrics.rejectionRate * 10000) / 100,
      timestamp: new Date().toISOString(),
      ...extra,
    }));
  }

  private onSuccess(): void {
    this.totalSuccess++;
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) {
        this.transition(CircuitState.CLOSED, 'half_open_success');
        this.failureCount = 0;
        this.halfOpenSuccesses = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(error: any): void {
    if (!this.countFailureIf(error)) return;

    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transition(CircuitState.OPEN, `half_open_probe_failed: ${error.message}`);
      return;
    }

    // CLOSED state
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.transition(CircuitState.OPEN, `${this.failureCount}_consecutive_failures`);
    }
  }
}
