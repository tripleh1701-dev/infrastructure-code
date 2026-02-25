import { Module } from '@nestjs/common';
import { PipelineConfigsController } from './pipeline-configs.controller';
import { PipelineConfigsService } from './pipeline-configs.service';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { BuildsModule } from '../builds/builds.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [PipelinesModule, BuildsModule, CredentialsModule],
  controllers: [PipelineConfigsController],
  providers: [PipelineConfigsService],
  exports: [PipelineConfigsService],
})
export class PipelineConfigsModule {}
