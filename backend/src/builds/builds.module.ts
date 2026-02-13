import { Module } from '@nestjs/common';
import { BuildsController } from './builds.controller';
import { BuildsService } from './builds.service';
import { DynamoDBModule } from '../common/dynamodb/dynamodb.module';

@Module({
  imports: [DynamoDBModule],
  controllers: [BuildsController],
  providers: [BuildsService],
  exports: [BuildsService],
})
export class BuildsModule {}
