/**
 * Represents a decoded Cognito user from JWT token
 */
export interface CognitoUser {
  /** Cognito user ID (subject) */
  sub: string;

  /** User email address */
  email: string;

  /** Cognito username */
  username: string;

  /** Whether email is verified */
  emailVerified: boolean;

  /** Custom claim: Account ID for multi-tenancy */
  accountId: string | null;

  /** Custom claim: Enterprise ID for multi-tenancy */
  enterpriseId: string | null;

  /** Custom claim: User role */
  role: string;

  /** Token type (access or id) */
  tokenUse: 'access' | 'id';

  /** Unix timestamp when user authenticated */
  authTime: number;

  /** Unix timestamp when token was issued */
  issuedAt: number;

  /** Unix timestamp when token expires */
  expiresAt: number;

  /** Token issuer (Cognito user pool URL) */
  issuer: string;

  /** Cognito groups the user belongs to */
  groups: string[];

  /** OAuth scopes granted */
  scope: string[];
}

/**
 * Represents the request with attached user
 */
export interface AuthenticatedRequest extends Request {
  user: CognitoUser;
}
