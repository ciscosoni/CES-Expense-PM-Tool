import { Module } from '@nestjs/common';
import { DashboardsModule } from '../dashboards/dashboards.module.js';
import { PayslipsModule } from '../payslips/payslips.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** P7 — xlsx reporting + BI exports, built on the live dashboard computations. */
@Module({
  imports: [DashboardsModule, PayslipsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
