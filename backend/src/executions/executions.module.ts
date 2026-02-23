import { Module, forwardRef } from '@nestjs/common';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { YamlParserService } from './yaml-parser.service';
import { DependencyResolverService } from './dependency-resolver.service';
import { StageHandlersService } from './stage-handlers.service';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { InboxModule } from '../inbox/inbox.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [PipelinesModule, forwardRef(() => InboxModule), CredentialsModule],
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
