import { Module, Global } from '@nestjs/common';
import { DynamoDBService } from './dynamodb.service';
import { DynamoDBRouterService } from './dynamodb-router.service';
import { AccountProvisionerService } from './account-provisioner.service';

@Global()
@Module({
  providers: [
    DynamoDBService,
    DynamoDBRouterService,
    AccountProvisionerService,
  ],
  exports: [
    DynamoDBService,
    DynamoDBRouterService,
    AccountProvisionerService,
  ],
})
export class DynamoDBModule {}
