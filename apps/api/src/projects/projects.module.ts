import { Module } from '@nestjs/common';
import { MilestonesController } from './milestones.controller.js';
import { MilestonesService } from './milestones.service.js';
import { PnlController } from './pnl.controller.js';
import { PnlService } from './pnl.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  controllers: [ProjectsController, MilestonesController, PnlController],
  providers: [ProjectsService, MilestonesService, PnlService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
