import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { NotificationAuditService } from './notification-audit.service';
import { NotificationAuditController } from './notification-audit.controller';
import { SnsNotificationService } from './sns-notification.service';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [NotificationAuditController],
  providers: [NotificationService, NotificationAuditService, SnsNotificationService],
  exports: [NotificationService, NotificationAuditService, SnsNotificationService],
})
export class NotificationsModule {}
