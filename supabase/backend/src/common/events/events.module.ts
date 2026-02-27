import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProvisioningEventsService } from './provisioning-events.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ProvisioningEventsService],
  exports: [ProvisioningEventsService],
})
export class EventsModule {}
