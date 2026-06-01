import { Module } from '@nestjs/common';
import { PayslipsController } from './payslips.controller.js';
import { PayslipsService } from './payslips.service.js';

@Module({
  controllers: [PayslipsController],
  providers: [PayslipsService],
  exports: [PayslipsService],
})
export class PayslipsModule {}
