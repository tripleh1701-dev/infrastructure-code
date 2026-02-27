import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CognitoService } from './cognito.service';
import { CognitoUser } from './interfaces/cognito-user.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cognitoService: CognitoService,
  ) {}

  /**
   * Validate a JWT token and return the decoded user
   */
  async validateToken(token: string): Promise<CognitoUser> {
    try {
      const payload = await this.cognitoService.verifyToken(token);
      
      // Map Cognito claims to our user interface
      return this.mapCognitoPayloadToUser(payload);
    } catch (error) {
      this.logger.warn(`Token validation failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');
    
    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }

  /**
   * Map Cognito token payload to CognitoUser interface
   */
  private mapCognitoPayloadToUser(payload: Record<string, any>): CognitoUser {
    return {
      sub: payload.sub,
      email: payload.email || payload['cognito:username'],
      username: payload['cognito:username'] || payload.username,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      
      // Custom claims for multi-tenancy
      accountId: payload['custom:account_id'] || null,
      enterpriseId: payload['custom:enterprise_id'] || null,
      role: payload['custom:role'] || 'user',
      
      // Token metadata
      tokenUse: payload.token_use,
      authTime: payload.auth_time,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
      issuer: payload.iss,
      
      // Additional claims
      groups: payload['cognito:groups'] || [],
      scope: payload.scope?.split(' ') || [],
    };
  }

  /**
   * Check if user has required role
   */
  hasRole(user: CognitoUser, requiredRole: string): boolean {
    return user.role === requiredRole || user.groups.includes(requiredRole);
  }

  /**
   * Check if user has any of the required roles
   */
  hasAnyRole(user: CognitoUser, requiredRoles: string[]): boolean {
    return requiredRoles.some(role => this.hasRole(user, role));
  }

  /**
   * Check if user belongs to specified account
   */
  belongsToAccount(user: CognitoUser, accountId: string): boolean {
    return user.accountId === accountId;
  }

  /**
   * Check if user belongs to specified enterprise
   */
  belongsToEnterprise(user: CognitoUser, enterpriseId: string): boolean {
    return user.enterpriseId === enterpriseId;
  }
}
