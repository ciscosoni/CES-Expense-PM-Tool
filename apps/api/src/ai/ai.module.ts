import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
