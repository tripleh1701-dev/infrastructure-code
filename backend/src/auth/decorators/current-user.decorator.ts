import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CognitoUser } from '../interfaces/cognito-user.interface';

/**
 * Decorator to extract the current authenticated user from the request
 * 
 * @example
 * // Get full user object
 * @Get('profile')
 * getProfile(@CurrentUser() user: CognitoUser) {
 *   return { email: user.email };
 * }
 * 
 * @example
 * // Get specific property
 * @Get('account')
 * getAccount(@CurrentUser('accountId') accountId: string) {
 *   return { accountId };
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof CognitoUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: CognitoUser = request.user;

    if (!user) {
      return null;
    }

    // If a specific property is requested, return just that
    if (data) {
      return user[data];
    }

    // Otherwise return the full user object
    return user;
  },
);
