import {
  Controller,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AccountGuard } from '../auth/guards/account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Alias controller for DELETE /api/technical-users/:id
 * Used by the frontend's AccountExpandedRow component.
 * Delegates to the UsersService.remove method.
 */
@Controller('technical-users')
@UseGuards(AccountGuard)
export class TechnicalUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
  }
}
