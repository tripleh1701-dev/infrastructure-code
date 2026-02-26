import { Module, forwardRef } from '@nestjs/common';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { YamlParserService } from './yaml-parser.service';
import { DependencyResolverService } from './dependency-resolver.service';
import { StageHandlersService } from './stage-handlers.service';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { InboxModule } from '../inbox/inbox.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { BuildsModule } from '../builds/builds.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { EnvironmentsModule } from '../environments/environments.module';

@Module({
  imports: [
    PipelinesModule,
    forwardRef(() => InboxModule),
    CredentialsModule,
    BuildsModule,
    ConnectorsModule,
    EnvironmentsModule,
  ],
  controllers: [ExecutionsController],
  providers: [
    ExecutionsService,
    YamlParserService,
    DependencyResolverService,
    StageHandlersService,
  ],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}
