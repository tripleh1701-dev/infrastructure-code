import { Controller, Get, Put, Body, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthenticatedRequest } from '../auth/interfaces/cognito-user.interface';

@Controller('users/me/preferences')
export class PreferencesController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getPreferences(@Req() req: AuthenticatedRequest) {
    return this.usersService.getPreferences(req.user.sub);
  }

  @Put()
  async updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, any>,
  ) {
    await this.usersService.updatePreferences(req.user.sub, body);
    return { ok: true };
  }
}
