export { NotificationService, NotificationResult, NotificationContext } from './notification.service';
export { NotificationsModule } from './notifications.module';
export {
  NotificationAuditService,
  NotificationAuditEntry,
  NotificationDeliveryStatus,
  RecordAuditParams,
  AuditQueryOptions,
  AuditQueryResult,
} from './notification-audit.service';
export { NotificationAuditController } from './notification-audit.controller';
export {
  CredentialEmailParams,
  renderCredentialProvisionedEmail,
} from './templates/credential-provisioned.template';
