import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { NotificationAuditService } from './notification-audit.service';
import { NotificationAuditController } from './notification-audit.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [NotificationAuditController],
  providers: [NotificationService, NotificationAuditService],
  exports: [NotificationService, NotificationAuditService],
})
export class NotificationsModule {}
