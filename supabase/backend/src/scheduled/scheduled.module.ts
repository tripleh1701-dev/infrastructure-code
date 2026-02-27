// =============================================================================
// Scheduled Tasks Module
// =============================================================================
// Central module for all cron-based background jobs.
// Registers @nestjs/schedule and imports feature modules whose services are
// called by the cron handlers.
// =============================================================================

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { UsersModule } from '../users/users.module';
import { CognitoReconciliationCron } from './cognito-reconciliation.cron';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    UsersModule, // provides UsersService + CognitoUserProvisioningService
  ],
  providers: [CognitoReconciliationCron],
})
export class ScheduledModule {}
