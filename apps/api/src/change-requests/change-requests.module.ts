import { Module } from '@nestjs/common';
import { ChangeRequestsController } from './change-requests.controller.js';
import { ChangeRequestsService } from './change-requests.service.js';

@Module({
  controllers: [ChangeRequestsController],
  providers: [ChangeRequestsService],
  exports: [ChangeRequestsService],
})
export class ChangeRequestsModule {}
