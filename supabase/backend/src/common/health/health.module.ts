import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [DynamoDBModule],
  controllers: [HealthController],
})
export class HealthModule {}
