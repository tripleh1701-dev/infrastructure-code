/**
 * AWS Cognito Authentication Client
 *
 * Wraps amazon-cognito-identity-js to provide a clean auth API
 * matching the interface previously provided by Supabase Auth.
 *
 * Environment variables required:
 *   VITE_COGNITO_USER_POOL_ID   – e.g. us-east-1_AbCdEfGhI
 *   VITE_COGNITO_CLIENT_ID      – App client ID (no secret)
 *   VITE_COGNITO_DOMAIN         – (optional) Hosted UI domain for OAuth
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoUserAttribute,
  ISignUpResult,
} from "amazon-cognito-identity-js";

// ─── Pool configuration (lazy) ─────────────────────────────────────────────────
let _userPool: CognitoUserPool | null = null;

function getUserPool(): CognitoUserPool {
  if (!_userPool) {
    const UserPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID || "";
    const ClientId = import.meta.env.VITE_COGNITO_CLIENT_ID || "";
    if (!UserPoolId || !ClientId) {
      throw new Error(
        "Cognito is not configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID environment variables."
      );
    }
    _userPool = new CognitoUserPool({ UserPoolId, ClientId });
  }
  return _userPool;
}

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CognitoAuthUser {
  sub: string;
  email: string;
  emailVerified: boolean;
  accountId: string | null;
  enterpriseId: string | null;
  role: string | null;
  groups: string[];
  rawAttributes: Record<string, string>;
}

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult<T = void> {
  data: T | null;
  error: Error | null;
}

type AuthStateEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "SESSION_EXPIRED";

type AuthStateCallback = (event: AuthStateEvent, user: CognitoAuthUser | null, tokens: CognitoTokens | null) => void;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeCognitoUser(username: string): CognitoUser {
  return new CognitoUser({ Username: username, Pool: getUserPool() });
}

function parseAttributes(attrs: CognitoUserAttribute[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const attr of attrs) {
    map[attr.getName()] = attr.getValue();
  }
  return map;
}

function sessionToTokens(session: CognitoUserSession): CognitoTokens {
  return {
    idToken: session.getIdToken().getJwtToken(),
    accessToken: session.getAccessToken().getJwtToken(),
    refreshToken: session.getRefreshToken().getToken(),
  };
}

function attrsToUser(attrs: Record<string, string>, groups: string[] = []): CognitoAuthUser {
  return {
    sub: attrs["sub"] || "",
    email: attrs["email"] || "",
    emailVerified: attrs["email_verified"] === "true",
    accountId: attrs["custom:account_id"] || null,
    enterpriseId: attrs["custom:enterprise_id"] || null,
    role: attrs["custom:role"] || null,
    groups,
    rawAttributes: attrs,
  };
}

// ─── Cognito Auth Client ────────────────────────────────────────────────────────

class CognitoAuthClient {
  private listeners: Set<AuthStateCallback> = new Set();
  private currentUser: CognitoAuthUser | null = null;
  private currentTokens: CognitoTokens | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Event system ──────────────────────────────────────────────────────────

  onAuthStateChange(callback: AuthStateCallback): { unsubscribe: () => void } {
    this.listeners.add(callback);
    return {
      unsubscribe: () => {
        this.listeners.delete(callback);
      },
    };
  }

  private emit(event: AuthStateEvent, user: CognitoAuthUser | null, tokens: CognitoTokens | null) {
    this.currentUser = user;
    this.currentTokens = tokens;
    for (const cb of this.listeners) {
      try {
        cb(event, user, tokens);
      } catch (e) {
        console.error("[CognitoAuth] Listener error:", e);
      }
    }
  }

  // ── Session management ────────────────────────────────────────────────────

  /**
   * Attempt to restore a session from local storage.
   * Returns the current user/tokens if a valid session exists.
   */
  async getSession(): Promise<AuthResult<{ user: CognitoAuthUser; tokens: CognitoTokens }>> {
    return new Promise((resolve) => {
      const cognitoUser = getUserPool().getCurrentUser();
      if (!cognitoUser) {
        resolve({ data: null, error: null });
        return;
      }

      cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session || !session.isValid()) {
          resolve({ data: null, error: err || new Error("Invalid session") });
          return;
        }

        const tokens = sessionToTokens(session);

        cognitoUser.getUserAttributes((attrErr, attrs) => {
          if (attrErr || !attrs) {
            // Session valid but can't read attrs – still return tokens
            const fallbackUser: CognitoAuthUser = {
              sub: session.getIdToken().payload["sub"] || "",
              email: session.getIdToken().payload["email"] || "",
              emailVerified: session.getIdToken().payload["email_verified"] === true,
              accountId: session.getIdToken().payload["custom:account_id"] || null,
              enterpriseId: session.getIdToken().payload["custom:enterprise_id"] || null,
              role: session.getIdToken().payload["custom:role"] || null,
              groups: session.getIdToken().payload["cognito:groups"] || [],
              rawAttributes: {},
            };
            this.scheduleRefresh(session);
            this.emit("SIGNED_IN", fallbackUser, tokens);
            resolve({ data: { user: fallbackUser, tokens }, error: null });
            return;
          }

          const rawAttrs = parseAttributes(attrs);
          const groups: string[] = session.getIdToken().payload["cognito:groups"] || [];
          const user = attrsToUser(rawAttrs, groups);
          this.scheduleRefresh(session);
          this.emit("SIGNED_IN", user, tokens);
          resolve({ data: { user, tokens }, error: null });
        });
      });
    });
  }

  /**
   * Get the current access/id tokens (refreshes if expired).
   */
  getTokens(): CognitoTokens | null {
    return this.currentTokens;
  }

  /**
   * Get current user (synchronous – may be null if no session).
   */
  getUser(): CognitoAuthUser | null {
    return this.currentUser;
  }

  // ── Sign in ───────────────────────────────────────────────────────────────

  async signIn(email: string, password: string): Promise<AuthResult<{ user: CognitoAuthUser; tokens: CognitoTokens }>> {
    return new Promise((resolve) => {
      const cognitoUser = makeCognitoUser(email);
      const authDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session) => {
          const tokens = sessionToTokens(session);
          const groups: string[] = session.getIdToken().payload["cognito:groups"] || [];

          cognitoUser.getUserAttributes((attrErr, attrs) => {
            const rawAttrs = attrs ? parseAttributes(attrs) : {};
            // Fallback to token payload if getUserAttributes fails
            if (!attrs) {
              rawAttrs["sub"] = session.getIdToken().payload["sub"] || "";
              rawAttrs["email"] = session.getIdToken().payload["email"] || "";
              rawAttrs["email_verified"] = String(session.getIdToken().payload["email_verified"] ?? "false");
              rawAttrs["custom:account_id"] = session.getIdToken().payload["custom:account_id"] || "";
              rawAttrs["custom:enterprise_id"] = session.getIdToken().payload["custom:enterprise_id"] || "";
              rawAttrs["custom:role"] = session.getIdToken().payload["custom:role"] || "";
            }
            const user = attrsToUser(rawAttrs, groups);
            this.scheduleRefresh(session);
            this.emit("SIGNED_IN", user, tokens);
            resolve({ data: { user, tokens }, error: null });
          });
        },

        onFailure: (err) => {
          resolve({ data: null, error: err as Error });
        },

        newPasswordRequired: (_userAttributes, _requiredAttributes) => {
          // Propagate as a specific error so the UI can handle "force change password"
          resolve({
            data: null,
            error: Object.assign(new Error("New password required"), {
              code: "NewPasswordRequired",
              cognitoUser,
            }),
          });
        },

        mfaRequired: (_challengeName, _challengeParameters) => {
          resolve({
            data: null,
            error: Object.assign(new Error("MFA code required"), {
              code: "MFARequired",
              cognitoUser,
            }),
          });
        },
      });
    });
  }

  // ── Complete new-password challenge ───────────────────────────────────────

  async completeNewPassword(
    cognitoUser: CognitoUser,
    newPassword: string
  ): Promise<AuthResult<{ user: CognitoAuthUser; tokens: CognitoTokens }>> {
    return new Promise((resolve) => {
      cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
        onSuccess: (session) => {
          const tokens = sessionToTokens(session);
          const groups: string[] = session.getIdToken().payload["cognito:groups"] || [];

          cognitoUser.getUserAttributes((_err, attrs) => {
            const rawAttrs = attrs ? parseAttributes(attrs) : {};
            const user = attrsToUser(rawAttrs, groups);
            this.scheduleRefresh(session);
            this.emit("SIGNED_IN", user, tokens);
            resolve({ data: { user, tokens }, error: null });
          });
        },
        onFailure: (err) => {
          resolve({ data: null, error: err as Error });
        },
      });
    });
  }

  // ── Sign up ───────────────────────────────────────────────────────────────

  async signUp(
    email: string,
    password: string,
    attributes?: Record<string, string>
  ): Promise<AuthResult<ISignUpResult>> {
    return new Promise((resolve) => {
      const userAttributes: CognitoUserAttribute[] = [
        new CognitoUserAttribute({ Name: "email", Value: email }),
      ];

      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          userAttributes.push(new CognitoUserAttribute({ Name: key, Value: value }));
        }
      }

      getUserPool().signUp(email, password, userAttributes, [], (err, result) => {
        if (err) {
          resolve({ data: null, error: err as Error });
          return;
        }
        resolve({ data: result ?? null, error: null });
      });
    });
  }

  // ── Confirm sign up ──────────────────────────────────────────────────────

  async confirmSignUp(email: string, code: string): Promise<AuthResult> {
    return new Promise((resolve) => {
      const cognitoUser = makeCognitoUser(email);
      cognitoUser.confirmRegistration(code, true, (err) => {
        if (err) {
          resolve({ data: null, error: err as Error });
          return;
        }
        resolve({ data: null, error: null });
      });
    });
  }

  // ── Resend confirmation code ─────────────────────────────────────────────

  async resendConfirmationCode(email: string): Promise<AuthResult> {
    return new Promise((resolve) => {
      const cognitoUser = makeCognitoUser(email);
      cognitoUser.resendConfirmationCode((err) => {
        if (err) {
          resolve({ data: null, error: err as Error });
          return;
        }
        resolve({ data: null, error: null });
      });
    });
  }

  // ── Forgot password ──────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<AuthResult> {
    return new Promise((resolve) => {
      const cognitoUser = makeCognitoUser(email);
      cognitoUser.forgotPassword({
        onSuccess: () => {
          resolve({ data: null, error: null });
        },
        onFailure: (err) => {
          resolve({ data: null, error: err as Error });
        },
      });
    });
  }

  // ── Confirm forgot password (reset with code) ────────────────────────────

  async confirmForgotPassword(
    email: string,
    code: string,
    newPassword: string
  ): Promise<AuthResult> {
    return new Promise((resolve) => {
      const cognitoUser = makeCognitoUser(email);
      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: () => {
          resolve({ data: null, error: null });
        },
        onFailure: (err) => {
          resolve({ data: null, error: err as Error });
        },
      });
    });
  }

  // ── Change password (authenticated) ──────────────────────────────────────

  async changePassword(oldPassword: string, newPassword: string): Promise<AuthResult> {
    return new Promise((resolve) => {
      const cognitoUser = getUserPool().getCurrentUser();
      if (!cognitoUser) {
        resolve({ data: null, error: new Error("No authenticated user") });
        return;
      }

      cognitoUser.getSession((sessionErr: Error | null, session: CognitoUserSession | null) => {
        if (sessionErr || !session) {
          resolve({ data: null, error: sessionErr || new Error("No session") });
          return;
        }

        cognitoUser.changePassword(oldPassword, newPassword, (err) => {
          if (err) {
            resolve({ data: null, error: err as Error });
            return;
          }
          resolve({ data: null, error: null });
        });
      });
    });
  }

  // ── Sign out ──────────────────────────────────────────────────────────────

  signOut(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    const cognitoUser = getUserPool().getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut();
    }

    this.emit("SIGNED_OUT", null, null);
  }

  /**
   * Global sign out – revokes all tokens server-side.
   */
  async globalSignOut(): Promise<AuthResult> {
    return new Promise((resolve) => {
      const cognitoUser = getUserPool().getCurrentUser();
      if (!cognitoUser) {
        this.emit("SIGNED_OUT", null, null);
        resolve({ data: null, error: null });
        return;
      }

      cognitoUser.getSession((sessionErr: Error | null, session: CognitoUserSession | null) => {
        if (sessionErr || !session) {
          cognitoUser.signOut();
          this.emit("SIGNED_OUT", null, null);
          resolve({ data: null, error: null });
          return;
        }

        cognitoUser.globalSignOut({
          onSuccess: () => {
            if (this.refreshTimer) {
              clearTimeout(this.refreshTimer);
              this.refreshTimer = null;
            }
            this.emit("SIGNED_OUT", null, null);
            resolve({ data: null, error: null });
          },
          onFailure: (err) => {
            // Still clear local state
            cognitoUser.signOut();
            this.emit("SIGNED_OUT", null, null);
            resolve({ data: null, error: err as Error });
          },
        });
      });
    });
  }

  // ── Token refresh ─────────────────────────────────────────────────────────

  private scheduleRefresh(session: CognitoUserSession) {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Refresh 5 minutes before expiry
    const expiresAt = session.getAccessToken().getExpiration() * 1000;
    const refreshIn = Math.max(expiresAt - Date.now() - 5 * 60 * 1000, 60_000);

    this.refreshTimer = setTimeout(() => {
      this.refreshSession();
    }, refreshIn);
  }

  private async refreshSession() {
    const cognitoUser = getUserPool().getCurrentUser();
    if (!cognitoUser) {
      this.emit("SESSION_EXPIRED", null, null);
      return;
    }

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        this.emit("SESSION_EXPIRED", null, null);
        return;
      }

      const tokens = sessionToTokens(session);
      const groups: string[] = session.getIdToken().payload["cognito:groups"] || [];

      // Build user from token payload (avoid extra network call on refresh)
      const user: CognitoAuthUser = {
        sub: session.getIdToken().payload["sub"] || "",
        email: session.getIdToken().payload["email"] || "",
        emailVerified: session.getIdToken().payload["email_verified"] === true,
        accountId: session.getIdToken().payload["custom:account_id"] || null,
        enterpriseId: session.getIdToken().payload["custom:enterprise_id"] || null,
        role: session.getIdToken().payload["custom:role"] || null,
        groups,
        rawAttributes: {},
      };

      this.scheduleRefresh(session);
      this.emit("TOKEN_REFRESHED", user, tokens);
    });
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  isConfigured(): boolean {
    try {
      getUserPool();
      return true;
    } catch {
      return false;
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const cognitoAuth = new CognitoAuthClient();
