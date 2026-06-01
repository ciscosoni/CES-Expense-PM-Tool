import { Module } from '@nestjs/common';
import { DashboardsModule } from '../dashboards/dashboards.module.js';
import { ForecastController } from './forecast.controller.js';
import { ForecastService } from './forecast.service.js';

/** P8 — Predictive Intelligence. Feeds live data through @ces/forecast models. */
@Module({
  imports: [DashboardsModule],
  controllers: [ForecastController],
  providers: [ForecastService],
  exports: [ForecastService],
})
export class ForecastModule {}
