import { Module } from '@nestjs/common';
import { CostRatesController } from './cost-rates.controller.js';
import { CostRatesService } from './cost-rates.service.js';

@Module({
  controllers: [CostRatesController],
  providers: [CostRatesService],
  exports: [CostRatesService],
})
export class CostRatesModule {}
