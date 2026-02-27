import { Module } from '@nestjs/common';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';
import { CredentialsModule } from '../credentials/credentials.module';
import { DynamoDBModule } from '../common/dynamodb/dynamodb.module';

@Module({
  imports: [DynamoDBModule, CredentialsModule],
  controllers: [ConnectorsController],
  providers: [ConnectorsService],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
