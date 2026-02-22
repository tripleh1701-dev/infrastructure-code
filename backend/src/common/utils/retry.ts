import { Logger } from '@nestjs/common';

const logger = new Logger('RetryUtil');

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Initial delay in ms before the first retry. Default: 1000 */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 30000 */
  maxDelayMs?: number;
  /** Jitter factor (0–1). Adds random jitter to avoid thundering herd. Default: 0.2 */
  jitterFactor?: number;
  /** Optional predicate — only retry if this returns true for the error. Default: always retry */
  retryIf?: (error: any) => boolean;
  /** Label for log messages */
  label?: string;
}

/**
 * Transient AWS errors worth retrying.
 * Covers throttling, service-unavailable, and intermittent network issues.
 */
const TRANSIENT_ERROR_CODES = new Set([
  'ThrottlingException',
  'TooManyRequestsException',
  'ProvisionedThroughputExceededException',
  'ServiceUnavailable',
  'InternalFailure',
  'InternalServerError',
  'RequestLimitExceeded',
  'Throttling',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'NetworkingError',
]);

/** Returns true for errors that are likely transient and safe to retry. */
export function isTransientAwsError(error: any): boolean {
  if (!error) return false;
  const code = error.name || error.code || error.Code || '';
  if (TRANSIENT_ERROR_CODES.has(code)) return true;
  // Retry on HTTP 5xx status codes
  const status = error.$metadata?.httpStatusCode || error.statusCode;
  if (status && status >= 500 && status < 600) return true;
  // Retry generic network errors
  if (error.message?.includes('ECONNRESET') || error.message?.includes('ETIMEDOUT')) return true;
  return false;
}

/**
 * Execute an async function with exponential backoff and jitter.
 *
 * ```ts
 * const result = await retryWithBackoff(() => cfnClient.send(cmd), {
 *   maxAttempts: 3,
 *   label: 'CreateStack',
 *   retryIf: isTransientAwsError,
 * });
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    jitterFactor = 0.2,
    retryIf = isTransientAwsError,
    label = 'operation',
  } = opts;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (attempt >= maxAttempts || !retryIf(error)) {
        throw error;
      }

      // Exponential backoff: baseDelay * 2^(attempt-1)
      const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      // Add jitter
      const jitter = exponentialDelay * jitterFactor * Math.random();
      const delay = Math.round(exponentialDelay + jitter);

      logger.warn(
        `[${label}] Attempt ${attempt}/${maxAttempts} failed (${error.name || error.code || 'Error'}). ` +
        `Retrying in ${delay}ms...`,
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
