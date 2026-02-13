import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for a route
 * Must be used with RolesGuard
 * 
 * @example
 * @Get('admin')
 * @UseGuards(RolesGuard)
 * @Roles('admin')
 * adminRoute() {
 *   return { message: 'Admin only' };
 * }
 * 
 * @example
 * @Get('moderator')
 * @UseGuards(RolesGuard)
 * @Roles('admin', 'moderator')  // Either role works
 * moderatorRoute() {
 *   return { message: 'Admin or moderator' };
 * }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
