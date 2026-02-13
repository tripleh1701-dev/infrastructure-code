import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudWatchMetricsService } from './cloudwatch-metrics.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CloudWatchMetricsService],
  exports: [CloudWatchMetricsService],
})
export class MetricsModule {}
