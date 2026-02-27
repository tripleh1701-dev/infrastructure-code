import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DynamoDBModule } from './common/dynamodb/dynamodb.module';
import { SecretsModule } from './common/secrets/secrets.module';
import { EventsModule } from './common/events/events.module';
import { NotificationsModule } from './common/notifications/notifications.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { EnterprisesModule } from './enterprises/enterprises.module';
import { LicensesModule } from './licenses/licenses.module';
import { WorkstreamsModule } from './workstreams/workstreams.module';
import { RolesModule } from './roles/roles.module';
import { GroupsModule } from './groups/groups.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { ServicesModule } from './services/services.module';
import { ProvisioningModule } from './provisioning/provisioning.module';
import { PipelinesModule } from './pipelines/pipelines.module';
import { ExecutionsModule } from './executions/executions.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { CredentialsModule } from './credentials/credentials.module';
import { BuildsModule } from './builds/builds.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { ScheduledModule } from './scheduled/scheduled.module';
import { EnvironmentsModule } from './environments/environments.module';
import { InboxModule } from './inbox/inbox.module';
import { NotificationsHistoryModule } from './notifications/notifications-history.module';
import { IntegrationArtifactsModule } from './integration-artifacts/integration-artifacts.module';
import { PipelineConfigsModule } from './pipeline-configs/pipeline-configs.module';
import { HealthModule } from './common/health/health.module';

@Module({
  imports: [
    // Load environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Secrets Manager (global, must be early for other modules to use)
    SecretsModule,

    // Event publishing (global, for provisioning notifications)
    EventsModule,

    // Email notifications (global, for credential delivery)
    NotificationsModule,

    // CloudWatch custom metrics (global, for operational visibility)
    MetricsModule,

    // Authentication (must be before other modules for global guard)
    AuthModule,

    // DynamoDB connection
    DynamoDBModule,

    // Day-0 Bootstrap (platform initialization)
    BootstrapModule,

    // Scheduled background jobs (cron)
    ScheduledModule,

    // Feature modules
    AccountsModule,
    EnterprisesModule,
    LicensesModule,
    WorkstreamsModule,
    RolesModule,
    GroupsModule,
    UsersModule,
    ProductsModule,
    ServicesModule,
    PipelinesModule,
    ExecutionsModule,
    ConnectorsModule,
    CredentialsModule,
    BuildsModule,
    EnvironmentsModule,
    InboxModule,
    NotificationsHistoryModule,
    IntegrationArtifactsModule,
    PipelineConfigsModule,
    ProvisioningModule,
    HealthModule,
  ],
})
export class AppModule {}
