import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AnomaliesModule } from '../anomalies/anomalies.module.js';
import { GraphModule } from '../graph/graph.module.js';
import { SchedulerController } from './scheduler.controller.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [ScheduleModule.forRoot(), AnomaliesModule, GraphModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
})
export class SchedulerModule {}
