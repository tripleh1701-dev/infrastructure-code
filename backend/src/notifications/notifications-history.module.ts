import { Module } from '@nestjs/common';
import { NotificationsHistoryController } from './notifications-history.controller';
import { NotificationsHistoryService } from './notifications-history.service';

@Module({
  controllers: [NotificationsHistoryController],
  providers: [NotificationsHistoryService],
  exports: [NotificationsHistoryService],
})
export class NotificationsHistoryModule {}
