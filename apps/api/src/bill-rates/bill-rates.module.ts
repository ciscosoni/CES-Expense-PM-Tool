import { Module } from '@nestjs/common';
import { BillRatesController } from './bill-rates.controller.js';
import { BillRatesService } from './bill-rates.service.js';

@Module({
  controllers: [BillRatesController],
  providers: [BillRatesService],
  exports: [BillRatesService],
})
export class BillRatesModule {}
