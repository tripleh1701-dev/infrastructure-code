import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersController } from './users.controller';
import { TechnicalUsersController } from '../builds/technical-users.controller';
import { UsersService } from './users.service';
import { LicenseEnforcementService } from './license-enforcement.service';
import { CognitoUserProvisioningService } from '../auth/cognito-user-provisioning.service';
import { NotificationsModule } from '../common/notifications/notifications.module';

@Module({
  imports: [ConfigModule, NotificationsModule],
  controllers: [UsersController, TechnicalUsersController],
  providers: [UsersService, LicenseEnforcementService, CognitoUserProvisioningService],
  exports: [UsersService, LicenseEnforcementService, CognitoUserProvisioningService],
})
export class UsersModule {}
