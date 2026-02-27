import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';
import { DynamoDBModule } from '../common/dynamodb/dynamodb.module';

@Module({
  imports: [ConfigModule, DynamoDBModule],
  controllers: [ProvisioningController],
  providers: [ProvisioningService],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
