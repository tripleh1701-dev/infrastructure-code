import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CognitoUser } from '../interfaces/cognito-user.interface';

/**
 * Guard that ensures user can only access resources within their enterprise
 * Used for multi-tenant isolation at enterprise level
 */
@Injectable()
export class EnterpriseGuard implements CanActivate {
  private readonly logger = new Logger(EnterpriseGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: CognitoUser = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Get enterprise_id from request params or body
    const requestEnterpriseId = 
      request.params?.enterpriseId || 
      request.params?.enterprise_id ||
      request.body?.enterpriseId ||
      request.body?.enterprise_id ||
      request.query?.enterpriseId ||
      request.query?.enterprise_id;

    // If no enterprise ID in request, allow (controller handles filtering)
    if (!requestEnterpriseId) {
      return true;
    }

    // Admin users can access any enterprise
    if (user.role === 'admin' || user.groups.includes('admin')) {
      return true;
    }

    // Check if user's enterprise matches requested enterprise
    if (user.enterpriseId !== requestEnterpriseId) {
      this.logger.warn(
        `Enterprise access denied. User ${user.email} (enterprise: ${user.enterpriseId}) ` +
        `attempted to access enterprise: ${requestEnterpriseId}`,
      );
      throw new ForbiddenException('Access to this enterprise is not permitted');
    }

    return true;
  }
}
