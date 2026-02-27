import { Module, forwardRef } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { ExecutionsModule } from '../executions/executions.module';

@Module({
  imports: [forwardRef(() => ExecutionsModule)],
  controllers: [InboxController],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
