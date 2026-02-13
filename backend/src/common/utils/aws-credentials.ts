/**
 * Resolve AWS credentials for SDK clients.
 *
 * In Lambda the execution-role provides credentials automatically via
 * the container environment (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 * **and** AWS_SESSION_TOKEN). If we instantiate a client with only the
 * first two values the SDK will *not* attach the session token and AWS
 * will reject every request with "The security token included in the
 * request is invalid."
 *
 * Rule:
 *  • Running inside Lambda → return `undefined` so the SDK resolves
 *    credentials from the default provider chain (which includes the
 *    session token).
 *  • Running outside Lambda (local dev) **and** explicit keys provided
 *    → return a credentials object.
 */
export function resolveAwsCredentials(
  accessKeyId: string | undefined,
  secretAccessKey: string | undefined,
): { accessKeyId: string; secretAccessKey: string } | undefined {
  // If we're running inside AWS Lambda, NEVER override credentials.
  // The execution role already provides them through the default chain.
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return undefined;
  }

  // Local development: use explicit keys when both are present.
  if (accessKeyId && secretAccessKey) {
    return { accessKeyId, secretAccessKey };
  }

  return undefined;
}
