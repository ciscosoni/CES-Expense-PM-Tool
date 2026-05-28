import { Module } from '@nestjs/common';
import { TravelController } from './travel.controller.js';
import { TravelRequestsService } from './travel-requests.service.js';
import { TripsService } from './trips.service.js';

@Module({
  controllers: [TravelController],
  providers: [TravelRequestsService, TripsService],
  exports: [TravelRequestsService, TripsService],
})
export class TravelModule {}
