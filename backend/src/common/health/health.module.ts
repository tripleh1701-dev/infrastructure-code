import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SesHealthService } from './ses-health.service';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [DynamoDBModule],
  controllers: [HealthController],
  providers: [SesHealthService],
  exports: [SesHealthService],
})
export class HealthModule {}
