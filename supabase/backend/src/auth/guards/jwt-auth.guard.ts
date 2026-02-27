import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { CognitoService } from '../cognito.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly cognitoService: CognitoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Check if Cognito is configured
    if (!this.cognitoService.isConfigured()) {
      this.logger.warn('Cognito not configured - allowing request (development mode)');
      // In development, allow requests without auth
      // In production, you should throw an error
      const request = context.switchToHttp().getRequest();
      request.user = this.getMockUser();
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // Extract token from header
    const token = this.authService.extractTokenFromHeader(authHeader);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      // Validate token and get user
      const user = await this.authService.validateToken(token);
      
      // Attach user to request
      request.user = user;

      this.logger.debug(`Authenticated user: ${user.email} (${user.sub})`);
      
      return true;
    } catch (error) {
      this.logger.warn(`Authentication failed: ${error.message}`);
      throw new UnauthorizedException(error.message || 'Invalid authentication token');
    }
  }

  /**
   * Mock user for development when Cognito is not configured
   */
  private getMockUser() {
    return {
      sub: 'dev-user-123',
      email: 'dev@example.com',
      username: 'dev-user',
      emailVerified: true,
      accountId: 'dev-account',
      enterpriseId: 'dev-enterprise',
      role: 'admin',
      tokenUse: 'access' as const,
      authTime: Math.floor(Date.now() / 1000),
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      issuer: 'development',
      groups: ['admin'],
      scope: ['openid', 'profile', 'email'],
    };
  }
}
