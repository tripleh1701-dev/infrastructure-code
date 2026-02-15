import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { CognitoUserProvisioningService } from '../auth/cognito-user-provisioning.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, CognitoUserProvisioningService],
  exports: [AccountsService],
})
export class AccountsModule {}
