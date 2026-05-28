import { Module } from '@nestjs/common';
import { GradesController } from './grades.controller.js';
import { GradesService } from './grades.service.js';

@Module({
  controllers: [GradesController],
  providers: [GradesService],
  exports: [GradesService],
})
export class GradesModule {}
