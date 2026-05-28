import { Module } from '@nestjs/common';
import { EndCustomersController } from './end-customers.controller.js';
import { EndCustomersService } from './end-customers.service.js';

@Module({
  controllers: [EndCustomersController],
  providers: [EndCustomersService],
  exports: [EndCustomersService],
})
export class EndCustomersModule {}
