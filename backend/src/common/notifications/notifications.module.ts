import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { NotificationAuditService } from './notification-audit.service';
import { NotificationAuditController } from './notification-audit.controller';
import { NotificationRetryService } from './notification-retry.service';
import { SnsNotificationService } from './sns-notification.service';
import { HealthModule } from '../health/health.module';

@Global()
@Module({
  imports: [ConfigModule, HealthModule],
  controllers: [NotificationAuditController],
  providers: [NotificationService, NotificationAuditService, NotificationRetryService, SnsNotificationService],
  exports: [NotificationService, NotificationAuditService, NotificationRetryService, SnsNotificationService],
})
export class NotificationsModule {}
