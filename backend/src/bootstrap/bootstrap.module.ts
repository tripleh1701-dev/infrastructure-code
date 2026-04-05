import { Module } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service';
import { BootstrapController } from './bootstrap.controller';
import { CognitoBootstrapService } from './cognito-bootstrap.service';
import { HealthModule } from '../common/health/health.module';

@Module({
  imports: [HealthModule],
  providers: [BootstrapService, CognitoBootstrapService],
  controllers: [BootstrapController],
  exports: [BootstrapService, CognitoBootstrapService],
})
export class BootstrapModule {}
