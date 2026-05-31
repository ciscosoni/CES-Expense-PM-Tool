import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/index.js';
import { SchedulerService } from './scheduler.service.js';

@ApiTags('Scheduler')
@ApiBearerAuth()
@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  @Post('run')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Run the scheduled jobs (anomaly sweep + Graph sync) now.' })
  run() {
    return this.scheduler.runAll();
  }
}
