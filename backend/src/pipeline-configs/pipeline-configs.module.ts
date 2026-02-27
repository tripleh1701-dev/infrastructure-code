import { Module } from '@nestjs/common';
import { PipelineConfigsController } from './pipeline-configs.controller';
import { PipelineConfigsService } from './pipeline-configs.service';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { BuildsModule } from '../builds/builds.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { EnvironmentsModule } from '../environments/environments.module';
import { ConnectorsModule } from '../connectors/connectors.module';

@Module({
  imports: [PipelinesModule, BuildsModule, CredentialsModule, EnvironmentsModule, ConnectorsModule],
  controllers: [PipelineConfigsController],
  providers: [PipelineConfigsService],
  exports: [PipelineConfigsService],
})
export class PipelineConfigsModule {}
