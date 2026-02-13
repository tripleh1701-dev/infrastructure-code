import { Module } from '@nestjs/common';
import { EnterprisesController, EnterpriseProductsController } from './enterprises.controller';
import { EnterprisesService } from './enterprises.service';

@Module({
  controllers: [EnterprisesController, EnterpriseProductsController],
  providers: [EnterprisesService],
  exports: [EnterprisesService],
})
export class EnterprisesModule {}
