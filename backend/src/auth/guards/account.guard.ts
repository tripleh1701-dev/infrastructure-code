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
 * Guard that ensures user can only access resources within their account
 * Used for multi-tenant isolation
 */
@Injectable()
export class AccountGuard implements CanActivate {
  private readonly logger = new Logger(AccountGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: CognitoUser = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Get account_id from request params or body
    const requestAccountId = 
      request.params?.accountId || 
      request.params?.account_id ||
      request.body?.accountId ||
      request.body?.account_id ||
      request.query?.accountId ||
      request.query?.account_id;

    // If no account ID in request, allow (controller handles filtering)
    if (!requestAccountId) {
      return true;
    }

    // Admin users can access any account
    if (user.role === 'admin' || user.groups.includes('admin')) {
      return true;
    }

    // If user's JWT doesn't have account_id claim, allow through
    // (access is determined by technical_user records, not JWT claims;
    //  the controller will resolve the correct account context)
    if (!user.accountId) {
      return true;
    }

    // Check if user's account matches requested account
    if (user.accountId !== requestAccountId) {
      this.logger.warn(
        `Account access denied. User ${user.email} (account: ${user.accountId}) ` +
        `attempted to access account: ${requestAccountId}`,
      );
      throw new ForbiddenException('Access to this account is not permitted');
    }

    return true;
  }
}
