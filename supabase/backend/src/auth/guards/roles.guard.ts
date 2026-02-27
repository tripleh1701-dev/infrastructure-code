import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthService } from '../auth.service';
import { CognitoUser } from '../interfaces/cognito-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get user from request (set by JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user: CognitoUser = request.user;

    if (!user) {
      this.logger.warn('RolesGuard: No user found on request. JwtAuthGuard must run first.');
      throw new ForbiddenException('Access denied');
    }

    // Check if user has any of the required roles
    const hasRole = this.authService.hasAnyRole(user, requiredRoles);

    if (!hasRole) {
      this.logger.warn(
        `Access denied for user ${user.email}. Required: [${requiredRoles.join(', ')}], Has: ${user.role}`,
      );
      throw new ForbiddenException(
        `Access denied. Required role: ${requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
