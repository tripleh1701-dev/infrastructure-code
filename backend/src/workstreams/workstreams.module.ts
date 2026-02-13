import { Module } from '@nestjs/common';
import { WorkstreamsController } from './workstreams.controller';
import { WorkstreamsService } from './workstreams.service';

@Module({
  controllers: [WorkstreamsController],
  providers: [WorkstreamsService],
  exports: [WorkstreamsService],
})
export class WorkstreamsModule {}
