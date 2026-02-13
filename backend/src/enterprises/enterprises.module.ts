import { Module } from '@nestjs/common';
import { EnterprisesController } from './enterprises.controller';
import { EnterprisesService } from './enterprises.service';

@Module({
  controllers: [EnterprisesController],
  providers: [EnterprisesService],
  exports: [EnterprisesService],
})
export class EnterprisesModule {}
