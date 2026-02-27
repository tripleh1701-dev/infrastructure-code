import { Module } from '@nestjs/common';
import { IntegrationArtifactsController } from './integration-artifacts.controller';
import { IntegrationArtifactsService } from './integration-artifacts.service';

@Module({
  controllers: [IntegrationArtifactsController],
  providers: [IntegrationArtifactsService],
  exports: [IntegrationArtifactsService],
})
export class IntegrationArtifactsModule {}
