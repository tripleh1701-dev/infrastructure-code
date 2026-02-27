import { CircuitBreaker, CircuitBreakerError, CircuitState } from '../circuit-breaker';

// Suppress logger output during tests
jest.mock('@nestjs/common', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const fail = () => Promise.reject(new Error('downstream failure'));
const succeed = () => Promise.resolve('ok');

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      resetTimeoutMs: 100,
      halfOpenSuccessThreshold: 2,
      emitMetricLogs: false,
    });
  });

  // ── State: CLOSED ──────────────────────────────────────────────────────

  it('starts in CLOSED state', () => {
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('passes through successful calls in CLOSED state', async () => {
    const result = await breaker.execute(succeed);
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('resets consecutive failure count on success', async () => {
    // 2 failures (below threshold of 3)
    await expect(breaker.execute(fail)).rejects.toThrow();
    await expect(breaker.execute(fail)).rejects.toThrow();
    expect(breaker.getFailureCount()).toBe(2);

    // 1 success resets
    await breaker.execute(succeed);
    expect(breaker.getFailureCount()).toBe(0);
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  // ── Transition: CLOSED → OPEN ─────────────────────────────────────────

  it('opens after reaching the failure threshold', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow('downstream failure');
    }
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  // ── State: OPEN ────────────────────────────────────────────────────────

  it('rejects calls immediately when OPEN', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow();
    }

    await expect(breaker.execute(succeed)).rejects.toThrow(CircuitBreakerError);
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  // ── Transition: OPEN → HALF_OPEN ──────────────────────────────────────

  it('transitions to HALF_OPEN after resetTimeout elapses', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 120));

    // Next call should go through (HALF_OPEN)
    const result = await breaker.execute(succeed);
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
  });

  // ── Transition: HALF_OPEN → CLOSED ────────────────────────────────────

  it('closes after enough successes in HALF_OPEN', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow();
    }

    await new Promise((r) => setTimeout(r, 120));

    // 2 successes needed (halfOpenSuccessThreshold)
    await breaker.execute(succeed);
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    await breaker.execute(succeed);
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  // ── Transition: HALF_OPEN → OPEN ──────────────────────────────────────

  it('re-opens on any failure in HALF_OPEN', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow();
    }

    await new Promise((r) => setTimeout(r, 120));

    // First probe succeeds
    await breaker.execute(succeed);
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    // Second probe fails → re-open
    await expect(breaker.execute(fail)).rejects.toThrow('downstream failure');
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  // ── countFailureIf predicate ───────────────────────────────────────────

  it('ignores errors that do not match countFailureIf', async () => {
    const selectiveBreaker = new CircuitBreaker({
      name: 'selective',
      failureThreshold: 2,
      emitMetricLogs: false,
      countFailureIf: (err) => err.message === 'transient',
    });

    const nonTransient = () => Promise.reject(new Error('not-transient'));
    const transient = () => Promise.reject(new Error('transient'));

    // Non-matching errors don't count
    for (let i = 0; i < 5; i++) {
      await expect(selectiveBreaker.execute(nonTransient)).rejects.toThrow();
    }
    expect(selectiveBreaker.getState()).toBe(CircuitState.CLOSED);

    // Matching errors do count
    await expect(selectiveBreaker.execute(transient)).rejects.toThrow();
    await expect(selectiveBreaker.execute(transient)).rejects.toThrow();
    expect(selectiveBreaker.getState()).toBe(CircuitState.OPEN);
  });

  // ── Manual reset ───────────────────────────────────────────────────────

  it('reset() forces CLOSED state', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    breaker.reset();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(breaker.getFailureCount()).toBe(0);

    const result = await breaker.execute(succeed);
    expect(result).toBe('ok');
  });

  // ── Metrics ────────────────────────────────────────────────────────────

  describe('metrics', () => {
    it('tracks success/failure/rejection counts', async () => {
      // 2 successes
      await breaker.execute(succeed);
      await breaker.execute(succeed);

      // 3 failures → opens
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fail)).rejects.toThrow();
      }

      // 1 rejection
      await expect(breaker.execute(succeed)).rejects.toThrow(CircuitBreakerError);

      const m = breaker.getMetrics();
      expect(m.totalSuccess).toBe(2);
      expect(m.totalFailures).toBe(3);
      expect(m.totalRejections).toBe(1);
      expect(m.timesOpened).toBe(1);
      expect(m.state).toBe(CircuitState.OPEN);
      expect(m.consecutiveFailures).toBe(3);
      expect(m.lastTransitionAt).not.toBeNull();
    });

    it('computes rejectionRate correctly', async () => {
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fail)).rejects.toThrow();
      }
      // 2 rejections
      await expect(breaker.execute(succeed)).rejects.toThrow(CircuitBreakerError);
      await expect(breaker.execute(succeed)).rejects.toThrow(CircuitBreakerError);

      const m = breaker.getMetrics();
      // 3 failures + 2 rejections = 5 total, rate = 2/5 = 0.4
      expect(m.rejectionRate).toBeCloseTo(0.4, 5);
    });

    it('returns 0 rejectionRate when no attempts', () => {
      expect(breaker.getMetrics().rejectionRate).toBe(0);
    });

    it('tracks full lifecycle transitions', async () => {
      // CLOSED → OPEN
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fail)).rejects.toThrow();
      }

      // Wait → HALF_OPEN
      await new Promise((r) => setTimeout(r, 120));

      // HALF_OPEN → CLOSED
      await breaker.execute(succeed);
      await breaker.execute(succeed);

      const m = breaker.getMetrics();
      expect(m.timesOpened).toBe(1);
      expect(m.timesHalfOpen).toBe(1);
      expect(m.timesClosed).toBe(1);
      expect(m.state).toBe(CircuitState.CLOSED);
    });

    it('resetMetrics() clears counters but keeps state', async () => {
      await breaker.execute(succeed);
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fail)).rejects.toThrow();
      }

      breaker.resetMetrics();
      const m = breaker.getMetrics();
      expect(m.totalSuccess).toBe(0);
      expect(m.totalFailures).toBe(0);
      expect(m.totalRejections).toBe(0);
      expect(m.timesOpened).toBe(0);
      expect(m.state).toBe(CircuitState.OPEN); // state preserved
    });
  });

  // ── CircuitBreakerError ────────────────────────────────────────────────

  it('CircuitBreakerError has correct name and message', () => {
    const err = new CircuitBreakerError('MyService');
    expect(err.name).toBe('CircuitBreakerError');
    expect(err.message).toContain('MyService');
    expect(err.message).toContain('OPEN');
  });
});
